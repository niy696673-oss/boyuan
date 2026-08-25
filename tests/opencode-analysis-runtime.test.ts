// @vitest-environment node

import { describe, expect, it } from "vitest";
import { BP_SECTION_KEYS } from "../server/research-platform/analysis/contracts.js";
import { createOpenCodeAnalysisAdapter } from "../server/research-platform/analysis/opencode-analysis.js";
import { createRuntimeAnalysisAdapter } from "../server/research-platform/analysis/runtime-analysis.js";

const input = {
  taskId: "task-1",
  conversationId: "conversation-1",
  documentId: "document-1",
  fileName: "白杨智能 BP.md",
  companyId: "company-1",
  companyName: "白杨智能有限公司",
  blocks: [
    {
      blockId: "block-1",
      kind: "paragraph" as const,
      text: "白杨智能有限公司专注企业智能化服务。",
      page: 1,
    },
  ],
  existingKnowledge: [],
};

describe("OpenCode BP 分析接缝", () => {
  it("通过带路径前缀且无需二次鉴权的本地代理完成分析", async () => {
    const requests: Array<{ url: URL; init: RequestInit }> = [];
    const adapter = createOpenCodeAnalysisAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      model: { providerId: "openai", modelId: "gpt-5.6-sol" },
      variant: "xhigh",
      requiredCapabilities: requiredCapabilities(),
      fetcher: async (request, init = {}) => {
        const url = new URL(String(request));
        requests.push({ url, init });
        if (url.pathname === "/opencode-api/skill" && init.method === "GET") {
          return jsonResponse([{ name: "boyuan-bp-deep-analysis" }]);
        }
        if (url.pathname === "/opencode-api/mcp" && init.method === "GET") {
          return jsonResponse({ "sequential-thinking": { status: "connected" } });
        }
        if (
          url.pathname === "/opencode-api/session" &&
          init.method === "POST"
        ) {
          return jsonResponse({ id: "session-1" });
        }
        if (
          url.pathname === "/opencode-api/session/session-1/message" &&
          init.method === "POST"
        ) {
          return jsonResponse({
            info: {
              id: "assistant-1",
              parentID: "user-1",
              role: "assistant",
              providerID: "openai",
              modelID: "gpt-5.6-sol",
              variant: "xhigh",
            },
            parts: [{ type: "text", text: validAnalysisJson() }],
          });
        }
        if (
          url.pathname === "/opencode-api/session/session-1/message" &&
          init.method === "GET"
        ) {
          return jsonResponse([
            {
              info: { parentID: "user-1", role: "assistant" },
              parts: [
                {
                  type: "tool",
                  tool: "skill",
                  state: {
                    status: "completed",
                    input: { name: "boyuan-bp-deep-analysis" },
                  },
                },
                {
                  type: "tool",
                  tool: "sequential-thinking_sequentialthinking",
                  state: { status: "completed", input: {} },
                },
              ],
            },
          ]);
        }
        return new Response(null, { status: 404 });
      },
    });

    const result = await adapter.analyze(input);

    expect(result).toMatchObject({
      providerId: "openai",
      modelId: "gpt-5.6-sol",
      variant: "xhigh",
      sessionId: "session-1",
      toolUsage: ["skill", "sequential-thinking_sequentialthinking"],
    });
    expect(result.sections).toHaveLength(13);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        statement: "白杨智能有限公司专注企业智能化服务。",
        blockIds: ["block-1"],
      }),
    ]);
    expect(
      requests.map(({ url }) => url.searchParams.get("directory")),
    ).toEqual(Array.from({ length: 5 }, () => "/workspace/boyuan"));
    expect(new Headers(requests[0]?.init.headers).has("authorization")).toBe(
      false,
    );
    const promptRequest = requests.find(
      ({ url, init }) =>
        url.pathname.endsWith("/message") && init.method === "POST",
    );
    expect(JSON.parse(String(promptRequest?.init.body)).tools).toEqual({
      "*": false,
      skill: true,
      "sequential-thinking_sequentialthinking": true,
    });
  });

  it("在创建会话前拒绝缺失的 BP skill", async () => {
    const requests: string[] = [];
    const adapter = createOpenCodeAnalysisAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      requiredCapabilities: requiredCapabilities(),
      fetcher: async (request, init = {}) => {
        const url = new URL(String(request));
        requests.push(`${init.method} ${url.pathname}`);
        if (url.pathname.endsWith("/skill")) return jsonResponse([]);
        if (url.pathname.endsWith("/mcp")) {
          return jsonResponse({ "sequential-thinking": { status: "connected" } });
        }
        return new Response(null, { status: 404 });
      },
    });

    await expect(adapter.analyze(input)).rejects.toMatchObject({
      code: "opencode_required_skill_unavailable",
    });
    expect(requests).not.toContain("POST /opencode-api/session");
  });

  it("在创建会话前拒绝未连接的必需 MCP", async () => {
    const adapter = createOpenCodeAnalysisAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      requiredCapabilities: requiredCapabilities(),
      fetcher: async (request) => {
        const url = new URL(String(request));
        if (url.pathname.endsWith("/skill")) {
          return jsonResponse([{ name: "boyuan-bp-deep-analysis" }]);
        }
        if (url.pathname.endsWith("/mcp")) {
          return jsonResponse({ "sequential-thinking": { status: "failed" } });
        }
        return new Response(null, { status: 404 });
      },
    });

    await expect(adapter.analyze(input)).rejects.toMatchObject({
      code: "opencode_required_mcp_unavailable",
    });
  });

  it("分析超时后终止仍在运行的 OpenCode 会话", async () => {
    const requests: string[] = [];
    const adapter = createOpenCodeAnalysisAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      timeoutMs: 10,
      fetcher: async (request, init = {}) => {
        const url = new URL(String(request));
        requests.push(`${init.method} ${url.pathname}`);
        if (url.pathname === "/opencode-api/session") {
          return jsonResponse({ id: "session-timeout" });
        }
        if (url.pathname.endsWith("/message")) {
          return await new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              {
                once: true,
              },
            );
          });
        }
        if (url.pathname.endsWith("/abort")) return jsonResponse(true);
        return new Response(null, { status: 404 });
      },
    });

    await expect(adapter.analyze(input)).rejects.toThrow();
    expect(requests).toEqual([
      "POST /opencode-api/session",
      "POST /opencode-api/session/session-timeout/message",
      "POST /opencode-api/session/session-timeout/abort",
    ]);
  });
});

describe("BP 分析运行时选择", () => {
  it("显式选择 OpenCode 时要求完整的服务地址", () => {
    expect(() =>
      createRuntimeAnalysisAdapter(
        { BOYUAN_ANALYSIS_ADAPTER: "opencode" },
        { directory: "/workspace/boyuan" },
      ),
    ).toThrow(/BOYUAN_OPENCODE_BASE_URL/);
  });

  it("未选择 OpenCode 时保留确定性开发适配器", async () => {
    const adapter = createRuntimeAnalysisAdapter(
      {},
      { directory: "/workspace/boyuan" },
    );

    const result = await adapter.analyze(input);

    expect(result.providerId).toBe("deterministic-test");
  });

  it("拒绝非法的 OpenCode 慢链路超时配置", () => {
    expect(() =>
      createRuntimeAnalysisAdapter(
        {
          BOYUAN_ANALYSIS_ADAPTER: "opencode",
          BOYUAN_OPENCODE_BASE_URL: "http://127.0.0.1:4173/opencode-api/",
          BOYUAN_OPENCODE_TIMEOUT_MS: "instant",
        },
        { directory: "/workspace/boyuan" },
      ),
    ).toThrow(/BOYUAN_OPENCODE_TIMEOUT_MS/);
  });
});

function validAnalysisJson(): string {
  return JSON.stringify({
    sections: BP_SECTION_KEYS.map((key) => ({
      key,
      summary:
        key === "company_and_project_stage"
          ? "白杨智能有限公司专注企业智能化服务。"
          : "材料未披露",
      blockIds: key === "company_and_project_stage" ? ["block-1"] : [],
    })),
    candidates: [
      {
        sectionKey: "company_and_project_stage",
        knowledgeType: "company_profile",
        statement: "白杨智能有限公司专注企业智能化服务。",
        blockIds: ["block-1"],
        highImpact: false,
        sensitive: false,
      },
    ],
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function requiredCapabilities() {
  return {
    skillName: "boyuan-bp-deep-analysis",
    mcpServer: "sequential-thinking",
    mcpTool: "sequential-thinking_sequentialthinking",
  };
}
