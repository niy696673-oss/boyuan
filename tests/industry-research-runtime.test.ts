// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createOpenCodeIndustryResearchAdapter } from "../server/research-platform/industry-research/opencode-industry-research.js";

describe("行业研究 OpenCode 运行时", () => {
  it("只使用传入的行业材料与公开来源，且禁用全部工具", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "industry-session-1" }))
      .mockResolvedValueOnce(Response.json({
        info: {
          providerID: "openai",
          modelID: "gpt-5.6-sol",
        },
        parts: [{
          type: "text",
          text: JSON.stringify({ summary: "行业中游由工业软件与解决方案构成。" }),
        }],
      }));
    const adapter = createOpenCodeIndustryResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      model: { providerId: "openai", modelId: "gpt-5.6-sol" },
      fetcher,
    });

    const result = await adapter.analyze({
      taskId: "task-1",
      conversationId: "conversation-1",
      industryId: "industry-1",
      industryName: "人工智能",
      intent: "分析产业链结构",
      industrySummary: "人工智能产业链",
      nodes: [{ stage: "midstream", name: "工业软件" }],
      materials: [{
        evidenceId: "evidence-1",
        fileName: "行业材料.txt",
        excerpt: "产业链中游包括工业软件。",
        locator: "paragraph:1",
      }],
      webResults: [{
        title: "公开来源",
        url: "https://example.com/industry",
        site: "example.com",
        highlights: ["行业趋势"],
        accessStatus: "accessible",
        retrievedAt: "2026-08-26T00:00:00.000Z",
      }],
    });

    expect(result).toMatchObject({
      providerId: "openai",
      modelId: "gpt-5.6-sol",
      sessionId: "industry-session-1",
      summary: "行业中游由工业软件与解决方案构成。",
    });
    const prompt = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(prompt.tools).toEqual({ "*": false });
    expect(prompt.parts[0].text).toContain("行业材料.txt");
    expect(prompt.parts[0].text).toContain("https://example.com/industry");
  });
});
