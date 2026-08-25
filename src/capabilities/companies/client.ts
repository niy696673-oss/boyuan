import type {
  CompanyDetailResponse,
  CompanyDirectoryResponse,
} from "../../../shared/research-platform-v1";
import {
  authenticatedBrowserFetch,
  requestPlatformJson,
} from "../platform-http";

export interface CompanyDirectoryClient {
  list(signal?: AbortSignal): Promise<CompanyDirectoryResponse>;
  get(companyId: string, signal?: AbortSignal): Promise<CompanyDetailResponse>;
}

export function createCompanyDirectoryClient(
  fetcher: typeof fetch = authenticatedBrowserFetch,
): CompanyDirectoryClient {
  return {
    list: (signal) =>
      requestPlatformJson<CompanyDirectoryResponse>(
        fetcher,
        "/api/v1/companies",
        { signal },
      ),
    get: (companyId, signal) =>
      requestPlatformJson<CompanyDetailResponse>(
        fetcher,
        `/api/v1/companies/${encodeURIComponent(companyId)}`,
        { signal },
      ),
  };
}
