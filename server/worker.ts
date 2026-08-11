import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadConfig } from "./platform/config.js";
import { Database } from "./platform/database.js";
import { DocumentProcessor } from "./platform/document-processor.js";
import { DOCUMENT_QUEUE } from "./platform/jobs.js";
import { PostgresHybridSearch } from "./platform/search.js";
import { createObjectStorage } from "./platform/storage.js";
import { initialStoreData, Store } from "./store.js";

const config = loadConfig();
if (config.PLATFORM_MODE !== "production")
  throw new Error("Worker 仅在 PLATFORM_MODE=production 下启动");
const database = new Database(config);
await database.ping();
await database.migrate();
const storage = createObjectStorage(config);
await storage.ensureBucket();
const state = (await database.loadPlatformState()) || initialStoreData();
const store = new Store({
  initialData: state,
  onSave: (data) => database.savePlatformState(data),
});
const processor = new DocumentProcessor(
  store,
  storage,
  new PostgresHybridSearch(database),
  database,
);

const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const worker = new Worker(
  DOCUMENT_QUEUE,
  async (job) => processor.process(job.data),
  {
    connection: redis,
    concurrency: 4,
    limiter: { max: 20, duration: 1000 },
  },
);

worker.on("completed", (job) =>
  console.log(JSON.stringify({ event: "document.completed", jobId: job.id })),
);
worker.on("failed", (job, error) =>
  console.error(
    JSON.stringify({
      event: "document.failed",
      jobId: job?.id,
      error: error.message,
    }),
  ),
);

async function shutdown() {
  await worker.close();
  await store.flush();
  await redis.quit();
  await database.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
