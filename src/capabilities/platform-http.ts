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

export async function authenticatedBrowserFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
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

export async function requestPlatformJson<T>(
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
