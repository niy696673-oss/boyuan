import {
  optional,
  runtimeOpenCodeOptions,
  type RuntimeEnvironment,
} from "../opencode/runtime-options.js";
import type { CompanyCopilotPort } from "./contracts.js";
import { createOpenCodeCompanyCopilotAdapter } from "./opencode-copilot.js";

export interface RuntimeCompanyCopilotOptions {
  directory: string;
  fetcher?: typeof fetch;
}

export type RuntimeCompanyCopilotEnvironment = RuntimeEnvironment;

export function createRuntimeCompanyCopilotAdapter(
  environment: RuntimeCompanyCopilotEnvironment,
  options: RuntimeCompanyCopilotOptions,
): CompanyCopilotPort {
  const connection = runtimeOpenCodeOptions(environment, options);
  const providerId = optional(environment, "BOYUAN_COPILOT_PROVIDER_ID");
  const modelId = optional(environment, "BOYUAN_COPILOT_MODEL_ID");
  if ((providerId === undefined) !== (modelId === undefined)) {
    throw new Error(
      "BOYUAN_COPILOT_PROVIDER_ID and BOYUAN_COPILOT_MODEL_ID must be configured together",
    );
  }

  return createOpenCodeCompanyCopilotAdapter({
    ...connection,
    ...(providerId && modelId
      ? { model: { providerId, modelId } }
      : connection.model
        ? { model: connection.model }
        : {}),
    ...(optional(environment, "BOYUAN_COPILOT_VARIANT")
      ? { variant: optional(environment, "BOYUAN_COPILOT_VARIANT") }
      : connection.variant
        ? { variant: connection.variant }
        : {}),
  });
}
