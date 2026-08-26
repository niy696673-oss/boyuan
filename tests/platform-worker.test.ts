// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createPlatformWorker } from "../server/research-platform/platform-worker.js";

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
      expect(runPendingSteps.mock.calls.map(([limit]) => limit)).toEqual([3, 3, 3, 3]);
    } finally {
      worker.stop();
      release?.();
    }
  });

  it.each([0, 9, 1.5])("rejects invalid concurrency %s", (concurrency) => {
    expect(() => createPlatformWorker({} as PlatformModule, { concurrency }))
      .toThrow("platform_worker_concurrency_invalid");
  });
});
