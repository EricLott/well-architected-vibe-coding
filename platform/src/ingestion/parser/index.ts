import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { normalizeLineEndings } from "../../shared/text.js";
import type {
  HeadingInfo,
  ParsedDocument,
  ParsedSection,
  SourceFile,
} from "../../shared/types.js";

const HEADING_REGEX = /^(#{1,6})\s+(.+?)\s*$/;
const LINK_REGEX = /\[[^\]]+\]\(([^)]+)\)/g;

function normalizeHeadingText(raw: string): string {
  return raw
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/`/g, "")
    .trim();
}

function extractLocalLinks(content: string): string[] {
  const links = new Set<string>();
  const normalized = normalizeLineEndings(content);
  for (const match of normalized.matchAll(LINK_REGEX)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith("#")) {
      continue;
    }
    const cleaned = raw
      .replace(/\s+".*$/, "")
      .replace(/\s+'.*$/, "")
      .trim();
    if (
      cleaned.startsWith("http://") ||
      cleaned.startsWith("https://") ||
      cleaned.startsWith("mailto:") ||
      cleaned.startsWith("/")
    ) {
      continue;
    }
    const withoutFragment = cleaned.split("#")[0]?.trim() ?? "";
    if (!withoutFragment) {
      continue;
    }
    links.add(withoutFragment);
  }
  return [...links].sort((a, b) => a.localeCompare(b));
}

function extractHeadings(body: string): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  const stack: Array<{ level: number; text: string }> = [];
  const lines = normalizeLineEndings(body).split("\n");

  lines.forEach((line, index) => {
    const match = line.match(HEADING_REGEX);
    if (!match) {
      return;
    }
    const level = match[1].length;
    const text = normalizeHeadingText(match[2]);
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    stack.push({ level, text });
    headings.push({
      level,
      text,
      line: index + 1,
      path: stack.map((item) => item.text),
    });
  });

  return headings;
}

function buildSections(body: string, title: string, headings: HeadingInfo[]): ParsedSection[] {
  const normalizedBody = normalizeLineEndings(body);
  const lines = normalizedBody.split("\n");
  const sections: ParsedSection[] = [];
  let sectionOrder = 0;

  if (headings.length === 0) {
    const markdown = normalizedBody.trim();
    if (!markdown) {
      return [];
    }
    return [
      {
        sectionOrder: 1,
        headingLevel: 1,
        headingText: title,
        headingPath: [title],
        markdown,
        lineStart: 1,
        lineEnd: lines.length,
      },
    ];
  }

  const firstHeading = headings[0];
  if (firstHeading.line > 1) {
    const preface = lines.slice(0, firstHeading.line - 1).join("\n").trim();
    if (preface) {
      sectionOrder += 1;
      sections.push({
        sectionOrder,
        headingLevel: 0,
        headingText: "Introduction",
        headingPath: [title, "Introduction"],
        markdown: preface,
        lineStart: 1,
        lineEnd: firstHeading.line - 1,
      });
    }
  }

  headings.forEach((heading, index) => {
    const startLine = heading.line + 1;
    const nextHeadingLine =
      index + 1 < headings.length ? headings[index + 1].line : lines.length + 1;
    const endLine = nextHeadingLine - 1;
    const markdown = lines.slice(startLine - 1, endLine).join("\n").trim();
    if (!markdown) {
      return;
    }
    sectionOrder += 1;
    sections.push({
      sectionOrder,
      headingLevel: heading.level,
      headingText: heading.text,
      headingPath: heading.path,
      markdown,
      lineStart: startLine,
      lineEnd: endLine,
    });
  });

  return sections;
}

export function parseMarkdownContent(
  content: string,
  source: SourceFile,
  lastModified: string,
): ParsedDocument {
  const parsed = matter(content);
  const frontMatter = (parsed.data ?? {}) as Record<string, unknown>;
  const body = normalizeLineEndings(parsed.content).trim();
  const headings = extractHeadings(body);
  const titleFromFrontMatter =
    typeof frontMatter.title === "string" ? frontMatter.title.trim() : "";
  const fallbackTitle =
    headings.find((heading) => heading.level === 1)?.text ??
    path.basename(source.repoRelativePath, ".md");
  const title = titleFromFrontMatter || fallbackTitle;

  return {
    source,
    frontMatter,
    title,
    rawBody: body,
    headings,
    sections: buildSections(body, title, headings),
    localLinks: extractLocalLinks(body),
    lastModified,
  };
}

export async function parseSourceFile(source: SourceFile): Promise<ParsedDocument> {
  const [content, stats] = await Promise.all([
    fs.readFile(source.absolutePath, "utf8"),
    fs.stat(source.absolutePath),
  ]);
  return parseMarkdownContent(content, source, stats.mtime.toISOString());
}

export async function parseSourceFiles(files: SourceFile[]): Promise<ParsedDocument[]> {
  const parsed: ParsedDocument[] = [];
  for (const file of files) {
    parsed.push(await parseSourceFile(file));
  }
  return parsed;
}
