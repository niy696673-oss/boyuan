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
import { createDeterministicSearchAdapter } from "../server/research-platform/search/deterministic-search.js";
import { initialStoreData, Store } from "../server/store.js";

const roots: string[] = [];
const modules: PlatformModule[] = [];

afterEach(async () => {
  while (modules.length) modules.pop()?.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("研究平台 v1 行业目录接缝", () => {
  it("将不同公司的航空材料聚合到同一受控行业，而不是生成一企一行业", async () => {
    const { app, platform } = await fixture();
    for (const [company, fileName, detail] of [
      ["星航测控有限公司", "星航测控 BP.txt", "公司位于航空发动机测试产业链中游，面向精细化测压与试验验证。"],
      ["云翼装备有限公司", "云翼装备 BP.txt", "公司位于航空航天产业链中游，提供飞行器高端装备核心部件与系统集成。"],
    ] as const) {
      const uploaded = await request(app)
        .post("/api/v1/documents")
        .attach("file", Buffer.from(`${company}\n${detail}`), fileName);
      expect(uploaded.status).toBe(201);
    }
    for (let index = 0; index < 40; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    const directory = await request(app).get("/api/v1/industries");
    expect(directory.status).toBe(200);
    expect(directory.body).toMatchObject({
      total: 1,
      items: [
        {
          name: "航空航天与高端装备",
          companyCount: 2,
          materialCount: 2,
        },
      ],
    });
    expect(
      directory.body.items.some((item: { name: string }) =>
        item.name.endsWith("相关行业"),
      ),
    ).toBe(false);
    const reclassified = await request(app).post(
      "/api/v1/industries/reclassify",
    );
    expect(reclassified.status).toBe(200);
    expect(reclassified.body).toEqual({
      companies: 2,
      industries: 1,
      mergedIndustries: 0,
      unclassifiedMaterials: 0,
    });
    const detail = await platform.getIndustry(
      directory.body.items[0].industryId as string,
    );
    expect(detail.companies).toHaveLength(2);
    expect(detail.companies.every((company) => company.status === "candidate"))
      .toBe(true);
  });

  it("从材料分析结果返回持久行业、产业节点、材料和公司", async () => {
    const { app, platform } = await fixture();
    await seedIndustry(app, platform);

    const directory = await request(app).get("/api/v1/industries");
    expect(directory.status).toBe(200);
    expect(directory.body).toMatchObject({
      total: 1,
      unclassifiedMaterialCount: 0,
      items: [
        {
          name: "人工智能与企业服务",
          materialCount: 1,
          companyCount: 1,
        },
      ],
    });

    const industryId = directory.body.items[0].industryId as string;
    const detail = await request(app).get(`/api/v1/industries/${industryId}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      industryId,
      name: "人工智能与企业服务",
      nodes: [
        { stage: "upstream" },
        { stage: "midstream" },
        { stage: "downstream" },
      ],
      materials: [{ fileName: "云杉智能 BP.txt" }],
      companies: [
        {
          company: { canonicalName: "云杉智能有限公司" },
          nodeName: "产品与解决方案",
        },
      ],
    });
  });

  it("返回尚未形成行业证据的持久材料数量", async () => {
    const { app, platform } = await fixture();
    const uploaded = await request(app)
      .post("/api/v1/documents")
      .attach(
        "file",
        Buffer.from("木棉软件有限公司\n公司专注企业智能化服务。"),
        "木棉软件 BP.txt",
      );
    expect(uploaded.status).toBe(201);
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    const directory = await request(app).get("/api/v1/industries");
    expect(directory.status).toBe(200);
    expect(directory.body).toMatchObject({
      items: [],
      total: 0,
      unclassifiedMaterialCount: 1,
    });
  });

  it("行业详情在 SQLite 重启后保持一致，未知 ID 返回 404", async () => {
    const { app, dataRoot, platform, store } = await fixture();
    await seedIndustry(app, platform);
    const directory = await request(app).get("/api/v1/industries");
    const industryId = directory.body.items[0].industryId as string;

    platform.close();
    modules.splice(modules.indexOf(platform), 1);
    const reopened = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
    });
    modules.push(reopened);
    const restarted = createApp(store, createDemoServices(store), {
      researchPlatform: reopened,
    });

    const detail = await request(restarted).get(
      `/api/v1/industries/${industryId}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      industryId,
      materialCount: 1,
      companyCount: 1,
    });
    const missing = await request(restarted).get("/api/v1/industries/missing");
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: "not_found" });
  });

  it("行业材料上传和订阅状态写入 SQLite，并在目录与详情中同步", async () => {
    const { app, platform } = await fixture();
    await seedIndustry(app, platform);
    const companiesBefore = await platform.listCompanies();
    const candidatesBefore = await platform.listCandidates();
    const directory = await request(app).get("/api/v1/industries");
    const industry = directory.body.items[0] as {
      industryId: string;
      version: number;
    };

    const uploaded = await request(app)
      .post(`/api/v1/industries/${industry.industryId}/documents`)
      .attach(
        "file",
        Buffer.from("人工智能行业补充材料\n产业链中游包括工业软件。"),
        "人工智能行业补充.txt",
      );
    expect(uploaded.status).toBe(201);
    const conversationId = uploaded.body.conversation.conversationId as string;
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    const completed = await request(app).get(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
    );
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({
      status: "completed",
      industry: { industryId: industry.industryId },
      document: {
        parseStatus: "parsed",
        archiveStatus: "archived",
        materialType: "industry_material",
      },
      task: {
        status: "completed",
        steps: expect.arrayContaining([
          expect.objectContaining({
            name: "parse_document",
            status: "completed",
          }),
          expect.objectContaining({
            name: "identify_company",
            status: "skipped",
          }),
          expect.objectContaining({
            name: "suggest_conversation_reuse",
            status: "skipped",
          }),
          expect.objectContaining({
            name: "analyze_material",
            status: "skipped",
          }),
          expect.objectContaining({
            name: "generate_candidates",
            status: "skipped",
          }),
        ]),
      },
    });
    expect(
      (await platform.listCompanies()).map((item) => item.companyId),
    ).toEqual(companiesBefore.map((item) => item.companyId));
    expect(
      (await platform.listCandidates()).map((item) => item.candidateId),
    ).toEqual(candidatesBefore.map((item) => item.candidateId));

    const watched = await request(app)
      .put(`/api/v1/industries/${industry.industryId}/watch`)
      .send({ watched: true, expectedVersion: industry.version });
    expect(watched.status).toBe(200);
    expect(watched.body).toMatchObject({
      watched: true,
      version: industry.version + 1,
      materials: expect.arrayContaining([
        expect.objectContaining({
          conversationId,
          fileName: "人工智能行业补充.txt",
          materialType: "industry_material",
          status: "completed",
        }),
      ]),
    });

    const refreshed = await request(app).get("/api/v1/industries");
    expect(refreshed.body.items[0]).toMatchObject({
      watched: true,
      version: industry.version + 1,
    });
  });

  it("创建持久行业研究，服务重启后继续执行并保存来源与结果", async () => {
    const { app, dataRoot, platform, store } = await fixture();
    await seedIndustry(app, platform);
    const directory = await request(app).get("/api/v1/industries");
    const industryId = directory.body.items[0].industryId as string;

    const started = await request(app).post("/api/v1/industry-research").send({
      industryId,
      intent: "分析产业链结构、重点公司与关键趋势",
      explicitWebSearch: true,
    });
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({
      type: "industry",
      status: "waiting",
      industry: { industryId, name: "人工智能与企业服务" },
      task: {
        type: "industry_research",
        currentStep: "load_industry_context",
      },
    });
    const conversationId = started.body.conversationId as string;

    platform.close();
    modules.splice(modules.indexOf(platform), 1);
    const reopened = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
      industryResearch: createDeterministicIndustryResearchAdapter(),
      search: createDeterministicSearchAdapter(),
    });
    modules.push(reopened);
    const restarted = createApp(store, createDemoServices(store), {
      researchPlatform: reopened,
    });
    for (let index = 0; index < 20; index += 1) {
      if ((await reopened.runPendingSteps()) === 0) break;
    }

    const completed = await request(restarted).get(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
    );
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({
      status: "completed",
      industry: { industryId, name: "人工智能与企业服务" },
      industryResearch: {
        industryId,
        triggerReason: "user_requested",
        summary: expect.stringContaining("人工智能"),
        sources: [expect.objectContaining({
          sourceType: "web",
          title: "人工智能与企业服务公开信息",
          site: "example.com",
          url: "https://example.com/companies/%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%E4%B8%8E%E4%BC%81%E4%B8%9A%E6%9C%8D%E5%8A%A1",
          accessStatus: "accessible",
          retrievedAt: "2026-08-24T00:00:00.000Z",
        })],
      },
      task: {
        status: "completed",
        resultStatus: "validated",
        steps: expect.arrayContaining([
          expect.objectContaining({ name: "analyze_industry", status: "completed" }),
        ]),
      },
    });

    const detail = await request(restarted).get(`/api/v1/industries/${industryId}`);
    expect(detail.body.researchRecords).toEqual([
      expect.objectContaining({
        conversationId,
        status: "completed",
        summary: expect.stringContaining("人工智能"),
      }),
    ]);
  });
});

async function seedIndustry(
  app: ReturnType<typeof createApp>,
  platform: PlatformModule,
) {
  const uploaded = await request(app)
    .post("/api/v1/documents")
    .attach(
      "file",
      Buffer.from(
        "云杉智能有限公司\n公司专注企业智能化服务。\n公司位于人工智能产业中游，提供工业软件。",
      ),
      "云杉智能 BP.txt",
    );
  expect(uploaded.status).toBe(201);
  for (let index = 0; index < 20; index += 1) {
    if ((await platform.runPendingSteps()) === 0) break;
  }
}

async function fixture() {
  const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-industry-v1-"));
  roots.push(dataRoot);
  const platform = createPlatformModule({
    dataRoot,
    analysis: createDeterministicAnalysisAdapter(),
    industryResearch: createDeterministicIndustryResearchAdapter(),
    search: createDeterministicSearchAdapter(),
  });
  modules.push(platform);
  const store = new Store({
    initialData: initialStoreData(),
    persistToDisk: false,
  });
  return {
    dataRoot,
    platform,
    store,
    app: createApp(store, createDemoServices(store), {
      researchPlatform: platform,
    }),
  };
}
