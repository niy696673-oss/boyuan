// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  confirmableCompanyListRows,
  createCompanyListClient,
} from "./client";

describe("公司名单客户端", () => {
  it("上传名单、读取处理结果并提交确认", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ conversation: { conversationId: "conversation/1" } }))
      .mockResolvedValueOnce(Response.json({ conversationId: "conversation/1" }))
      .mockResolvedValueOnce(Response.json({ listId: "list/1" }));
    const client = createCompanyListClient(fetcher);

    await client.upload(new File(["公司名称\n云杉智能有限公司"], "公司名单.csv"));
    await client.getConversation("conversation/1");
    await client.confirm("list/1", [
      { rowId: "row-1", expectedVersion: 1, createName: "云杉智能有限公司" },
    ]);

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/v1/company-lists",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/v1/conversations/conversation%2F1",
      expect.objectContaining({ signal: undefined }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "/api/v1/company-lists/list%2F1/confirmations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          rows: [
            { rowId: "row-1", expectedVersion: 1, createName: "云杉智能有限公司" },
          ],
        }),
      }),
    );
  });

  it("只生成已有公司和新公司的自动确认决策", () => {
    const result = confirmableCompanyListRows([
      row("existing", { options: [company("company-1")] }),
      row("new", { rowId: "row-2", normalizedName: "松涛科技有限公司" }),
      row("ambiguous", { rowId: "row-3" }),
      row("failed", { rowId: "row-4" }),
    ]);

    expect(result).toEqual([
      { rowId: "row-1", expectedVersion: 1, companyId: "company-1" },
      { rowId: "row-2", expectedVersion: 1, createName: "松涛科技有限公司" },
    ]);
  });
});

function row(
  matchStatus: "existing" | "new" | "ambiguous" | "failed",
  overrides: Record<string, unknown> = {},
) {
  return {
    rowId: "row-1",
    rowOrder: 1,
    originalValue: "云杉智能有限公司",
    normalizedName: "云杉智能有限公司",
    matchStatus,
    confirmationStatus: "pending" as const,
    options: [],
    evidence: { evidenceId: "evidence-1", sourceType: "material" as const, quote: "云杉智能有限公司" },
    version: 1,
    ...overrides,
  };
}

function company(companyId: string) {
  return {
    companyId,
    canonicalName: "云杉智能有限公司",
    status: "active" as const,
    aliases: [],
    version: 1,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  };
}
