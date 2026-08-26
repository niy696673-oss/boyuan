// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadPlatformDocument } from "./platform-http";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("authenticated platform document download", () => {
  it("uses the production Bearer header and triggers an attachment Blob download", async () => {
    localStorage.setItem("boyuan-access-token", "production-token");
    localStorage.setItem("boyuan-user", "user-production");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("pdf bytes", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:download-fixture");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    let clickedDownload = "";
    let clickedHref = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        clickedDownload = this.download;
        clickedHref = this.href;
      },
    );

    await downloadPlatformDocument({
      documentId: "document/production",
      fileName: "项目 BP.pdf",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/documents/document%2Fproduction/content",
      expect.objectContaining({
        headers: {
          accept: "application/octet-stream",
          authorization: "Bearer production-token",
          "x-user-id": "user-production",
        },
      }),
    );
    const downloadedBlob = createObjectUrl.mock.calls[0]?.[0];
    expect(downloadedBlob).toBeInstanceOf(Blob);
    expect((downloadedBlob as Blob | undefined)?.type).toBe(
      "application/octet-stream",
    );
    expect(clickedDownload).toBe("项目 BP.pdf");
    expect(clickedHref).toBe("blob:download-fixture");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:download-fixture");
  });

  it.each([
    [401, "登录状态已失效，请重新登录后再下载"],
    [404, "原始文件不存在或已不可用"],
  ] as const)("maps HTTP %s to a visible download error", async (status, message) => {
    await expect(
      downloadPlatformDocument({
        documentId: "document-1",
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(
          new Response(null, { status }),
        ),
      }),
    ).rejects.toMatchObject({
      message,
      status,
    });
  });

  it("blocks text/html instead of opening or downloading it", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");

    await expect(
      downloadPlatformDocument({
        documentId: "document-1",
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(
          new Response("<script>unexpected()</script>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
        ),
      }),
    ).rejects.toThrow("下载响应是网页内容，已阻止打开以保护当前会话");
    expect(click).not.toHaveBeenCalled();
  });

  it("turns a network rejection into a retryable user-facing error", async () => {
    await expect(
      downloadPlatformDocument({
        documentId: "document-1",
        fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
      }),
    ).rejects.toThrow("网络连接失败，原始文件下载未完成");
  });
});
