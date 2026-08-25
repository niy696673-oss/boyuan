import {
  optional,
  required,
  runtimeOpenCodeOptions,
  type RuntimeEnvironment,
} from "../opencode/runtime-options.js";
import type { WebSearchPort } from "../search/contracts.js";
import { createDeterministicSearchAdapter } from "../search/deterministic-search.js";
import { createExaSearchAdapter } from "../search/exa-search.js";
import type { CompanyResearchPort } from "./contracts.js";
import { createDeterministicResearchAdapter } from "./deterministic-research.js";
import { createOpenCodeResearchAdapter } from "./opencode-research.js";

export interface RuntimeResearchOptions {
  directory: string;
  fetcher?: typeof fetch;
  exaBaseUrl?: URL;
  now?: () => Date;
}

export interface RuntimeResearchAdapters {
  research: CompanyResearchPort;
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
        : undefined;
  if (!search) {
    throw new Error(
      `BOYUAN_SEARCH_ADAPTER must be "deterministic" or "exa", received "${searchMode}"`,
    );
  }

  return { research, search };
}
