import path from "node:path";
import { createApiServer } from "../api/server.js";

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(process.cwd(), "..");
  const server = await createApiServer({ repositoryRoot });
  server.listen(4000);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
