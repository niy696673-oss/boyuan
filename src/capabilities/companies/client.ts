import type {
  CompanyDetailResponse,
  CompanyDirectoryResponse,
} from "../../../shared/research-platform-v1";
import type { UploadResult } from "../research/types";
import {
  authenticatedBrowserFetch,
  requestPlatformJson,
} from "../platform-http";

export interface CompanyDirectoryClient {
  list(signal?: AbortSignal): Promise<CompanyDirectoryResponse>;
  get(companyId: string, signal?: AbortSignal): Promise<CompanyDetailResponse>;
  uploadDocument(
    companyId: string,
    file: File,
    signal?: AbortSignal,
  ): Promise<UploadResult>;
  setWatched(
    companyId: string,
    input: { watched: boolean; expectedVersion: number },
    signal?: AbortSignal,
  ): Promise<CompanyDetailResponse>;
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
    uploadDocument: (companyId, file, signal) => {
      const body = new FormData();
      body.append("file", file, file.name);
      return requestPlatformJson<UploadResult>(
        fetcher,
        `/api/v1/companies/${encodeURIComponent(companyId)}/documents`,
        { method: "POST", body, signal },
      );
    },
    setWatched: (companyId, input, signal) =>
      requestPlatformJson<CompanyDetailResponse>(
        fetcher,
        `/api/v1/companies/${encodeURIComponent(companyId)}/watch`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          signal,
        },
      ),
  };
}
