import { describe, expect, it, vi } from "vitest";
import { ResearchPlatformApiError } from "../platform-http";
import { createIndustryDirectoryClient } from "./client";

describe("行业目录客户端", () => {
  it("读取持久行业列表并编码详情 ID", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [], total: 0, unclassifiedMaterialCount: 0 }))
      .mockResolvedValueOnce(Response.json({ industryId: "industry/1" }));
    const client = createIndustryDirectoryClient(fetcher);

    await client.list();
    await client.get("industry/1");

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/v1/industries",
      expect.objectContaining({ signal: undefined }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/v1/industries/industry%2F1",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("保留未知行业的 404 语义", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { error: "not_found", message: "industry not found: missing" },
        { status: 404 },
      ),
    );

    await expect(createIndustryDirectoryClient(fetcher).get("missing"))
      .rejects.toEqual(
        expect.objectContaining<Partial<ResearchPlatformApiError>>({
          status: 404,
          code: "not_found",
        }),
      );
  });
});
