// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { createDemoServices } from "../server/platform/runtime.js";
import { createDeterministicAnalysisAdapter } from "../server/research-platform/analysis/deterministic-analysis.js";
import type { MaterialAnalysisPort } from "../server/research-platform/analysis/contracts.js";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createPlatformModule } from "../server/research-platform/platform-module.js";
import { initialStoreData, Store } from "../server/store.js";

const roots: string[] = [];
const modules: PlatformModule[] = [];

afterEach(async () => {
  while (modules.length) modules.pop()?.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("研究平台 v1 公司目录接缝", () => {
  it("目录隐藏只有失败空任务的占位公司，但仍可按 ID 审计", async () => {
    const { app, platform } = await fixture({
      analysis: {
        async analyze() {
          throw new Error("fixture_analysis_failed");
        },
      },
    });
    const uploaded = await request(app)
      .post("/api/v1/documents")
      .attach(
        "file",
        Buffer.from("失败占位科技有限公司\n公司材料解析后分析失败。"),
        "失败占位科技 BP.txt",
      );
    expect(uploaded.status).toBe(201);
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    const conversation = await platform.getConversation(
      uploaded.body.conversation.conversationId,
    );
    const companyId = conversation.company?.companyId;
    expect(companyId).toEqual(expect.any(String));
    expect(conversation.task.status).toBe("failed");
    expect(await platform.listCompanies()).toEqual([]);
    expect(await platform.getCompany(companyId!)).toMatchObject({
      companyId,
      canonicalName: "失败占位科技有限公司",
    });
  });

  it("清理材料来源前缀，并在候选未确认时返回最新 13 维材料分析", async () => {
    const { app, platform } = await fixture();
    const uploaded = await request(app)
      .post("/api/v1/documents")
      .attach(
        "file",
        Buffer.from("航空发动机精细化测压系统\n项目面向航空发动机测试市场。"),
        "创新组11+航空发动机精细化测压系统.pdf.txt",
      );
    expect(uploaded.status).toBe(201);
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    const directory = await request(app).get("/api/v1/companies");
    expect(directory.status).toBe(200);
    expect(directory.body).toMatchObject({
      total: 1,
      items: [
        {
          canonicalName: "航空发动机精细化测压系统",
          knowledgeCount: 0,
          pendingCandidateCount: expect.any(Number),
          latestMaterialAnalysis: {
            taskStatus: "completed",
            sectionCount: 13,
            summary: expect.any(String),
          },
        },
      ],
    });
    expect(directory.body.items[0].pendingCandidateCount).toBeGreaterThan(0);

    const companyId = directory.body.items[0].companyId as string;
    const detail = await request(app).get(`/api/v1/companies/${companyId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.knowledge).toEqual([]);
    expect(detail.body.latestMaterialAnalysis.sections).toHaveLength(13);
  });

  it("创新组材料披露明确项目公司时使用法律主体，而不是项目标题", async () => {
    const { app, platform } = await fixture();
    const uploaded = await request(app)
      .post("/api/v1/documents")
      .attach(
        "file",
        Buffer.from(
          "项目公司为北京星河航空科技有限公司。合作方为上海海纳材料有限公司。",
        ),
        "创新组12+航空发动机温度测试系统.pdf.txt",
      );
    expect(uploaded.status).toBe(201);
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    expect(await platform.listCompanies()).toEqual([
      expect.objectContaining({
        canonicalName: "北京星河航空科技有限公司",
      }),
    ]);
  });

  it("返回持久公司及页面所需的材料、正式知识和待确认计数", async () => {
    const { app, platform } = await fixture();
    await seedConfirmedCompany(app, platform);

    const response = await request(app).get("/api/v1/companies");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      total: 1,
      items: [
        {
          canonicalName: "云杉智能有限公司",
          materialCount: 1,
          knowledgeCount: 1,
          pendingCandidateCount: 0,
          profile: {
            summary: {
              value: expect.any(String),
              state: "confirmed",
            },
          },
        },
      ],
    });
    expect(response.body.items[0].companyId).toEqual(expect.any(String));
  });

  it("新材料进入队列后，目录展示真正的最新分析状态而不是旧结果", async () => {
    const { app, platform } = await fixture();
    const companyId = await seedConfirmedCompany(app, platform);
    const uploaded = await request(app)
      .post(`/api/v1/companies/${companyId}/documents`)
      .attach(
        "file",
        Buffer.from("云杉智能有限公司\n这是尚未开始处理的新一轮材料。"),
        "云杉智能补充材料.txt",
      );
    expect(uploaded.status).toBe(201);

    const directory = await request(app).get("/api/v1/companies");
    expect(directory.body.items[0].latestMaterialAnalysis).toMatchObject({
      taskId: uploaded.body.conversation.task.taskId,
      taskStatus: "queued",
      sectionCount: 0,
    });
  });

  it("返回公司正式知识、证据和材料，并在重启后保持一致", async () => {
    const { app, dataRoot, platform, store } = await fixture();
    const companyId = await seedConfirmedCompany(app, platform);

    const response = await request(app).get(`/api/v1/companies/${companyId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      companyId,
      canonicalName: "云杉智能有限公司",
      materialCount: 1,
      pendingCandidateCount: 0,
      materials: [{ fileName: "云杉智能 BP.txt" }],
      knowledge: [
        {
          statement: expect.any(String),
          status: "current",
          evidence: [
            {
              sourceType: "material",
              fileName: "云杉智能 BP.txt",
              quote: "云杉智能有限公司",
            },
          ],
        },
      ],
    });

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

    const afterRestart = await request(restarted).get(
      `/api/v1/companies/${companyId}`,
    );
    expect(afterRestart.status).toBe(200);
    expect(afterRestart.body).toMatchObject({
      companyId,
      materialCount: 1,
      knowledge: [{ statement: expect.any(String) }],
    });
  });

  it("未知公司返回 404，而不是其他公司的档案", async () => {
    const { app } = await fixture();

    const response = await request(app).get("/api/v1/companies/not-found");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: "not_found" });
  });

  it("从公司详情上传时始终绑定当前公司，并在处理后刷新材料与候选数量", async () => {
    const { app, platform } = await fixture();
    const companyId = await seedConfirmedCompany(app, platform);

    const uploaded = await request(app)
      .post(`/api/v1/companies/${companyId}/documents`)
      .attach(
        "file",
        Buffer.from("松涛科技有限公司\n本轮融资金额为 2 亿元。"),
        "松涛科技 BP.txt",
      );

    expect(uploaded.status).toBe(201);
    expect(uploaded.body.conversation.company.companyId).toBe(companyId);
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    const detail = await request(app).get(`/api/v1/companies/${companyId}`);
    const directory = await request(app).get("/api/v1/companies");
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      companyId,
      materialCount: 2,
      materials: expect.arrayContaining([
        expect.objectContaining({ fileName: "松涛科技 BP.txt" }),
      ]),
    });
    expect(detail.body.pendingCandidateCount).toBeGreaterThan(0);
    expect(directory.body.total).toBe(1);
  });

  it("关注状态使用公司版本写入 SQLite，并在重启后保留", async () => {
    const { app, dataRoot, platform, store } = await fixture();
    const companyId = await seedConfirmedCompany(app, platform);
    const before = await request(app).get(`/api/v1/companies/${companyId}`);

    const watched = await request(app)
      .put(`/api/v1/companies/${companyId}/watch`)
      .send({ watched: true, expectedVersion: before.body.version });

    expect(watched.status).toBe(200);
    expect(watched.body.profile.watched).toBe(true);
    expect(watched.body.version).toBe(before.body.version + 1);

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
    const afterRestart = await request(restarted).get(
      `/api/v1/companies/${companyId}`,
    );
    expect(afterRestart.body.profile.watched).toBe(true);
  });

  it("人工确认研究主体类型，并可关联或合并到已确认的法律公司", async () => {
    const { app, platform } = await fixture();
    for (const [fileName, content] of [
      ["云杉智能有限公司 BP.txt", "云杉智能有限公司\n公司提供智能制造服务。"],
      ["航空发动机测压系统 BP.txt", "航空发动机测压系统\n项目处于工程验证阶段。"],
      ["航空发动机压力计 BP.txt", "航空发动机压力计\n项目用于发动机压力测试。"],
    ] as const) {
      const uploaded = await request(app)
        .post("/api/v1/documents")
        .attach("file", Buffer.from(content), fileName);
      expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
      for (let index = 0; index < 20; index += 1) {
        if ((await platform.runPendingSteps()) === 0) break;
      }
    }

    const directory = (await request(app).get("/api/v1/companies")).body.items;
    const legal = directory.find(
      (item: { canonicalName: string }) => item.canonicalName === "云杉智能有限公司",
    );
    const project = directory.find(
      (item: { canonicalName: string }) => item.canonicalName === "航空发动机测压系统",
    );
    const duplicate = directory.find(
      (item: { canonicalName: string }) => item.canonicalName === "航空发动机压力计",
    );
    expect(legal).toMatchObject({
      subjectKind: "unknown",
      subjectKindStatus: "pending",
      suggestedSubjectKind: "legal_company",
    });
    expect(project).toMatchObject({
      subjectKind: "unknown",
      subjectKindStatus: "pending",
      suggestedSubjectKind: "project",
    });

    const confirmedLegal = await request(app)
      .put(`/api/v1/companies/${legal.companyId}/subject-resolution`)
      .send({
        expectedVersion: legal.version,
        action: "confirm",
        subjectKind: "legal_company",
      });
    expect(confirmedLegal.status).toBe(200);
    expect(confirmedLegal.body).toMatchObject({
      subjectKind: "legal_company",
      subjectKindStatus: "confirmed",
    });

    const linked = await request(app)
      .put(`/api/v1/companies/${project.companyId}/subject-resolution`)
      .send({
        expectedVersion: project.version,
        action: "link",
        subjectKind: "project",
        targetCompanyId: legal.companyId,
      });
    expect(linked.status).toBe(200);
    expect(linked.body).toMatchObject({
      subjectKind: "project",
      subjectKindStatus: "confirmed",
      parentCompany: {
        companyId: legal.companyId,
        canonicalName: "云杉智能有限公司",
      },
    });

    const merged = await request(app)
      .put(`/api/v1/companies/${duplicate.companyId}/subject-resolution`)
      .send({
        expectedVersion: duplicate.version,
        action: "merge",
        targetCompanyId: legal.companyId,
      });
    expect(merged.status).toBe(200);
    expect(merged.body).toMatchObject({
      companyId: legal.companyId,
      materialCount: 2,
      subjectKind: "legal_company",
      subjectKindStatus: "confirmed",
    });
    expect(
      (await request(app).get(`/api/v1/companies/${duplicate.companyId}`)).status,
    ).toBe(404);
    const queue = await request(app).get("/api/v1/review-queue");
    expect(
      queue.body.items.some(
        (item: { companyId: string }) => item.companyId === duplicate.companyId,
      ),
    ).toBe(false);
    expect(
      queue.body.items.some(
        (item: { companyId: string }) => item.companyId === legal.companyId,
      ),
    ).toBe(true);
  });
});

async function seedConfirmedCompany(
  app: ReturnType<typeof createApp>,
  platform: PlatformModule,
) {
  const uploaded = await request(app)
    .post("/api/v1/documents")
    .attach(
      "file",
      Buffer.from("云杉智能有限公司\n公司专注企业智能化服务。"),
      "云杉智能 BP.txt",
    );
  expect(uploaded.status).toBe(201);
  for (let index = 0; index < 20; index += 1) {
    if ((await platform.runPendingSteps()) === 0) break;
  }
  const queue = await request(app).get("/api/v1/review-queue");
  expect(queue.status).toBe(200);
  const candidate = queue.body.items[0] as {
    candidateId: string;
    companyId: string;
    version: number;
  };
  expect(candidate).toBeTruthy();
  const confirmed = await request(app)
    .post(`/api/v1/review-queue/${candidate.candidateId}/decision`)
    .send({ expectedVersion: candidate.version, action: "confirm" });
  expect(confirmed.status).toBe(200);
  return candidate.companyId;
}

async function fixture(options: { analysis?: MaterialAnalysisPort } = {}) {
  const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-company-v1-"));
  roots.push(dataRoot);
  const platform = createPlatformModule({
    dataRoot,
    analysis: options.analysis ?? createDeterministicAnalysisAdapter(),
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
