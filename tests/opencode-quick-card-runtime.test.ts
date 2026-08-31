// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  createOpenCodeQuickCardAdapter,
  parseQuickCardJson,
} from "../server/research-platform/quick-card/opencode-quick-card.js";
import { createRuntimeQuickCardAdapter } from "../server/research-platform/quick-card/runtime-quick-card.js";

const fields = {
  companyName: "博源科技",
  companyIdentity: "博源科技 · 杭州 · 2021 年成立",
  productTechnology: "AI 推理基础设施研究工作台",
  industryTrack: "企业研究智能化 · 机构知识平台",
  marketView: "机构研究智能化需求增长，规模待核验",
  financing: "材料未披露",
  keyPeople: "CEO 田阳",
  companyRegion: "杭州",
  financingStage: "A轮",
  financingAmountWan: 2_000,
  highlights: ["知识沉淀闭环"],
  riskSignals: ["客户集中度待核验"],
  diligenceQuestions: ["前五大客户收入占比是多少？"],
  industryTags: ["AI推理基础设施"],
  competitorNames: ["晶泰科技"],
  upstreamNames: [],
  downstreamNames: ["投资机构"],
};

describe("OpenCode 快速卡适配器", () => {
  it("使用独立 Luna 模型、禁用工具并只返回设计卡字段", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: "quick-session" }))
      .mockResolvedValueOnce(
        jsonResponse({
          info: {
            providerID: "openai",
            modelID: "gpt-5.6-luna",
            variant: "none",
          },
          parts: [{ type: "text", text: JSON.stringify(fields) }],
        }),
      );
    const adapter = createOpenCodeQuickCardAdapter({
      baseUrl: new URL("http://127.0.0.1:4096"),
      credentials: { username: "opencode", password: "secret" },
      directory: "/workspace",
      model: { providerId: "openai", modelId: "gpt-5.6-luna" },
      variant: "none",
      fetcher,
    });

    await expect(
      adapter.analyze({
        conversationId: "conversation-1",
        documentId: "document-1",
        fileName: "BP.pdf",
        blocks: [
          {
            blockId: "paragraph-1",
            kind: "paragraph",
            text: "博源科技专注企业研究智能化。",
          },
        ],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        ...fields,
        modelId: "gpt-5.6-luna",
        variant: "none",
        sessionId: "quick-session",
      }),
    );

    const body = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)) as {
      model: unknown;
      variant: string;
      tools: Record<string, boolean>;
      parts: Array<{ text: string }>;
    };
    expect(body).toMatchObject({
      model: { providerID: "openai", modelID: "gpt-5.6-luna" },
      variant: "none",
    });
    expect(body.tools).toEqual({ "*": false });
    expect(body.parts[0]?.text).toContain("paragraph-1");
    expect(body.parts[0]?.text).toContain("competitorNames");
    expect(body.parts[0]?.text).toContain("financingAmountWan");
    expect(body.parts[0]?.text).toContain("AI推理基础设施");
    expect(body.parts[0]?.text).not.toContain("13 个 BP 维度");
    expect(
      fetcher.mock.calls.every((call) => call[1]?.signal === undefined),
    ).toBe(true);
  });

  it("拒绝未知、缺失或类型错误的完成卡字段", () => {
    expect(() =>
      parseQuickCardJson(JSON.stringify({ ...fields, evidence: [] })),
    ).toThrow("unknown fields");
    const missing: Record<string, unknown> = { ...fields };
    Reflect.deleteProperty(missing, "companyIdentity");
    expect(() => parseQuickCardJson(JSON.stringify(missing))).toThrow(
      "companyIdentity",
    );
    expect(() =>
      parseQuickCardJson(
        JSON.stringify({ ...fields, upstreamNames: "供应商" }),
      ),
    ).toThrow("upstreamNames");
    expect(() => parseQuickCardJson(JSON.stringify({
      ...fields,
      financingAmountWan: '2000',
    }))).toThrow('financingAmountWan');
    expect(() => parseQuickCardJson(JSON.stringify({
      ...fields,
      industryTags: ['模型随意生成的行业'],
    }))).toThrow('industryTags');
  });
});

describe("快速卡运行时选择", () => {
  it("默认关闭，并在显式启用时要求独立 Luna 模型", () => {
    expect(
      createRuntimeQuickCardAdapter({}, { directory: "/workspace" }),
    ).toBeUndefined();
    expect(() =>
      createRuntimeQuickCardAdapter(
        {
          BOYUAN_QUICK_CARD_ADAPTER: "opencode",
          BOYUAN_OPENCODE_BASE_URL: "http://127.0.0.1:4173/opencode-api/",
        },
        { directory: "/workspace" },
      ),
    ).toThrow(/BOYUAN_QUICK_CARD_PROVIDER_ID/);
  });

});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
