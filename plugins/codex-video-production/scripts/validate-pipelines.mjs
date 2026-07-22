import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPipelines } from "../src/pipeline-contract.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pipelinesDir = path.join(projectRoot, "skills", "video-production", "pipelines");
const loaded = await discoverPipelines(pipelinesDir);

if (loaded.length === 0) throw new Error("At least one Pipeline is required");
for (const { pipeline } of loaded) {
  process.stdout.write(`Pipeline valid: ${pipeline.id} (${pipeline.stages.length} stages)\n`);
}
