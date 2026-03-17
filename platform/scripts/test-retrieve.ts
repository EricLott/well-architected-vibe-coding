const DEFAULT_URL = "http://localhost:3000/retrieve";

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[test:retrieve] ${message}`);
}

function fail(message: string, error?: unknown): never {
  // eslint-disable-next-line no-console
  console.error(`[test:retrieve] ERROR: ${message}`);
  if (error) {
    // eslint-disable-next-line no-console
    console.error(error);
  }
  throw new Error(message);
}

async function run(): Promise<void> {
  log("calling local retrieval endpoint...");
  const response = await fetch(DEFAULT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "authentication strategy for small SaaS",
      topK: 5,
      filters: {
        pillar: ["security"],
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    fail(
      `API returned HTTP ${response.status}. Ensure the API is running (npm run dev) and index exists (npm run ingest). Response: ${body}`,
    );
  }

  const payload = (await response.json()) as {
    results?: Array<{ score: number; citation: { source_path: string; title: string } }>;
  };
  const results = payload.results ?? [];
  log(`received ${results.length} results`);

  results.slice(0, 5).forEach((result, index) => {
    // eslint-disable-next-line no-console
    console.log(
      `[test:retrieve] #${index + 1} score=${result.score.toFixed(3)} source=${result.citation.source_path} title=${result.citation.title}`,
    );
  });

  if (results.length === 0) {
    fail("Retrieval call succeeded but returned no results.");
  }

  log("complete");
}

run().catch((error) => fail("retrieval smoke test failed.", error));
