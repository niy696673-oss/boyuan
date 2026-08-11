import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { PlatformConfig } from "./config.js";
import type { DocumentJobs, ParseJobPayload } from "./contracts.js";
import type { DocumentProcessor } from "./document-processor.js";

export const DOCUMENT_QUEUE = "document-parse";

export class InlineDocumentJobs implements DocumentJobs {
  constructor(private readonly processor: DocumentProcessor) {}
  async enqueue(payload: ParseJobPayload) {
    await this.processor.process(payload);
    return `inline:${payload.documentId}`;
  }
  async close() {
    return;
  }
}

export class BullDocumentJobs implements DocumentJobs {
  private readonly queue: Queue<ParseJobPayload>;
  private readonly connection: Redis;
  constructor(config: PlatformConfig) {
    this.connection = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<ParseJobPayload>(DOCUMENT_QUEUE, {
      connection: this.connection,
    });
  }
  async enqueue(payload: ParseJobPayload) {
    const job = await this.queue.add("parse", payload, {
      jobId: payload.documentId,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    });
    return String(job.id);
  }
  async close() {
    await this.queue.close();
    await this.connection.quit();
  }
}
