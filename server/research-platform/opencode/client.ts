import { Buffer } from "node:buffer";

export interface OpenCodeConnectionOptions {
  baseUrl: URL;
  credentials?: { username: string; password: string };
  directory: string;
  timeoutMs?: number | false;
  fetcher?: typeof fetch;
}

export interface OpenCodePart {
  type: string;
  text?: string;
  tool?: string;
  state?: { status?: string; input?: Record<string, unknown> };
}

export interface OpenCodeAssistantResponse {
  info: {
    id?: string;
    parentID?: string;
    role?: string;
    providerID: string;
    modelID: string;
    variant?: string;
    error?: unknown;
  };
  parts: OpenCodePart[];
}

export interface OpenCodeSessionMessage {
  info: { parentID?: string; role?: string };
  parts: OpenCodePart[];
}

export interface OpenCodeSkill {
  name: string;
}
export interface OpenCodeMcpStatus {
  status?: string;
}

export interface OpenCodeClient {
  createSession(title: string): Promise<string>;
  sendMessage(
    sessionId: string,
    body: Record<string, unknown>,
  ): Promise<OpenCodeAssistantResponse>;
  listMessages(
    sessionId: string,
    limit?: number,
  ): Promise<OpenCodeSessionMessage[]>;
  listSkills(): Promise<OpenCodeSkill[]>;
  mcpStatus(): Promise<Record<string, OpenCodeMcpStatus>>;
  abortSession(sessionId: string): Promise<void>;
}

export function createOpenCodeClient(
  options: OpenCodeConnectionOptions,
  httpError: (status: number) => Error,
  defaultTimeoutMs: number,
): OpenCodeClient {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const authorization = options.credentials
    ? `Basic ${Buffer.from(`${options.credentials.username}:${options.credentials.password}`).toString("base64")}`
    : undefined;

  const request = async <T>(path: string, init: RequestInit): Promise<T> => {
    const url = endpointUrl(options.baseUrl, path);
    url.searchParams.set("directory", options.directory);
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    if (authorization) headers.set("authorization", authorization);
    const signal =
      init.signal ??
      (timeoutMs === false ? undefined : AbortSignal.timeout(timeoutMs));
    const response = await fetcher(url, {
      ...init,
      headers,
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) throw httpError(response.status);
    return (await response.json()) as T;
  };

  return {
    async createSession(title) {
      return (
        await request<{ id: string }>("/session", {
          method: "POST",
          body: JSON.stringify({ title }),
        })
      ).id;
    },
    sendMessage: (sessionId, body) =>
      request<OpenCodeAssistantResponse>(
        `/session/${encodeURIComponent(sessionId)}/message`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    listMessages: (sessionId, limit = 100) =>
      request<OpenCodeSessionMessage[]>(
        `/session/${encodeURIComponent(sessionId)}/message?limit=${encodeURIComponent(String(limit))}`,
        { method: "GET" },
      ),
    listSkills: () => request<OpenCodeSkill[]>("/skill", { method: "GET" }),
    mcpStatus: () =>
      request<Record<string, OpenCodeMcpStatus>>("/mcp", { method: "GET" }),
    async abortSession(sessionId) {
      await request<boolean>(
        `/session/${encodeURIComponent(sessionId)}/abort`,
        {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
        },
      );
    },
  };
}

function endpointUrl(baseUrl: URL, path: string): URL {
  const normalizedBase = new URL(baseUrl);
  if (!normalizedBase.pathname.endsWith("/")) normalizedBase.pathname += "/";
  return new URL(path.replace(/^\/+/, ""), normalizedBase);
}
