import {
  optional,
  required,
  runtimeOpenCodeOptions,
  type RuntimeEnvironment,
} from "../opencode/runtime-options.js";
import type { WebSearchPort } from "../search/contracts.js";
import { createDeepSeekSearchAdapter } from "../search/deepseek-search.js";
import { createDeterministicSearchAdapter } from "../search/deterministic-search.js";
import { createExaSearchAdapter } from "../search/exa-search.js";
import type { CompanyResearchPort } from "./contracts.js";
import type { IndustryResearchPort } from "../industry-research/contracts.js";
import { createDeterministicIndustryResearchAdapter } from "../industry-research/deterministic-industry-research.js";
import { createOpenCodeIndustryResearchAdapter } from "../industry-research/opencode-industry-research.js";
import { createDeterministicResearchAdapter } from "./deterministic-research.js";
import { createOpenCodeResearchAdapter } from "./opencode-research.js";

export interface RuntimeResearchOptions {
  directory: string;
  fetcher?: typeof fetch;
  exaBaseUrl?: URL;
  deepseekBaseUrl?: URL;
  now?: () => Date;
}

export interface RuntimeResearchAdapters {
  research: CompanyResearchPort;
  industryResearch: IndustryResearchPort;
  search: WebSearchPort;
}

export function createRuntimeResearchAdapters(
  environment: RuntimeEnvironment,
  options: RuntimeResearchOptions,
): RuntimeResearchAdapters {
  const researchMode =
    optional(environment, "BOYUAN_RESEARCH_ADAPTER") ?? "deterministic";
  const searchMode =
    optional(environment, "BOYUAN_SEARCH_ADAPTER") ?? "deterministic";

  const research =
    researchMode === "deterministic"
      ? createDeterministicResearchAdapter()
      : researchMode === "opencode"
        ? createOpenCodeResearchAdapter(
            runtimeOpenCodeOptions(environment, options),
          )
        : undefined;
  if (!research) {
    throw new Error(
      `BOYUAN_RESEARCH_ADAPTER must be "deterministic" or "opencode", received "${researchMode}"`,
    );
  }

  const industryResearch = researchMode === "deterministic"
    ? createDeterministicIndustryResearchAdapter()
    : createOpenCodeIndustryResearchAdapter(
        runtimeOpenCodeOptions(environment, options),
      );

  const search =
    searchMode === "deterministic"
      ? createDeterministicSearchAdapter()
      : searchMode === "exa"
        ? createExaSearchAdapter({
            apiKey: required(environment, "EXA_API_KEY"),
            ...(options.exaBaseUrl ? { baseUrl: options.exaBaseUrl } : {}),
            ...(options.fetcher ? { fetcher: options.fetcher } : {}),
            ...(options.now ? { now: options.now } : {}),
          })
        : searchMode === "deepseek"
          ? createDeepSeekSearchAdapter({
              apiKey:
                optional(environment, "DEEPSEEK_SEARCH_API_KEY") ??
                optional(environment, "DEEPSEEK_API_KEY") ??
                required(environment, "EXTERNAL_MODEL_API_KEY"),
              ...(options.deepseekBaseUrl
                ? { baseUrl: options.deepseekBaseUrl }
                : optional(environment, "DEEPSEEK_SEARCH_BASE_URL")
                  ? { baseUrl: new URL(optional(environment, "DEEPSEEK_SEARCH_BASE_URL")!) }
                  : optional(environment, "EXTERNAL_MODEL_BASE_URL")
                    ? { baseUrl: new URL(optional(environment, "EXTERNAL_MODEL_BASE_URL")!) }
                    : {}),
              ...(optional(environment, "DEEPSEEK_SEARCH_MODEL")
                ? { model: optional(environment, "DEEPSEEK_SEARCH_MODEL") }
                : optional(environment, "EXTERNAL_MODEL_NAME")
                  ? { model: optional(environment, "EXTERNAL_MODEL_NAME") }
                  : {}),
              ...(options.fetcher ? { fetcher: options.fetcher } : {}),
              ...(options.now ? { now: options.now } : {}),
            })
          : undefined;
  if (!search) {
    throw new Error(
      `BOYUAN_SEARCH_ADAPTER must be "deterministic", "exa", or "deepseek", received "${searchMode}"`,
    );
  }

  return { research, industryResearch, search };
}
