import { describe, expect, it, vi } from "vitest";
import { createReviewQueueClient } from "./client";

describe("待确认队列客户端", () => {
  it("通过唯一队列接缝读取页面所需数据", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        total: 1,
        items: [
          {
            candidateId: "candidate-1",
            companyId: "company-1",
            sectionKey: "company_and_project_stage",
            knowledgeType: "company_summary",
            statement: "白杨智能专注企业智能化服务。",
            status: "pending",
            version: 1,
            highImpact: false,
            sensitive: false,
            evidence: [],
            company: {
              companyId: "company-1",
              canonicalName: "白杨智能有限公司",
              aliases: [],
              version: 1,
            },
            currentKnowledge: [],
            createdAt: "2026-08-26T00:00:00.000Z",
            updatedAt: "2026-08-26T00:00:00.000Z",
          },
        ],
      }),
    );

    const result = await createReviewQueueClient(fetcher).list();

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/review-queue",
      expect.objectContaining({ signal: undefined }),
    );
    expect(result).toMatchObject({
      total: 1,
      items: [
        {
          candidateId: "candidate-1",
          company: { canonicalName: "白杨智能有限公司" },
        },
      ],
    });
  });

  it("通过单一决定接缝提交修改确认", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        candidate: {
          candidateId: "candidate / 1",
          status: "modified_confirmed",
        },
        company: { companyId: "company-1", canonicalName: "白杨智能有限公司" },
        currentKnowledge: [],
        remainingCount: 0,
      }),
    );
    const client = createReviewQueueClient(fetcher);

    await client.decide("candidate / 1", {
      expectedVersion: 2,
      action: "modify",
      statement: "经人工确认：公司专注企业智能化服务。",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/review-queue/candidate%20%2F%201/decision",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          accept: "application/json",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          expectedVersion: 2,
          action: "modify",
          statement: "经人工确认：公司专注企业智能化服务。",
        }),
      }),
    );
  });
});
