import type {
  IndustryDetailResponseV1,
  IndustryDirectoryResponseV1,
  IndustryReclassificationResponseV1,
} from "../../../shared/research-platform-v1";
import type { UploadResult } from "../research/types";
import {
  authenticatedBrowserFetch,
  requestPlatformJson,
} from "../platform-http";

export interface IndustryDirectoryClient {
  list(signal?: AbortSignal): Promise<IndustryDirectoryResponseV1>;
  reclassify(signal?: AbortSignal): Promise<IndustryReclassificationResponseV1>;
  get(
    industryId: string,
    signal?: AbortSignal,
  ): Promise<IndustryDetailResponseV1>;
  uploadDocument(
    industryId: string,
    file: File,
    signal?: AbortSignal,
  ): Promise<UploadResult>;
  setWatched(
    industryId: string,
    watched: boolean,
    expectedVersion: number,
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
    reclassify: (signal) =>
      requestPlatformJson<IndustryReclassificationResponseV1>(
        fetcher,
        "/api/v1/industries/reclassify",
        { method: "POST", signal },
      ),
    get: (industryId, signal) =>
      requestPlatformJson<IndustryDetailResponseV1>(
        fetcher,
        `/api/v1/industries/${encodeURIComponent(industryId)}`,
        { signal },
      ),
    uploadDocument: (industryId, file, signal) => {
      const body = new FormData();
      body.append("file", file, file.name);
      return requestPlatformJson<UploadResult>(
        fetcher,
        `/api/v1/industries/${encodeURIComponent(industryId)}/documents`,
        { method: "POST", body, signal },
      );
    },
    setWatched: (industryId, watched, expectedVersion, signal) =>
      requestPlatformJson<IndustryDetailResponseV1>(
        fetcher,
        `/api/v1/industries/${encodeURIComponent(industryId)}/watch`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ watched, expectedVersion }),
          signal,
        },
      ),
  };
}
