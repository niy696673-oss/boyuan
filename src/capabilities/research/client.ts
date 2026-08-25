import type {
  ConversationDetail,
  ConversationSummary,
  UploadResult,
} from "./types";

export interface ResearchPlatformClient {
  listConversations(signal?: AbortSignal): Promise<ConversationSummary[]>;
  getConversation(
    conversationId: string,
    signal?: AbortSignal,
  ): Promise<ConversationDetail>;
  uploadDocument(file: File, signal?: AbortSignal): Promise<UploadResult>;
}

export class ResearchPlatformApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ResearchPlatformApiError";
  }
}

export function createResearchPlatformClient(
  fetcher: typeof fetch = browserFetch,
): ResearchPlatformClient {
  return {
    listConversations: (signal) =>
      requestJson<ConversationSummary[]>(fetcher, "/api/v1/conversations", {
        signal,
      }),
    getConversation: (conversationId, signal) =>
      requestJson<ConversationDetail>(
        fetcher,
        `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
        { signal },
      ),
    uploadDocument: (file, signal) => {
      const body = new FormData();
      body.append("file", file, file.name);
      return requestJson<UploadResult>(fetcher, "/api/v1/documents", {
        method: "POST",
        body,
        signal,
      });
    },
  };
}

async function browserFetch(input: RequestInfo | URL, init?: RequestInit) {
  const token = localStorage.getItem("boyuan-access-token") || "";
  const userId = localStorage.getItem("boyuan-user") || "u-investor";
  return fetch(input, {
    ...init,
    headers: {
      "x-user-id": userId,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
}

async function requestJson<T>(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetcher(url, {
    ...init,
    headers: { accept: "application/json", ...init.headers },
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as unknown)
    : undefined;
  if (!response.ok) {
    const error = isErrorPayload(payload) ? payload : undefined;
    throw new ResearchPlatformApiError(
      error?.message || "请求处理失败",
      response.status,
      error?.error,
    );
  }
  return payload as T;
}

function isErrorPayload(
  value: unknown,
): value is { error: string; message?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  );
}
