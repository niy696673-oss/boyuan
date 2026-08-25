// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { createDemoServices } from "../server/platform/runtime.js";
import { createDeterministicAnalysisAdapter } from "../server/research-platform/analysis/deterministic-analysis.js";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createPlatformModule } from "../server/research-platform/platform-module.js";
import { createDeterministicResearchAdapter } from "../server/research-platform/research/deterministic-research.js";
import type { CompanyResearchInput } from "../server/research-platform/research/contracts.js";
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

describe("研究平台 v1 HTTP 接缝", () => {
  it("创建带公开来源的公司研究对话并持久化候选", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-research-v1-"));
    roots.push(dataRoot);
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
      research: createDeterministicResearchAdapter(),
      search: createDeterministicSearchAdapter(),
    });
    modules.push(platform);
    const store = new Store({
      initialData: initialStoreData(),
      persistToDisk: false,
    });
    const app = createApp(store, createDemoServices(store), {
      researchPlatform: platform,
    });

    const started = await request(app).post("/api/v1/company-research").send({
      companyName: "白杨智能有限公司",
      intent: "核验最新业务与融资动态",
      explicitWebSearch: true,
    });

    expect(started.status).toBe(201);
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }
    const detail = await request(app).get(
      `/api/v1/conversations/${encodeURIComponent(started.body.conversationId)}`,
    );

    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      type: "company",
      status: "completed",
      company: { canonicalName: "白杨智能有限公司" },
      companyResearch: {
        triggerReason: "user_requested",
        sources: [
          {
            sourceType: "web",
            site: "example.com",
            accessStatus: "accessible",
          },
        ],
      },
      candidates: [
        {
          status: "pending",
          sectionKey: "company_research",
          evidence: [{ sourceType: "web", site: "example.com" }],
        },
      ],
    });
  });

  it("不把争议知识作为正式知识发送给公司研究模型", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-research-v1-"));
    roots.push(dataRoot);
    const researchInputs: CompanyResearchInput[] = [];
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
      research: {
        async analyze(input) {
          researchInputs.push(input);
          return {
            providerId: "research-boundary-test",
            modelId: "research-boundary-test",
            sessionId: input.sessionId ?? `research-${input.taskId}`,
            summary: "已完成正式知识边界测试。",
            candidates: [],
            rawText: "{}",
          };
        },
      },
      search: createDeterministicSearchAdapter(),
    });
    modules.push(platform);

    const started = await platform.startCompanyResearch({
      companyName: "白杨智能有限公司",
      intent: "核验争议信息",
      explicitWebSearch: false,
    });
    if (!started.company) throw new Error("research company missing");

    const database = new DatabaseSync(
      join(dataRoot, "database", "platform.sqlite"),
    );
    try {
      const now = new Date().toISOString();
      database
        .prepare(`
          INSERT INTO knowledge_candidates (
            candidate_id, task_id, company_id, section_key, knowledge_type,
            statement, status, version, high_impact, sensitive, created_at, updated_at
          ) VALUES (?, ?, ?, 'seed', 'company_status', ?, 'confirmed', 1, 0, 0, ?, ?)
        `)
        .run(
          "candidate-disputed-seed",
          started.task.taskId,
          started.company.companyId,
          "这条记录只用于构造争议知识。",
          now,
          now,
        );
      database
        .prepare(`
          INSERT INTO knowledge (
            knowledge_id, company_id, knowledge_type, statement, status,
            version, source_candidate_id, created_at
          ) VALUES (?, ?, 'company_status', ?, 'disputed', 1, ?, ?)
        `)
        .run(
          "knowledge-disputed-seed",
          started.company.companyId,
          "这条争议记录不能发送给研究模型。",
          "candidate-disputed-seed",
          now,
        );
    } finally {
      database.close();
    }

    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    expect(researchInputs).toHaveLength(1);
    expect(researchInputs[0]?.existingKnowledge).toEqual([]);
  });

  it("把 Markdown 材料按纯文本解析", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-research-v1-"));
    roots.push(dataRoot);
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
    });
    modules.push(platform);
    const store = new Store({
      initialData: initialStoreData(),
      persistToDisk: false,
    });
    const app = createApp(store, createDemoServices(store), {
      researchPlatform: platform,
    });

    const uploaded = await request(app)
      .post("/api/v1/documents")
      .attach(
        "file",
        Buffer.from("# 白杨智能有限公司\n\n公司专注企业智能化服务。"),
        { filename: "白杨智能 BP.md", contentType: "text/markdown" },
      );

    expect(uploaded.status).toBe(201);
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }
    const detail = await request(app).get(
      `/api/v1/conversations/${uploaded.body.conversation.conversationId}`,
    );
    expect(detail.body).toMatchObject({
      status: "completed",
      document: { fileName: "白杨智能 BP.md", parseStatus: "parsed" },
    });
  });

  it("拒绝进入本阶段尚未接入 UI 的公司名单文件", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-research-v1-"));
    roots.push(dataRoot);
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
    });
    modules.push(platform);
    const store = new Store({
      initialData: initialStoreData(),
      persistToDisk: false,
    });
    const app = createApp(store, createDemoServices(store), {
      researchPlatform: platform,
    });

    const response = await request(app)
      .post("/api/v1/documents")
      .attach("file", Buffer.from("公司名称\n白杨智能"), "公司名单.csv");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "company_list_not_available",
    });
    expect((await request(app).get("/api/v1/conversations")).body).toEqual([]);
  });

  it("上传材料后可通过对话 API 查看任务，并在服务重启后恢复", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-research-v1-"));
    roots.push(dataRoot);
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
    });
    modules.push(platform);
    const store = new Store({
      initialData: initialStoreData(),
      persistToDisk: false,
    });
    const app = createApp(store, createDemoServices(store), {
      researchPlatform: platform,
    });

    const uploaded = await request(app)
      .post("/api/v1/documents")
      .attach(
        "file",
        Buffer.from("白杨智能有限公司\n公司专注企业智能化服务。"),
        "白杨智能 BP.txt",
      );

    expect(uploaded.status).toBe(201);
    expect(uploaded.body.reusedDocument).toBe(false);
    expect(uploaded.body.conversation).toMatchObject({
      title: "白杨智能 BP.txt",
      status: "processing",
      document: { fileName: "白杨智能 BP.txt", parseStatus: "queued" },
      task: {
        status: "queued",
        steps: expect.arrayContaining(
          [
            { name: "persist_document", status: "completed" },
            { name: "verify_storage", status: "queued" },
          ].map((step) => expect.objectContaining(step)),
        ),
      },
    });

    const conversationId = uploaded.body.conversation.conversationId as string;
    const listed = await request(app).get("/api/v1/conversations");
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([
      expect.objectContaining({ conversationId, title: "白杨智能 BP.txt" }),
    ]);

    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }
    const completed = await request(app).get(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
    );
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({
      conversationId,
      status: "completed",
      company: { canonicalName: "白杨智能有限公司" },
      document: { parseStatus: "parsed", archiveStatus: "archived" },
      task: { status: "completed", resultStatus: "validated" },
    });
    expect(completed.body.task.steps).toContainEqual(
      expect.objectContaining({
        name: "analyze_material",
        status: "completed",
      }),
    );

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
    const restored = await request(restarted).get("/api/v1/conversations");

    expect(restored.status).toBe(200);
    expect(restored.body).toEqual([
      expect.objectContaining({
        conversationId,
        status: "completed",
        title: "白杨智能 BP.txt",
      }),
    ]);
  });
});
