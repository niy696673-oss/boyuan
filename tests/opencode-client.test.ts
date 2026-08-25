// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createOpenCodeClient } from "../server/research-platform/opencode/client.js";

describe("共享 OpenCode client", () => {
  it("集中处理代理前缀、目录、鉴权和会话端点", async () => {
    const requests: Array<{ url: URL; init: RequestInit }> = [];
    const client = createOpenCodeClient(
      {
        baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
        credentials: { username: "opencode", password: "secret" },
        directory: "/workspace/boyuan",
        fetcher: async (request, init = {}) => {
          const url = new URL(String(request));
          requests.push({ url, init });
          if (url.pathname.endsWith("/session")) {
            return Response.json({ id: "session-1" });
          }
          if (url.pathname.endsWith("/message")) {
            return Response.json({
              info: { providerID: "openai", modelID: "gpt-test" },
              parts: [{ type: "text", text: "{}" }],
            });
          }
          if (url.pathname.endsWith("/abort")) return Response.json(true);
          return new Response(null, { status: 404 });
        },
      },
      (status) => new Error(`HTTP ${status}`),
      180_000,
    );

    const sessionId = await client.createSession("研究会话");
    await client.sendMessage(sessionId, { parts: [] });
    await client.abortSession(sessionId);

    expect(requests.map(({ url }) => url.pathname)).toEqual([
      "/opencode-api/session",
      "/opencode-api/session/session-1/message",
      "/opencode-api/session/session-1/abort",
    ]);
    expect(
      requests.map(({ url }) => url.searchParams.get("directory")),
    ).toEqual(["/workspace/boyuan", "/workspace/boyuan", "/workspace/boyuan"]);
    for (const { init } of requests) {
      expect(new Headers(init.headers).get("authorization")).toBe(
        `Basic ${Buffer.from("opencode:secret").toString("base64")}`,
      );
    }
  });

  it("把非成功响应交给调用 adapter 的错误映射", async () => {
    const client = createOpenCodeClient(
      {
        baseUrl: new URL("http://127.0.0.1:4096/"),
        directory: "/workspace/boyuan",
        fetcher: async () => new Response(null, { status: 503 }),
      },
      (status) =>
        Object.assign(new Error("OpenCode unavailable"), {
          code: `mapped_${status}`,
        }),
      180_000,
    );

    await expect(client.listSkills()).rejects.toMatchObject({
      code: "mapped_503",
    });
  });
});
