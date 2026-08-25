import { describe, expect, it, vi } from "vitest";
import { ResearchPlatformApiError } from "../platform-http";
import { createCompanyDirectoryClient } from "./client";

describe("公司目录客户端", () => {
  it("通过公司接缝读取持久目录", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        total: 1,
        items: [{ companyId: "company-1", canonicalName: "云杉智能有限公司" }],
      }),
    );

    const result = await createCompanyDirectoryClient(fetcher).list();

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/companies",
      expect.objectContaining({ signal: undefined }),
    );
    expect(result).toMatchObject({
      total: 1,
      items: [{ companyId: "company-1" }],
    });
  });

  it("编码公司 ID 并保留服务端 404 语义", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          {
            error: "not_found",
            message: "company not found: missing / company",
          },
          { status: 404 },
        ),
      );

    const result =
      createCompanyDirectoryClient(fetcher).get("missing / company");

    await expect(result).rejects.toEqual(
      expect.objectContaining<Partial<ResearchPlatformApiError>>({
        status: 404,
        code: "not_found",
      }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/companies/missing%20%2F%20company",
      expect.objectContaining({ signal: undefined }),
    );
  });
});
