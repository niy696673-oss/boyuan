// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { createDemoServices } from "../server/platform/runtime.js";
import { createDeterministicAnalysisAdapter } from "../server/research-platform/analysis/deterministic-analysis.js";
import { createDeterministicIndustryResearchAdapter } from "../server/research-platform/industry-research/deterministic-industry-research.js";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createPlatformModule } from "../server/research-platform/platform-module.js";
import { initialStoreData, Store } from "../server/store.js";

const roots: string[] = [];
const modules: PlatformModule[] = [];

afterEach(async () => {
  while (modules.length) modules.pop()?.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("全局搜索与通知接缝", () => {
  it("搜索 SQLite 中的公司、行业、材料和会话", async () => {
    const { app, platform } = await fixture();
    await seed(app, platform);

    const company = (await platform.listCompanies())[0];
    if (!company) throw new Error("seed company missing");
    await platform.startCompanyResearch({
      companyId: company.companyId,
      intent: "检索独有词：核验最新公开进展",
      explicitWebSearch: false,
    });

    const response = await request(app).get("/api/v1/search").query({ q: "云杉智能" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      query: "云杉智能",
      mode: "semantic",
      companies: expect.arrayContaining([
        expect.objectContaining({ canonicalName: "云杉智能有限公司" }),
      ]),
      materials: expect.arrayContaining([
        expect.objectContaining({ fileName: "云杉智能 BP.txt" }),
      ]),
      conversations: expect.arrayContaining([
        expect.objectContaining({ title: "云杉智能 BP.txt" }),
      ]),
    });

    const researchRequest = await request(app)
      .get("/api/v1/search")
      .query({ q: "检索独有词" });
    expect(researchRequest.status).toBe(200);
    expect(researchRequest.body.conversations).toEqual([
      expect.objectContaining({ title: "云杉智能有限公司公司研究" }),
    ]);
    expect(researchRequest.body.materials).toEqual([]);

    const industry = (await platform.listIndustries())[0];
    if (!industry) throw new Error("seed industry missing");
    const industryConversation = await platform.startIndustryResearch({
      industryId: industry.industryId,
      intent: "行业研究独有词：核验产业链变化",
      explicitWebSearch: true,
    });
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    const industryResearchRequest = await request(app)
      .get("/api/v1/search")
      .query({ q: "行业研究独有词" });
    expect(industryResearchRequest.status).toBe(200);
    expect(industryResearchRequest.body.conversations).toEqual([
      expect.objectContaining({
        conversationId: industryConversation.conversationId,
        title: "人工智能与企业服务行业研究",
      }),
    ]);

    const industrySourceRequest = await request(app)
      .get("/api/v1/search")
      .query({ q: "火星坚果源词" });
    expect(industrySourceRequest.status).toBe(200);
    expect(industrySourceRequest.body.conversations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conversationId: industryConversation.conversationId,
        title: "人工智能与企业服务行业研究",
      }),
    ]));
  });

  it("从待确认和研究任务生成通知，并持久保存已读状态", async () => {
    const { app, platform } = await fixture();
    await seed(app, platform);

    const initial = await request(app).get("/api/v1/notifications");
    expect(initial.status).toBe(200);
    expect(initial.body.unreadCount).toBeGreaterThan(0);
    const item = initial.body.items[0] as { notificationId: string };

    const marked = await request(app)
      .post(`/api/v1/notifications/${encodeURIComponent(item.notificationId)}/read`);
    expect(marked.status).toBe(200);
    expect(marked.body.readAt).toEqual(expect.any(String));

    const refreshed = await request(app).get("/api/v1/notifications");
    expect(refreshed.body.items).toContainEqual(
      expect.objectContaining({
        notificationId: item.notificationId,
        readAt: marked.body.readAt,
      }),
    );
  });
});

async function seed(app: ReturnType<typeof createApp>, platform: PlatformModule) {
  const uploaded = await request(app)
    .post("/api/v1/documents")
    .attach(
      "file",
      Buffer.from("云杉智能有限公司\n公司位于人工智能产业中游，提供工业软件。"),
      "云杉智能 BP.txt",
    );
  expect(uploaded.status).toBe(201);
  for (let index = 0; index < 20; index += 1) {
    if ((await platform.runPendingSteps()) === 0) break;
  }
}

async function fixture() {
  const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-navigation-v1-"));
  roots.push(dataRoot);
  const platform = createPlatformModule({
    dataRoot,
    analysis: createDeterministicAnalysisAdapter(),
    industryResearch: createDeterministicIndustryResearchAdapter(),
    search: {
      async search() {
        return [{
          title: "行业公开资料",
          url: "https://example.com/industry/source",
          site: "example.com",
          highlights: ["火星坚果源词"],
          accessStatus: "accessible" as const,
          retrievedAt: "2026-08-27T00:00:00.000Z",
        }];
      },
    },
  });
  modules.push(platform);
  const store = new Store({ initialData: initialStoreData(), persistToDisk: false });
  return {
    platform,
    app: createApp(store, createDemoServices(store), { researchPlatform: platform }),
  };
}
