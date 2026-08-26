export interface PlatformWorkerOptions {
  batchSize: number;
  concurrency: number;
}

export function loadPlatformWorkerOptions(
  source: NodeJS.ProcessEnv = process.env,
): PlatformWorkerOptions {
  return {
    batchSize: positiveIntegerEnvironment(
      "BOYUAN_RESEARCH_WORKER_BATCH_SIZE",
      source.BOYUAN_RESEARCH_WORKER_BATCH_SIZE,
      10,
      100,
    ),
    concurrency: positiveIntegerEnvironment(
      "BOYUAN_RESEARCH_WORKER_CONCURRENCY",
      source.BOYUAN_RESEARCH_WORKER_CONCURRENCY,
      1,
      8,
    ),
  };
}

function positiveIntegerEnvironment(
  name: string,
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}
