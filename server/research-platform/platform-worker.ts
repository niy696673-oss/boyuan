import type { PlatformModule } from './contracts.js';

export interface PlatformWorker {
  runNow(): Promise<number>;
  stop(): void;
}

export function createPlatformWorker(
  platform: PlatformModule,
  options: {
    intervalMs?: number;
    batchSize?: number;
    concurrency?: number;
    onError?: (error: unknown) => void;
  } = {},
): PlatformWorker {
  const intervalMs = options.intervalMs ?? 500;
  const batchSize = options.batchSize ?? 10;
  const concurrency = options.concurrency ?? 1;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error('platform_worker_concurrency_invalid');
  }
  const onError = options.onError ?? (() => undefined);
  let stopped = false;
  let active: Promise<number> | undefined;

  const runNow = (): Promise<number> => {
    if (stopped) return Promise.resolve(0);
    if (active) return active;
    const workerBatchSize = Math.max(1, Math.ceil(batchSize / concurrency));
    active = Promise.all(Array.from({ length: concurrency }, () => (
      platform.runPendingSteps(workerBatchSize).catch((error) => {
        onError(error);
        return 0;
      })
    ))).then((counts) => counts.reduce((sum, count) => sum + count, 0)).finally(() => {
      active = undefined;
    });
    return active;
  };

  const timer = setInterval(() => { void runNow(); }, intervalMs);
  timer.unref();
  void runNow();

  return {
    runNow,
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
  };
}
