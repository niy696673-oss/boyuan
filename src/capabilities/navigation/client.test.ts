import { describe, expect, it, vi } from "vitest";
import { createPlatformNavigationClient } from "./client";

describe("平台导航客户端", () => {
  it("编码全局搜索并读取、标记通知", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ query: "人工 智能", companies: [] }))
      .mockResolvedValueOnce(Response.json({ items: [], unreadCount: 0 }))
      .mockResolvedValueOnce(Response.json({ notificationId: "task:1", readAt: "now" }));
    const client = createPlatformNavigationClient(fetcher);

    await client.search("人工 智能");
    await client.notifications();
    await client.markNotificationRead("task:1");

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/v1/search?q=%E4%BA%BA%E5%B7%A5%20%E6%99%BA%E8%83%BD",
      expect.any(Object),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "/api/v1/notifications/task%3A1/read",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
