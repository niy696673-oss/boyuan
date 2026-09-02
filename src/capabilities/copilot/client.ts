import {
  authenticatedBrowserFetch,
  requestPlatformJson,
} from "../platform-http";
import type { CompanyCopilotThread } from "./types";

export interface CompanyCopilotClient {
  getThread(
    companyId: string,
    signal?: AbortSignal,
  ): Promise<CompanyCopilotThread>;
  sendMessage(
    companyId: string,
    content: string,
    signal?: AbortSignal,
  ): Promise<CompanyCopilotThread>;
}

export function createCompanyCopilotClient(
  fetcher: typeof fetch = authenticatedBrowserFetch,
): CompanyCopilotClient {
  return {
    getThread: (companyId, signal) =>
      requestPlatformJson<CompanyCopilotThread>(
        fetcher,
        `/api/v1/companies/${encodeURIComponent(companyId)}/copilot`,
        { signal },
      ),
    sendMessage: (companyId, content, signal) =>
      requestPlatformJson<CompanyCopilotThread>(
        fetcher,
        `/api/v1/companies/${encodeURIComponent(companyId)}/copilot/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content }),
          signal,
        },
      ),
  };
}
