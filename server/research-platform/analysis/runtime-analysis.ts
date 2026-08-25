import type { MaterialAnalysisPort } from "./contracts.js";
import { createDeterministicAnalysisAdapter } from "./deterministic-analysis.js";
import { createOpenCodeAnalysisAdapter } from "./opencode-analysis.js";

export interface RuntimeAnalysisOptions {
  directory: string;
  fetcher?: typeof fetch;
}

export type RuntimeAnalysisEnvironment = Record<string, string | undefined>;

export function createRuntimeAnalysisAdapter(
  environment: RuntimeAnalysisEnvironment,
  options: RuntimeAnalysisOptions,
): MaterialAnalysisPort {
  const adapter =
    environment.BOYUAN_ANALYSIS_ADAPTER?.trim() || "deterministic";
  if (adapter === "deterministic") return createDeterministicAnalysisAdapter();
  if (adapter !== "opencode") {
    throw new Error(
      `BOYUAN_ANALYSIS_ADAPTER must be "deterministic" or "opencode", received "${adapter}"`,
    );
  }

  const baseUrlValue = required(environment, "BOYUAN_OPENCODE_BASE_URL");
  const credentials = optionalPair(
    environment,
    "BOYUAN_OPENCODE_USERNAME",
    "BOYUAN_OPENCODE_PASSWORD",
  );
  const model = optionalPair(
    environment,
    "BOYUAN_DEEP_OPENCODE_PROVIDER_ID",
    "BOYUAN_DEEP_OPENCODE_MODEL_ID",
  );
  const timeoutMs = optionalPositiveInteger(
    environment,
    "BOYUAN_OPENCODE_TIMEOUT_MS",
    600_000,
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

  return createOpenCodeAnalysisAdapter({
    baseUrl,
    directory:
      optional(environment, "BOYUAN_OPENCODE_DIRECTORY") ?? options.directory,
    ...(credentials
      ? { username: credentials.first, password: credentials.second }
      : {}),
    ...(model
      ? { model: { providerId: model.first, modelId: model.second } }
      : {}),
    ...(optional(environment, "BOYUAN_DEEP_OPENCODE_VARIANT")
      ? { variant: optional(environment, "BOYUAN_DEEP_OPENCODE_VARIANT") }
      : {}),
    requiredCapabilities: {
      skillName: "boyuan-bp-deep-analysis",
      mcpServer: "sequential-thinking",
      mcpTool: "sequential-thinking_sequentialthinking",
    },
    timeoutMs,
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
  });
}

function optionalPair(
  environment: RuntimeAnalysisEnvironment,
  firstKey: string,
  secondKey: string,
): { first: string; second: string } | undefined {
  const first = optional(environment, firstKey);
  const second = optional(environment, secondKey);
  if ((first === undefined) !== (second === undefined)) {
    throw new Error(`${firstKey} and ${secondKey} must be configured together`);
  }
  return first !== undefined && second !== undefined ? { first, second } : undefined;
}

function optionalPositiveInteger(
  environment: RuntimeAnalysisEnvironment,
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

function optional(
  environment: RuntimeAnalysisEnvironment,
  key: string,
): string | undefined {
  const value = environment[key]?.trim();
  return value || undefined;
}

function required(
  environment: RuntimeAnalysisEnvironment,
  key: string,
): string {
  const value = optional(environment, key);
  if (!value)
    throw new Error(`${key} is required when OpenCode analysis is enabled`);
  return value;
}
