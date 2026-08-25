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
        Response.json({ conversationId: "company-research/one" }),
      );
    const client = createResearchPlatformClient(fetcher);
    const file = new File(["fixture"], "白杨智能 BP.txt", {
      type: "text/plain",
    });

    await client.uploadDocument(file);
    await client.getConversation("conversation/one");
    await client.startCompanyResearch({
      companyName: "白杨智能有限公司",
      intent: "核验最新业务",
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
  });
});
