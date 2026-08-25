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
  const username = optional(environment, "BOYUAN_OPENCODE_USERNAME");
  const password = optional(environment, "BOYUAN_OPENCODE_PASSWORD");
  if ((username === undefined) !== (password === undefined)) {
    throw new Error(
      "BOYUAN_OPENCODE_USERNAME and BOYUAN_OPENCODE_PASSWORD must be configured together",
    );
  }

  const providerId = optional(environment, "BOYUAN_DEEP_OPENCODE_PROVIDER_ID");
  const modelId = optional(environment, "BOYUAN_DEEP_OPENCODE_MODEL_ID");
  if ((providerId === undefined) !== (modelId === undefined)) {
    throw new Error(
      "BOYUAN_DEEP_OPENCODE_PROVIDER_ID and BOYUAN_DEEP_OPENCODE_MODEL_ID must be configured together",
    );
  }
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
    ...(username !== undefined && password !== undefined
      ? { username, password }
      : {}),
    ...(providerId !== undefined && modelId !== undefined
      ? { model: { providerId, modelId } }
      : {}),
    ...(optional(environment, "BOYUAN_DEEP_OPENCODE_VARIANT")
      ? { variant: optional(environment, "BOYUAN_DEEP_OPENCODE_VARIANT") }
      : {}),
    skillName: "boyuan-bp-deep-analysis",
    sequentialThinkingTool: "sequential-thinking_sequentialthinking",
    timeoutMs,
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
  });
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
