import { shortHash } from "../../shared/hash.js";
import { estimateTokenCount, normalizeLineEndings } from "../../shared/text.js";
import type {
  ChunkDraft,
  ChunkingConfig,
  ParsedDocument,
  ParsedSection,
} from "../../shared/types.js";

interface TextUnit {
  text: string;
  hasTable: boolean;
  hasCallout: boolean;
}

const LIST_LINE_REGEX = /^\s*(?:[-*+]|\d+\.)\s+/;

function isTableLine(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line.trim());
}

function isCalloutLine(line: string): boolean {
  return /^\s*>\s*\[!/.test(line);
}

function isBlockquoteLine(line: string): boolean {
  return /^\s*>/.test(line);
}

function splitOversizedTextUnit(unit: TextUnit, softMaxTokens: number): TextUnit[] {
  if (estimateTokenCount(unit.text) <= softMaxTokens || unit.hasTable) {
    return [unit];
  }

  const paragraphs = unit.text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  if (paragraphs.length <= 1) {
    return [unit];
  }

  const result: TextUnit[] = [];
  let buffer: string[] = [];
  let bufferTokens = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokenCount(paragraph);
    if (
      buffer.length > 0 &&
      bufferTokens + paragraphTokens > softMaxTokens
    ) {
      result.push({
        text: buffer.join("\n\n"),
        hasTable: unit.hasTable,
        hasCallout: unit.hasCallout,
      });
      buffer = [];
      bufferTokens = 0;
    }
    buffer.push(paragraph);
    bufferTokens += paragraphTokens;
  }

  if (buffer.length > 0) {
    result.push({
      text: buffer.join("\n\n"),
      hasTable: unit.hasTable,
      hasCallout: unit.hasCallout,
    });
  }

  return result;
}

function splitTableByRows(
  lines: string[],
  targetMaxTokens: number,
): TextUnit[] {
  const cleanLines = lines.map((line) => line.trim()).filter(Boolean);
  if (cleanLines.length <= 3) {
    return [
      {
        text: cleanLines.join("\n"),
        hasTable: true,
        hasCallout: false,
      },
    ];
  }

  const headerLines = cleanLines.slice(0, 2);
  const rowLines = cleanLines.slice(2);
  const result: TextUnit[] = [];
  let rowBuffer: string[] = [];
  let rowBufferTokens = estimateTokenCount(headerLines.join("\n"));

  for (const rowLine of rowLines) {
    const rowTokens = estimateTokenCount(rowLine);
    if (
      rowBuffer.length > 0 &&
      rowBufferTokens + rowTokens > targetMaxTokens
    ) {
      result.push({
        text: [...headerLines, ...rowBuffer].join("\n"),
        hasTable: true,
        hasCallout: false,
      });
      rowBuffer = [];
      rowBufferTokens = estimateTokenCount(headerLines.join("\n"));
    }
    rowBuffer.push(rowLine);
    rowBufferTokens += rowTokens;
  }

  if (rowBuffer.length > 0) {
    result.push({
      text: [...headerLines, ...rowBuffer].join("\n"),
      hasTable: true,
      hasCallout: false,
    });
  }

  return result;
}

function sectionToUnits(
  section: ParsedSection,
  chunking: ChunkingConfig,
): TextUnit[] {
  const lines = normalizeLineEndings(section.markdown).split("\n");
  const units: TextUnit[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isTableLine(line)) {
      const tableLines: string[] = [];
      while (index < lines.length && isTableLine(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      const tableUnits = splitTableByRows(tableLines, chunking.targetMaxTokens);
      units.push(...tableUnits);
      continue;
    }

    if (isBlockquoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isBlockquoteLine(lines[index])) {
        quoteLines.push(lines[index]);
        index += 1;
      }
      units.push({
        text: quoteLines.join("\n").trim(),
        hasTable: false,
        hasCallout: quoteLines.some((quoteLine) => isCalloutLine(quoteLine)),
      });
      continue;
    }

    if (LIST_LINE_REGEX.test(line)) {
      const listLines: string[] = [];
      while (
        index < lines.length &&
        (LIST_LINE_REGEX.test(lines[index]) ||
          /^\s{2,}\S+/.test(lines[index]) ||
          lines[index].trim() === "")
      ) {
        listLines.push(lines[index]);
        index += 1;
      }
      units.push({
        text: listLines.join("\n").trim(),
        hasTable: false,
        hasCallout: false,
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isTableLine(lines[index]) &&
      !LIST_LINE_REGEX.test(lines[index]) &&
      !/^\s*>/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    units.push({
      text: paragraphLines.join("\n").trim(),
      hasTable: false,
      hasCallout: false,
    });
  }

  const splitUnits: TextUnit[] = [];
  units.forEach((unit) => {
    splitUnits.push(...splitOversizedTextUnit(unit, chunking.softMaxTokens));
  });
  return splitUnits;
}

function mergeSmallChunks(
  chunks: ChunkDraft[],
  chunking: ChunkingConfig,
): ChunkDraft[] {
  const merged: ChunkDraft[] = [];
  for (const chunk of chunks) {
    const last = merged[merged.length - 1];
    if (
      last &&
      chunk.tokenCountEstimate < chunking.softMinTokens &&
      last.sectionOrder === chunk.sectionOrder &&
      last.tokenCountEstimate + chunk.tokenCountEstimate <= chunking.softMaxTokens
    ) {
      const content = `${last.content}\n\n${chunk.content}`.trim();
      last.content = content;
      last.tokenCountEstimate = estimateTokenCount(content);
      last.hasTable = last.hasTable || chunk.hasTable;
      last.hasCallout = last.hasCallout || chunk.hasCallout;
      continue;
    }
    merged.push({ ...chunk });
  }
  return merged;
}

function createChunkId(
  repoRelativePath: string,
  headingPath: string[],
  sectionOrder: number,
  chunkOrderInSection: number,
  content: string,
): string {
  const headingKey = headingPath.join(" > ") || "untitled-section";
  const contentHash = shortHash(content, 10);
  return `${repoRelativePath}::${headingKey}::${sectionOrder}-${chunkOrderInSection}::${contentHash}`;
}

export function chunkDocument(
  parsed: ParsedDocument,
  chunking: ChunkingConfig,
): ChunkDraft[] {
  const drafts: ChunkDraft[] = [];

  parsed.sections.forEach((section) => {
    const units = sectionToUnits(section, chunking);
    if (units.length === 0) {
      return;
    }

    let chunkOrderInSection = 0;
    let buffer: TextUnit[] = [];
    let bufferTokenCount = 0;

    function flushBuffer(): void {
      if (buffer.length === 0) {
        return;
      }
      chunkOrderInSection += 1;
      const content = buffer.map((unit) => unit.text).join("\n\n").trim();
      const tokenCountEstimate = estimateTokenCount(content);
      drafts.push({
        sectionOrder: section.sectionOrder,
        chunkOrderInSection,
        headingPath: [...section.headingPath],
        headingLevel: section.headingLevel,
        content,
        tokenCountEstimate,
        hasTable: buffer.some((unit) => unit.hasTable),
        hasCallout: buffer.some((unit) => unit.hasCallout),
        linkTargetsLocal: [],
      });
      buffer = [];
      bufferTokenCount = 0;
    }

    for (const unit of units) {
      const unitTokens = estimateTokenCount(unit.text);
      const shouldFlush =
        buffer.length > 0 &&
        bufferTokenCount + unitTokens > chunking.targetMaxTokens &&
        bufferTokenCount >= chunking.softMinTokens;

      if (shouldFlush) {
        flushBuffer();
      }

      buffer.push(unit);
      bufferTokenCount += unitTokens;

      if (bufferTokenCount >= chunking.softMaxTokens) {
        flushBuffer();
      }
    }

    flushBuffer();
  });

  return mergeSmallChunks(drafts, chunking);
}

export function withDeterministicChunkIds(
  parsed: ParsedDocument,
  drafts: ChunkDraft[],
): ChunkDraft[] {
  return drafts.map((draft) => {
    const chunkId = createChunkId(
      parsed.source.repoRelativePath,
      draft.headingPath,
      draft.sectionOrder,
      draft.chunkOrderInSection,
      draft.content,
    );
    return {
      ...draft,
      chunkId,
      linkTargetsLocal: [...draft.linkTargetsLocal],
    };
  });
}
