const WORD_REGEX = /[a-zA-Z0-9_:-]+/g;

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export function normalizeWhitespace(value: string): string {
  return normalizeLineEndings(value).replace(/[ \t]+/g, " ").trim();
}

export function estimateTokenCount(value: string): number {
  const matches = normalizeLineEndings(value).match(WORD_REGEX);
  const wordCount = matches ? matches.length : 0;
  return Math.max(1, Math.ceil(wordCount * 1.15));
}

export function tokenizeForSearch(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .replace(/[`*_~[\](){}.,;:!?/\\|'"=+<>@#$%^&]/g, " ");
  const tokens = normalized.match(/[a-z0-9-]{2,}/g) ?? [];
  return tokens;
}

export function splitIntoParagraphs(markdown: string): string[] {
  return normalizeLineEndings(markdown)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
