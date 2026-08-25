import type { MaterialAnalysisPort } from "./contracts.js";
import { createDeterministicAnalysisAdapter } from "./deterministic-analysis.js";
import { createOpenCodeAnalysisAdapter } from "./opencode-analysis.js";
import {
  runtimeOpenCodeOptions,
  type RuntimeEnvironment,
} from "../opencode/runtime-options.js";

export interface RuntimeAnalysisOptions {
  directory: string;
  fetcher?: typeof fetch;
}

export type RuntimeAnalysisEnvironment = RuntimeEnvironment;

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

  return createOpenCodeAnalysisAdapter({
    ...runtimeOpenCodeOptions(environment, options),
    requiredCapabilities: {
      skillName: "boyuan-bp-deep-analysis",
      mcpServer: "sequential-thinking",
      mcpTool: "sequential-thinking_sequentialthinking",
    },
  });
}
