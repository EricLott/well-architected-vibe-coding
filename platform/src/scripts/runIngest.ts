import path from "node:path";
import { runIngestionPipeline } from "../ingestion/pipeline.js";

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(process.cwd(), "..");
  const result = await runIngestionPipeline({ repositoryRoot });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result.summary, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
