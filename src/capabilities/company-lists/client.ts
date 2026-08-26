import type {
  CompanyListRecordV1,
  CompanyListRowV1,
} from "../../../shared/research-platform-v1";
import {
  authenticatedBrowserFetch,
  requestPlatformJson,
} from "../platform-http";
import type { ConversationDetail, UploadResult } from "../research/types";

export interface CompanyListClient {
  upload(file: File, signal?: AbortSignal): Promise<UploadResult>;
  getConversation(
    conversationId: string,
    signal?: AbortSignal,
  ): Promise<ConversationDetail>;
  get(listId: string, signal?: AbortSignal): Promise<CompanyListRecordV1>;
  confirm(
    listId: string,
    rows: Array<{
      rowId: string;
      expectedVersion: number;
      companyId?: string;
      createName?: string;
    }>,
    signal?: AbortSignal,
  ): Promise<CompanyListRecordV1>;
  startResearch(
    listId: string,
    companyIds: string[],
    signal?: AbortSignal,
  ): Promise<CompanyListRecordV1>;
}

export function createCompanyListClient(
  fetcher: typeof fetch = authenticatedBrowserFetch,
): CompanyListClient {
  return {
    upload: (file, signal) => {
      const body = new FormData();
      body.append("file", file, file.name);
      return requestPlatformJson<UploadResult>(fetcher, "/api/v1/company-lists", {
        method: "POST",
        body,
        signal,
      });
    },
    getConversation: (conversationId, signal) =>
      requestPlatformJson<ConversationDetail>(
        fetcher,
        `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
        { signal },
      ),
    get: (listId, signal) =>
      requestPlatformJson<CompanyListRecordV1>(
        fetcher,
        `/api/v1/company-lists/${encodeURIComponent(listId)}`,
        { signal },
      ),
    confirm: (listId, rows, signal) =>
      requestPlatformJson<CompanyListRecordV1>(
        fetcher,
        `/api/v1/company-lists/${encodeURIComponent(listId)}/confirmations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rows }),
          signal,
        },
      ),
    startResearch: (listId, companyIds, signal) =>
      requestPlatformJson<CompanyListRecordV1>(
        fetcher,
        `/api/v1/company-lists/${encodeURIComponent(listId)}/research`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyIds }),
          signal,
        },
      ),
  };
}

export function confirmableCompanyListRows(rows: CompanyListRowV1[]) {
  const result: Array<{
    rowId: string;
    expectedVersion: number;
    companyId?: string;
    createName?: string;
  }> = [];
  for (const row of rows) {
    if (row.confirmationStatus !== "pending") continue;
    if (row.matchStatus === "existing" && row.options[0]) {
      result.push({
        rowId: row.rowId,
        expectedVersion: row.version,
        companyId: row.options[0].companyId,
      });
    } else if (row.matchStatus === "new" && row.normalizedName) {
      result.push({
        rowId: row.rowId,
        expectedVersion: row.version,
        createName: row.normalizedName,
      });
    }
  }
  return result;
}
