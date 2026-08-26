import type {
  IndustryDetailResponseV1,
  IndustryDirectoryResponseV1,
} from "../../../shared/research-platform-v1";
import {
  authenticatedBrowserFetch,
  requestPlatformJson,
} from "../platform-http";

export interface IndustryDirectoryClient {
  list(signal?: AbortSignal): Promise<IndustryDirectoryResponseV1>;
  get(
    industryId: string,
    signal?: AbortSignal,
  ): Promise<IndustryDetailResponseV1>;
}

export function createIndustryDirectoryClient(
  fetcher: typeof fetch = authenticatedBrowserFetch,
): IndustryDirectoryClient {
  return {
    list: (signal) =>
      requestPlatformJson<IndustryDirectoryResponseV1>(
        fetcher,
        "/api/v1/industries",
        { signal },
      ),
    get: (industryId, signal) =>
      requestPlatformJson<IndustryDetailResponseV1>(
        fetcher,
        `/api/v1/industries/${encodeURIComponent(industryId)}`,
        { signal },
      ),
  };
}
