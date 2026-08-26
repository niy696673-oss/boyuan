import type {
  PlatformNotificationListV1,
  PlatformNotificationV1,
} from "../../../shared/research-platform-v1";
import {
  authenticatedBrowserFetch,
  requestPlatformJson,
} from "../platform-http";

export interface GlobalSearchMatch {
  score: number;
  reason: string;
}

export interface GlobalSearchResults {
  query: string;
  mode: "semantic";
  providerId: string;
  modelId: string;
  companies: Array<{
    companyId: string;
    canonicalName: string;
    match: GlobalSearchMatch;
  }>;
  materials: Array<{
    conversationId: string;
    documentId: string;
    fileName: string;
    match: GlobalSearchMatch;
  }>;
  conversations: Array<{
    conversationId: string;
    title: string;
    match: GlobalSearchMatch;
  }>;
  industries: Array<{
    industryId: string;
    name: string;
    match: GlobalSearchMatch;
  }>;
}

export interface PlatformNavigationClient {
  search(query: string, signal?: AbortSignal): Promise<GlobalSearchResults>;
  notifications(signal?: AbortSignal): Promise<PlatformNotificationListV1>;
  markNotificationRead(
    notificationId: string,
    signal?: AbortSignal,
  ): Promise<PlatformNotificationV1>;
}

export function createPlatformNavigationClient(
  fetcher: typeof fetch = authenticatedBrowserFetch,
): PlatformNavigationClient {
  return {
    search: (query, signal) =>
      requestPlatformJson<GlobalSearchResults>(
        fetcher,
        `/api/v1/search?q=${encodeURIComponent(query)}`,
        { signal },
      ),
    notifications: (signal) =>
      requestPlatformJson<PlatformNotificationListV1>(
        fetcher,
        "/api/v1/notifications",
        { signal },
      ),
    markNotificationRead: (notificationId, signal) =>
      requestPlatformJson<PlatformNotificationV1>(
        fetcher,
        `/api/v1/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: "POST", signal },
      ),
  };
}
