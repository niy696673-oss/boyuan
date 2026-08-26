// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { loadPlatformWorkerOptions } from "../server/research-platform/worker-config.js";
import { createPlatformWorker } from "../server/research-platform/platform-worker.js";

describe("research platform worker configuration", () => {
  it("uses the worker defaults when environment variables are absent", () => {
    expect(loadPlatformWorkerOptions({})).toEqual({
      batchSize: 10,
      concurrency: 1,
    });
  });

  it.each([1, 42, 100])("accepts batch size %s", (batchSize) => {
    expect(
      loadPlatformWorkerOptions({
        BOYUAN_RESEARCH_WORKER_BATCH_SIZE: String(batchSize),
      }),
    ).toMatchObject({ batchSize });
  });

  it.each(["", "0", "101", "1.5", "invalid"])(
    "fails fast for invalid batch size %j",
    (batchSize) => {
      expect(() =>
        loadPlatformWorkerOptions({
          BOYUAN_RESEARCH_WORKER_BATCH_SIZE: batchSize,
        }),
      ).toThrow(
        "BOYUAN_RESEARCH_WORKER_BATCH_SIZE must be an integer between 1 and 100",
      );
    },
  );
});

describe("research platform worker", () => {
  it("runs the configured number of queues concurrently without duplicating timer runs", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let active = 0;
    let maximumActive = 0;
    const runPendingSteps = vi.fn(async (_limit: number) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await gate;
      active -= 1;
      return 1;
    });
    const platform = { runPendingSteps } as unknown as PlatformModule;
    const worker = createPlatformWorker(platform, {
      intervalMs: 60_000,
      batchSize: 10,
      concurrency: 4,
    });

    try {
      await vi.waitFor(() => expect(runPendingSteps).toHaveBeenCalledTimes(4));
      const sharedRun = worker.runNow();
      expect(runPendingSteps).toHaveBeenCalledTimes(4);
      release?.();
      await expect(sharedRun).resolves.toBe(4);
      expect(maximumActive).toBe(4);
      expect(runPendingSteps.mock.calls.map(([limit]) => limit)).toEqual([3, 3, 2, 2]);
    } finally {
      worker.stop();
      release?.();
    }
  });

  it("does not start more queues than the configured total batch size", async () => {
    const runPendingSteps = vi.fn(async (_limit: number) => 1);
    const platform = { runPendingSteps } as unknown as PlatformModule;
    const worker = createPlatformWorker(platform, {
      intervalMs: 60_000,
      batchSize: 1,
      concurrency: 4,
    });

    try {
      await vi.waitFor(() => expect(runPendingSteps).toHaveBeenCalledTimes(1));
      expect(runPendingSteps.mock.calls.map(([limit]) => limit)).toEqual([1]);
    } finally {
      worker.stop();
    }
  });

  it.each([0, 9, 1.5])("rejects invalid concurrency %s", (concurrency) => {
    expect(() => createPlatformWorker({} as PlatformModule, { concurrency }))
      .toThrow("platform_worker_concurrency_invalid");
  });
});
