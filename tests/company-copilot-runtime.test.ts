// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { CompanyCopilotInput } from "../server/research-platform/copilot/contracts.js";
import { createOpenCodeCompanyCopilotAdapter } from "../server/research-platform/copilot/opencode-copilot.js";
import { createRuntimeCompanyCopilotAdapter } from "../server/research-platform/copilot/runtime-copilot.js";

describe("公司 Copilot OpenCode 适配器", () => {
  it("首次提问创建独立 Session，并以自由文本回答且禁用工具", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "copilot-session-1" }))
      .mockResolvedValueOnce(
        Response.json({
          info: { providerID: "openai", modelID: "gpt-5.6-sol" },
          parts: [
            {
              type: "text",
              text: "已确认知识显示，该公司聚焦企业研究智能化。",
            },
          ],
        }),
      );
    const adapter = createOpenCodeCompanyCopilotAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      model: { providerId: "openai", modelId: "gpt-5.6-sol" },
      variant: "high",
      fetcher,
    });

    await expect(adapter.chat(input())).resolves.toEqual({
      sessionId: "copilot-session-1",
      providerId: "openai",
      modelId: "gpt-5.6-sol",
      answer: "已确认知识显示，该公司聚焦企业研究智能化。",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const createBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(createBody.title).toBe("博源公司 Copilot：博源科技");
    const messageBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(messageBody).toMatchObject({
      model: { providerID: "openai", modelID: "gpt-5.6-sol" },
      variant: "high",
      tools: { "*": false },
    });
    expect(messageBody.system).toContain("不要输出 JSON");
    expect(messageBody.system).toContain("材料自陈");
    expect(messageBody.system).toContain("待确认");
    expect(messageBody.parts[0].text).toContain("正式知识（已确认）");
    expect(messageBody.parts[0].text).toContain("材料摘要（材料自陈，未核实）");
    expect(messageBody.parts[0].text).toContain("创始人履历待交叉验证");
  });

  it("后续提问复用传入的 Session，不再创建 Session", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        info: { providerID: "openai", modelID: "gpt-5.6-sol" },
        parts: [{ type: "text", text: "可以，我们继续看客户结构。" }],
      }),
    );
    const adapter = createOpenCodeCompanyCopilotAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });

    await expect(
      adapter.chat({ ...input(), sessionId: "copilot-session-existing" }),
    ).resolves.toMatchObject({
      sessionId: "copilot-session-existing",
      answer: "可以，我们继续看客户结构。",
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "/session/copilot-session-existing/message",
    );
  });

  it("运行时复用现有 OpenCode 环境，并允许 Copilot 覆盖模型", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "runtime-session" }))
      .mockResolvedValueOnce(
        Response.json({
          info: { providerID: "openai", modelID: "gpt-5.6-luna" },
          parts: [{ type: "text", text: "回答" }],
        }),
      );
    const adapter = createRuntimeCompanyCopilotAdapter(
      {
        BOYUAN_OPENCODE_BASE_URL: "http://127.0.0.1:4173/opencode-api/",
        BOYUAN_OPENCODE_DIRECTORY: "/runtime/boyuan",
        BOYUAN_DEEP_OPENCODE_PROVIDER_ID: "openai",
        BOYUAN_DEEP_OPENCODE_MODEL_ID: "gpt-5.6-sol",
        BOYUAN_COPILOT_PROVIDER_ID: "openai",
        BOYUAN_COPILOT_MODEL_ID: "gpt-5.6-luna",
        BOYUAN_COPILOT_VARIANT: "medium",
      },
      { directory: "/fallback", fetcher },
    );

    await adapter.chat(input());

    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "directory=%2Fruntime%2Fboyuan",
    );
    const body = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(body.model).toEqual({
      providerID: "openai",
      modelID: "gpt-5.6-luna",
    });
    expect(body.variant).toBe("medium");
  });
});

function input(): CompanyCopilotInput {
  return {
    companyId: "company-1",
    companyName: "博源科技",
    question: "这家公司做什么？",
    context: {
      confirmedKnowledge: [
        { text: "公司聚焦企业研究智能化。", source: "已确认知识 K-001" },
      ],
      materialSummaries: [
        { text: "材料自称已有 20 家客户。", source: "BP 第 8 页" },
      ],
      pendingInformation: [{ text: "创始人履历待交叉验证。" }],
    },
  };
}
