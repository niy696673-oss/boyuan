import type { Request, RequestHandler, Response } from "express";
import pino from "pino";
import { pinoHttp } from "pino-http";
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";
import type { PlatformConfig } from "./config.js";
import type { ModelResult, PlatformTelemetry } from "./contracts.js";

export class PrometheusTelemetry implements PlatformTelemetry {
  private readonly registry = new Registry();
  private readonly searchLatency: Histogram;
  private readonly searchHits: Histogram;
  private readonly modelCalls: Counter;
  private readonly modelLatency: Histogram;
  private readonly modelTokens: Counter;
  private readonly citationTotal: Counter;
  private readonly citationValid: Counter;

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: "boyuan_" });
    this.searchLatency = new Histogram({
      name: "boyuan_search_latency_ms",
      help: "Hybrid retrieval latency",
      labelNames: ["route"],
      buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 5000],
      registers: [this.registry],
    });
    this.searchHits = new Histogram({
      name: "boyuan_search_hit_count",
      help: "Evidence hits per query",
      labelNames: ["route"],
      buckets: [0, 1, 3, 5, 10, 20, 50],
      registers: [this.registry],
    });
    this.modelCalls = new Counter({
      name: "boyuan_model_calls_total",
      help: "Model calls",
      labelNames: ["provider", "model", "success"],
      registers: [this.registry],
    });
    this.modelLatency = new Histogram({
      name: "boyuan_model_latency_ms",
      help: "Model latency",
      labelNames: ["provider", "model"],
      buckets: [50, 100, 250, 500, 1000, 3000, 10_000, 30_000, 60_000],
      registers: [this.registry],
    });
    this.modelTokens = new Counter({
      name: "boyuan_model_tokens_total",
      help: "Model token estimates",
      labelNames: ["provider", "model", "direction"],
      registers: [this.registry],
    });
    this.citationTotal = new Counter({
      name: "boyuan_citations_total",
      help: "Generated citations",
      registers: [this.registry],
    });
    this.citationValid = new Counter({
      name: "boyuan_citations_valid_total",
      help: "Citations linked to visible evidence",
      registers: [this.registry],
    });
  }

  observeSearch(input: { route: string; hits: number; latencyMs: number }) {
    this.searchLatency.labels(input.route).observe(input.latencyMs);
    this.searchHits.labels(input.route).observe(input.hits);
  }
  observeModel(input: ModelResult & { success: boolean }) {
    this.modelCalls
      .labels(input.provider, input.model, String(input.success))
      .inc();
    this.modelLatency
      .labels(input.provider, input.model)
      .observe(input.latencyMs);
    this.modelTokens
      .labels(input.provider, input.model, "input")
      .inc(input.inputTokens);
    this.modelTokens
      .labels(input.provider, input.model, "output")
      .inc(input.outputTokens);
  }
  observeCitation(input: { valid: number; total: number }) {
    this.citationValid.inc(input.valid);
    this.citationTotal.inc(input.total);
  }
  metrics() {
    return this.registry.metrics();
  }
  contentType() {
    return this.registry.contentType;
  }
}

export function createHttpLogger(config: PlatformConfig): RequestHandler {
  const logger = pino({
    level: config.LOG_LEVEL,
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "accessToken",
    ],
  });
  return pinoHttp({
    logger,
    customProps: (req: Request) => ({
      requestId: req.id,
      userId: req.headers["x-authenticated-user"],
    }),
    serializers: {
      req: (req: Request) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.socket?.remoteAddress,
      }),
      res: (res: Response) => ({ statusCode: res.statusCode }),
    },
  });
}
