// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createOpenCodeResearchAdapter } from "../server/research-platform/research/opencode-research.js";
import { createRuntimeResearchAdapters } from "../server/research-platform/research/runtime-research.js";

describe("公司外部调研运行时", () => {
  it("通过 OpenCode 代理分析带 URL 的公开来源且禁用全部工具", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "session-1" }))
      .mockResolvedValueOnce(
        Response.json({
          info: {
            providerID: "openai",
            modelID: "gpt-5.6-sol",
            variant: "xhigh",
          },
          parts: [
            {
              type: "text",
              text: JSON.stringify({
                summary: "公开来源显示公司已发布新产品。",
                candidates: [
                  {
                    knowledgeType: "product_update",
                    statement: "公司已发布新产品。",
                    evidenceUrls: ["https://example.com/source"],
                    highImpact: false,
                    sensitive: false,
                  },
                ],
              }),
            },
          ],
        }),
      );
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      model: { providerId: "openai", modelId: "gpt-5.6-sol" },
      variant: "xhigh",
      fetcher,
    });

    const result = await adapter.analyze({
      taskId: "task-1",
      conversationId: "conversation-1",
      companyId: "company-1",
      companyName: "白杨智能有限公司",
      intent: "了解最新产品",
      triggerReason: "user_requested",
      existingKnowledge: [],
      pendingCandidates: [],
      webResults: [
        {
          title: "来源",
          url: "https://example.com/source",
          site: "example.com",
          highlights: ["公开信息"],
          accessStatus: "accessible",
          retrievedAt: "2026-08-24T00:00:00.000Z",
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: "openai",
      modelId: "gpt-5.6-sol",
      sessionId: "session-1",
    });
    expect(result.candidates[0]?.evidenceUrls).toEqual([
      "https://example.com/source",
    ]);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "/opencode-api/session?directory=%2Fworkspace%2Fboyuan",
    );
    const prompt = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(prompt.tools).toEqual({ "*": false });
    expect(prompt.parts[0].text).toContain("本对话未确认候选");
  });

  it("Exa 只接收规划后的公开查询并规范化可追溯来源", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        results: [
          {
            title: "白杨智能公开资料",
            url: "https://news.example.com/company",
            publishedDate: "2026-08-20T00:00:00.000Z",
            highlights: ["公司发布了新产品。"],
          },
        ],
      }),
    );
    const { search } = createRuntimeResearchAdapters(
      { BOYUAN_SEARCH_ADAPTER: "exa", EXA_API_KEY: "test-key" },
      {
        directory: "/workspace/boyuan",
        fetcher,
        now: () => new Date("2026-08-24T01:00:00.000Z"),
      },
    );

    const results = await search.search({
      companyName: "白杨智能有限公司",
      reason: "information_missing",
      query: "白杨智能有限公司 公司 最新 业务 产品 融资",
      maxResults: 5,
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.exa.ai/search");
    expect(init?.headers).toEqual(
      expect.objectContaining({ "x-api-key": "test-key" }),
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "白杨智能有限公司 公司 最新 业务 产品 融资",
      type: "auto",
      numResults: 5,
      contents: { highlights: { maxCharacters: 1200 } },
    });
    expect(results).toEqual([
      {
        title: "白杨智能公开资料",
        url: "https://news.example.com/company",
        site: "news.example.com",
        highlights: ["公司发布了新产品。"],
        accessStatus: "accessible",
        publishedAt: "2026-08-20T00:00:00.000Z",
        retrievedAt: "2026-08-24T01:00:00.000Z",
      },
    ]);
  });

  it("选择 Exa 时缺少密钥会在启动阶段失败", () => {
    expect(() =>
      createRuntimeResearchAdapters(
        { BOYUAN_SEARCH_ADAPTER: "exa" },
        { directory: "/workspace/boyuan" },
      ),
    ).toThrow(/EXA_API_KEY/);
  });
});
