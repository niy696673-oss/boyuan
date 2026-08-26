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

  it("上传行业材料并使用版本保存订阅状态", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ conversation: {}, reusedDocument: false }))
      .mockResolvedValueOnce(Response.json({ industryId: "industry/1", watched: true }));
    const client = createIndustryDirectoryClient(fetcher);
    const file = new File(["行业材料"], "行业材料.txt", { type: "text/plain" });

    await client.uploadDocument("industry/1", file);
    await client.setWatched("industry/1", true, 2);

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/v1/industries/industry%2F1/documents",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/v1/industries/industry%2F1/watch",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ watched: true, expectedVersion: 2 }),
      }),
    );
  });

  it("通过 v1 行业接缝重新分类", async () => {
    const response = {
      companies: 4,
      industries: 2,
      mergedIndustries: 1,
      unclassifiedMaterials: 3,
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    const client = createIndustryDirectoryClient(fetcher);

    await expect(client.reclassify()).resolves.toEqual(response);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/industries/reclassify",
      expect.objectContaining({ method: "POST", signal: undefined }),
    );
  });
});
