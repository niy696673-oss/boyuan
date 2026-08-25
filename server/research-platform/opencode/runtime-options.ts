import type { OpenCodeConnectionOptions } from "./client.js";

export type RuntimeEnvironment = Record<string, string | undefined>;

export interface RuntimeOpenCodeOptions extends OpenCodeConnectionOptions {
  model?: { providerId: string; modelId: string };
  variant?: string;
}

export function runtimeOpenCodeOptions(
  environment: RuntimeEnvironment,
  options: { directory: string; fetcher?: typeof fetch },
): RuntimeOpenCodeOptions {
  const baseUrlValue = required(environment, "BOYUAN_OPENCODE_BASE_URL");
  const credentials = optionalPair(
    environment,
    "BOYUAN_OPENCODE_USERNAME",
    "BOYUAN_OPENCODE_PASSWORD",
    (username, password) => ({ username, password }),
  );
  const model = optionalPair(
    environment,
    "BOYUAN_DEEP_OPENCODE_PROVIDER_ID",
    "BOYUAN_DEEP_OPENCODE_MODEL_ID",
    (providerId, modelId) => ({ providerId, modelId }),
  );
  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlValue);
  } catch (error) {
    throw new Error("BOYUAN_OPENCODE_BASE_URL must be a valid absolute URL", {
      cause: error,
    });
  }
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("BOYUAN_OPENCODE_BASE_URL must use http or https");
  }

  const variant = optional(environment, "BOYUAN_DEEP_OPENCODE_VARIANT");
  return {
    baseUrl,
    directory:
      optional(environment, "BOYUAN_OPENCODE_DIRECTORY") ?? options.directory,
    ...(credentials ? { credentials } : {}),
    ...(model ? { model } : {}),
    ...(variant ? { variant } : {}),
    timeoutMs: optionalPositiveInteger(
      environment,
      "BOYUAN_OPENCODE_TIMEOUT_MS",
      600_000,
    ),
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
  };
}

export function optional(
  environment: RuntimeEnvironment,
  key: string,
): string | undefined {
  const value = environment[key]?.trim();
  return value || undefined;
}

export function required(environment: RuntimeEnvironment, key: string): string {
  const value = optional(environment, key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function optionalPair<T>(
  environment: RuntimeEnvironment,
  firstKey: string,
  secondKey: string,
  map: (first: string, second: string) => T,
): T | undefined {
  const first = optional(environment, firstKey);
  const second = optional(environment, secondKey);
  if ((first === undefined) !== (second === undefined)) {
    throw new Error(`${firstKey} and ${secondKey} must be configured together`);
  }
  return first !== undefined && second !== undefined
    ? map(first, second)
    : undefined;
}

function optionalPositiveInteger(
  environment: RuntimeEnvironment,
  key: string,
  fallback: number,
): number {
  const raw = optional(environment, key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 1_800_000) {
    throw new Error(`${key} must be an integer between 1000 and 1800000`);
  }
  return value;
}
