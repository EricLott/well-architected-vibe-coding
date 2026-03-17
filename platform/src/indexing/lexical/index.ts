import path from "node:path";
import { writeJsonFile, readJsonFile } from "../../shared/fs.js";
import { tokenizeForSearch } from "../../shared/text.js";
import type {
  ChunkRecord,
  RetrievalFilters,
} from "../../shared/types.js";

interface Posting {
  chunkId: string;
  tf: number;
}

export interface LexicalIndexData {
  createdAt: string;
  avgDocLength: number;
  docLengths: Record<string, number>;
  chunkMap: Record<string, ChunkRecord>;
  docFreq: Record<string, number>;
  invertedIndex: Record<string, Posting[]>;
}

export interface RankedChunkResult {
  chunk: ChunkRecord;
  score: number;
}

function toTermFrequency(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  tokens.forEach((token) => {
    map.set(token, (map.get(token) ?? 0) + 1);
  });
  return map;
}

function passesFilters(chunk: ChunkRecord, filters: RetrievalFilters): boolean {
  const metadata = chunk.metadata;
  const checks: Array<keyof RetrievalFilters> = [
    "pillar",
    "doc_group",
    "service_name",
    "workload_name",
    "content_type",
  ];
  for (const field of checks) {
    const acceptedValues = filters[field];
    if (!acceptedValues || acceptedValues.length === 0) {
      continue;
    }
    const metadataValue = metadata[field] as string | null | undefined;
    if (!metadataValue || !acceptedValues.includes(metadataValue)) {
      return false;
    }
  }
  return true;
}

export class LexicalIndexer {
  public buildIndex(chunks: ChunkRecord[]): LexicalIndexData {
    const invertedIndex: Record<string, Posting[]> = {};
    const chunkMap: Record<string, ChunkRecord> = {};
    const docLengths: Record<string, number> = {};
    const docFreq: Record<string, number> = {};

    let totalDocLength = 0;
    for (const chunk of chunks) {
      chunkMap[chunk.chunk_id] = chunk;
      const searchable = [
        chunk.content,
        chunk.metadata.title,
        chunk.metadata.heading_path.join(" "),
      ].join("\n");
      const tokens = tokenizeForSearch(searchable);
      const tfMap = toTermFrequency(tokens);
      const docLength = tokens.length || 1;
      docLengths[chunk.chunk_id] = docLength;
      totalDocLength += docLength;

      for (const [term, tf] of tfMap.entries()) {
        if (!invertedIndex[term]) {
          invertedIndex[term] = [];
        }
        invertedIndex[term].push({ chunkId: chunk.chunk_id, tf });
      }
    }

    Object.entries(invertedIndex).forEach(([term, postings]) => {
      postings.sort((a, b) => a.chunkId.localeCompare(b.chunkId));
      docFreq[term] = postings.length;
    });

    const avgDocLength =
      chunks.length > 0 ? totalDocLength / chunks.length : 1;

    return {
      createdAt: new Date().toISOString(),
      avgDocLength,
      docLengths,
      chunkMap,
      docFreq,
      invertedIndex,
    };
  }

  public async writeToDisk(
    repositoryRoot: string,
    artifactsRoot: string,
    indexData: LexicalIndexData,
  ): Promise<string> {
    const outputPath = path.resolve(
      repositoryRoot,
      artifactsRoot,
      "indexes/lexical_index.json",
    );
    await writeJsonFile(outputPath, indexData);
    return outputPath;
  }

  public async loadFromDisk(
    repositoryRoot: string,
    artifactsRoot: string,
  ): Promise<LexicalIndexData> {
    const filePath = path.resolve(
      repositoryRoot,
      artifactsRoot,
      "indexes/lexical_index.json",
    );
    return readJsonFile<LexicalIndexData>(filePath);
  }
}

export class LexicalSearcher {
  private readonly k1 = 1.2;
  private readonly b = 0.75;

  constructor(private readonly indexData: LexicalIndexData) {}

  public search(input: {
    query: string;
    filters?: RetrievalFilters;
    topK: number;
  }): RankedChunkResult[] {
    const queryTerms = tokenizeForSearch(input.query);
    if (queryTerms.length === 0) {
      return [];
    }

    const scoreMap = new Map<string, number>();
    const totalDocs = Object.keys(this.indexData.chunkMap).length || 1;
    const uniqueTerms = [...new Set(queryTerms)];

    for (const term of uniqueTerms) {
      const postings = this.indexData.invertedIndex[term] ?? [];
      if (postings.length === 0) {
        continue;
      }
      const df = this.indexData.docFreq[term] ?? 1;
      const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));

      postings.forEach((posting) => {
        const chunk = this.indexData.chunkMap[posting.chunkId];
        if (!chunk) {
          return;
        }
        if (input.filters && !passesFilters(chunk, input.filters)) {
          return;
        }
        const dl = this.indexData.docLengths[posting.chunkId] ?? 1;
        const tf = posting.tf;
        const denominator =
          tf +
          this.k1 * (1 - this.b + this.b * (dl / this.indexData.avgDocLength));
        const scoreContribution = idf * ((tf * (this.k1 + 1)) / denominator);
        scoreMap.set(
          posting.chunkId,
          (scoreMap.get(posting.chunkId) ?? 0) + scoreContribution,
        );
      });
    }

    return [...scoreMap.entries()]
      .map(([chunkId, score]) => ({
        chunk: this.indexData.chunkMap[chunkId],
        score,
      }))
      .filter((entry) => Boolean(entry.chunk))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.chunk.chunk_id.localeCompare(b.chunk.chunk_id);
      })
      .slice(0, input.topK);
  }
}
