import type {
  ConversationDetail,
  ConversationSummary,
  UploadResult,
} from "./types";
import {
  authenticatedBrowserFetch,
  requestPlatformJson,
} from "../platform-http";

export { ResearchPlatformApiError } from "../platform-http";

export interface ResearchPlatformClient {
  listConversations(signal?: AbortSignal): Promise<ConversationSummary[]>;
  getConversation(
    conversationId: string,
    signal?: AbortSignal,
  ): Promise<ConversationDetail>;
  uploadDocument(file: File, signal?: AbortSignal): Promise<UploadResult>;
}

export function createResearchPlatformClient(
  fetcher: typeof fetch = authenticatedBrowserFetch,
): ResearchPlatformClient {
  return {
    listConversations: (signal) =>
      requestPlatformJson<ConversationSummary[]>(
        fetcher,
        "/api/v1/conversations",
        { signal },
      ),
    getConversation: (conversationId, signal) =>
      requestPlatformJson<ConversationDetail>(
        fetcher,
        `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
        { signal },
      ),
    uploadDocument: (file, signal) => {
      const body = new FormData();
      body.append("file", file, file.name);
      return requestPlatformJson<UploadResult>(fetcher, "/api/v1/documents", {
        method: "POST",
        body,
        signal,
      });
    },
  };
}
