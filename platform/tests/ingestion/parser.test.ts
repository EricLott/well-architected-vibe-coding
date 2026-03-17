import { describe, expect, it } from "vitest";
import { parseMarkdownContent } from "../../src/ingestion/parser/index.js";
import type { SourceFile } from "../../src/shared/types.js";

describe("parser", () => {
  it("parses front matter and heading paths", () => {
    const source: SourceFile = {
      absolutePath: "/tmp/sample.md",
      repoRelativePath: "well-architected/reliability/sample.md",
      docsRelativePath: "reliability/sample.md",
    };

    const markdown = `---
title: Sample title
ms.topic: concept-article
ms.date: 03/17/2026
ms.author: sample
---

# Root heading

Intro paragraph.

## Child heading

Child paragraph with [local link](./child.md) and [external](https://example.com).

### Grandchild

More content.
`;

    const parsed = parseMarkdownContent(markdown, source, "2026-03-17T12:00:00.000Z");

    expect(parsed.title).toBe("Sample title");
    expect(parsed.frontMatter["ms.topic"]).toBe("concept-article");
    expect(parsed.headings.map((heading) => heading.path.join(" > "))).toEqual([
      "Root heading",
      "Root heading > Child heading",
      "Root heading > Child heading > Grandchild",
    ]);
    expect(parsed.localLinks).toEqual(["./child.md"]);
    expect(parsed.sections.length).toBeGreaterThanOrEqual(2);
  });
});
