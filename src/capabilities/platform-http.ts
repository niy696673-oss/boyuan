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

export class PlatformDocumentDownloadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PlatformDocumentDownloadError";
  }
}

export async function downloadPlatformDocument({
  documentId,
  fileName,
  fetcher = authenticatedBrowserFetch,
}: {
  documentId: string;
  fileName?: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  if (!documentId.trim()) {
    throw new PlatformDocumentDownloadError("原始文件标识缺失，无法下载");
  }

  let response: Response;
  try {
    response = await fetcher(
      `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
      { headers: { accept: "application/octet-stream" } },
    );
  } catch {
    throw new PlatformDocumentDownloadError("网络连接失败，原始文件下载未完成");
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new PlatformDocumentDownloadError(
        "登录状态已失效，请重新登录后再下载",
        response.status,
      );
    }
    if (response.status === 404) {
      throw new PlatformDocumentDownloadError(
        "原始文件不存在或已不可用",
        response.status,
      );
    }
    throw new PlatformDocumentDownloadError(
      `原始文件下载失败（HTTP ${response.status}）`,
      response.status,
    );
  }

  const contentType = (response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType === "text/html" || contentType === "application/xhtml+xml") {
    throw new PlatformDocumentDownloadError(
      "下载响应是网页内容，已阻止打开以保护当前会话",
    );
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch {
    throw new PlatformDocumentDownloadError("下载响应读取失败，请稍后重试");
  }
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = safeDownloadFileName(fileName, documentId);
  anchor.style.display = "none";
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
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

function safeDownloadFileName(fileName: string | undefined, documentId: string) {
  const fallback = `document-${documentId}`;
  const normalized = (fileName?.trim() || fallback)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .slice(0, 180);
  return normalized || fallback;
}
