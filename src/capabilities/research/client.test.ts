// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createResearchPlatformClient } from "./client";

describe("ResearchPlatformClient", () => {
  it("通过 v1 接缝上传材料并读取编码后的对话地址", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          reusedDocument: false,
          conversation: { conversationId: "conversation/one" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ conversationId: "conversation/one" }),
      )
      .mockResolvedValueOnce(
        Response.json([
          { sourceId: "source/one", title: "白杨智能 BP.pdf" },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json({ conversationId: "company-research/one" }),
      )
      .mockResolvedValueOnce(
        Response.json({ conversationId: "industry-research/one" }),
      );
    const client = createResearchPlatformClient(fetcher);
    const file = new File(["fixture"], "白杨智能 BP.txt", {
      type: "text/plain",
    });

    await client.uploadDocument(file);
    await client.getConversation("conversation/one");
    await client.getCompanyResearchWorkflowSources?.("company/one");
    await client.startCompanyResearch({
      companyName: "白杨智能有限公司",
      intent: "核验最新业务",
      explicitWebSearch: true,
    });
    await client.startIndustryResearch({
      industryId: "industry/one",
      intent: "分析产业链趋势",
      explicitWebSearch: true,
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/v1/documents",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/v1/conversations/conversation%2Fone",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "/api/v1/companies/company%2Fone/workflow-sources",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      4,
      "/api/v1/company-research",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          companyName: "白杨智能有限公司",
          intent: "核验最新业务",
          explicitWebSearch: true,
        }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      5,
      "/api/v1/industry-research",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          industryId: "industry/one",
          intent: "分析产业链趋势",
          explicitWebSearch: true,
        }),
      }),
    );
  });
});
