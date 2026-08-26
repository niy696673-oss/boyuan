import {
  optional,
  required,
  runtimeOpenCodeOptions,
  type RuntimeEnvironment,
} from "../opencode/runtime-options.js";
import type { QuickCardAnalysisPort } from "./contracts.js";
import { createOpenCodeQuickCardAdapter } from "./opencode-quick-card.js";

export function createRuntimeQuickCardAdapter(
  environment: RuntimeEnvironment,
  options: { directory: string; fetcher?: typeof fetch },
): QuickCardAnalysisPort | undefined {
  const adapter = optional(environment, "BOYUAN_QUICK_CARD_ADAPTER") ?? "disabled";
  if (adapter === "disabled") return undefined;
  if (adapter !== "opencode") {
    throw new Error(
      `BOYUAN_QUICK_CARD_ADAPTER must be "disabled" or "opencode", received "${adapter}"`,
    );
  }
  const connection = runtimeOpenCodeOptions(environment, options);
  return createOpenCodeQuickCardAdapter({
    ...connection,
    model: {
      providerId: required(environment, "BOYUAN_QUICK_CARD_PROVIDER_ID"),
      modelId: required(environment, "BOYUAN_QUICK_CARD_MODEL_ID"),
    },
    variant: optional(environment, "BOYUAN_QUICK_CARD_VARIANT") ?? "none",
    timeoutMs: quickCardTimeout(environment),
  });
}

function quickCardTimeout(environment: RuntimeEnvironment): number {
  const raw = optional(environment, "BOYUAN_QUICK_CARD_TIMEOUT_MS");
  if (!raw) return 120_000;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 600_000) {
    throw new Error(
      "BOYUAN_QUICK_CARD_TIMEOUT_MS must be an integer between 1000 and 600000",
    );
  }
  return value;
}
