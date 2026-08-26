// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("原子取消排队任务，记录审计并阻止 worker 重新领取", async () => {
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
        Buffer.from("排队取消科技有限公司\n该材料不应继续执行。"),
        "排队取消 BP.txt",
      );
    const taskId = uploaded.body.conversation.task.taskId as string;

    const cancelled = await request(app).post(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/cancel`,
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({
      status: "cancelled",
      task: {
        taskId,
        status: "cancelled",
        resultStatus: "cancelled",
      },
    });
    expect(
      cancelled.body.task.steps.some(
        (step: { status: string }) => step.status === "completed",
      ),
    ).toBe(true);
    expect(
      cancelled.body.task.steps
        .filter((step: { status: string }) => step.status === "skipped")
        .every(
          (step: { errorCode?: string }) =>
            step.errorCode === "cancelled_by_user",
        ),
    ).toBe(true);
    expect(
      cancelled.body.task.steps.some((step: { status: string }) =>
        ["blocked", "queued", "running", "pending_confirmation"].includes(
          step.status,
        ),
      ),
    ).toBe(false);
    await expect(platform.runPendingSteps()).resolves.toBe(0);
    const replay = await request(app).post(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/cancel`,
    );
    expect(replay.status).toBe(200);
    expect(
      (await platform.listAdminOverview()).audits.filter(
        (audit) => audit.action === "task.cancel" && audit.entityId === taskId,
      ),
    ).toHaveLength(1);
  });

  it("只读返回持久材料内容、准确响应头，并对未知文档返回 404", async () => {
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
    const content = "白杨智能有限公司\n只读原始材料。";

    const uploaded = await request(app)
      .post("/api/v1/documents")
      .attach("file", Buffer.from(content), {
        filename: "白杨智能 BP.txt",
        contentType: "text/plain",
      });
    const documentId = uploaded.body.conversation.document.documentId as string;
    const downloaded = await request(app).get(
      `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
    );

    expect(downloaded.status).toBe(200);
    expect(downloaded.headers["content-type"]).toBe("text/plain");
    expect(downloaded.headers["content-length"]).toBe(
      String(Buffer.byteLength(content)),
    );
    expect(downloaded.headers["content-disposition"]).toContain("attachment;");
    expect(downloaded.headers["content-disposition"]).toContain(
      "filename*=UTF-8''%E7%99%BD%E6%9D%A8%E6%99%BA%E8%83%BD%20BP.txt",
    );
    expect(downloaded.headers["x-content-type-options"]).toBe("nosniff");
    expect(downloaded.text).toBe(content);
    expect(downloaded.headers["content-disposition"]).not.toContain(dataRoot);

    const missing = await request(app).get(
      "/api/v1/documents/document-does-not-exist/content",
    );
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: "not_found" });
    expect(missing.text).not.toContain(dataRoot);
  });

  it("将不安全的上传 MIME 作为二进制附件下载而不内联执行", async () => {
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
    const content = "<script>window.localStorage.clear()</script>";
    const uploaded = await request(app)
      .post("/api/v1/documents")
      .attach("file", Buffer.from(content), {
        filename: "不安全材料.html",
        contentType: "text/html",
      });
    const documentId = uploaded.body.conversation.document.documentId as string;

    const downloaded = await request(app).get(
      `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
    );

    expect(downloaded.status).toBe(200);
    expect(downloaded.headers["content-type"]).toBe("application/octet-stream");
    expect(downloaded.headers["content-disposition"]).toContain("attachment;");
    expect(downloaded.headers["content-disposition"]).not.toContain("inline;");
    expect(downloaded.headers["x-content-type-options"]).toBe("nosniff");
    expect(downloaded.body).toEqual(Buffer.from(content));
  });

  it("文档存储路径越界或文件缺失时 fail closed 且不泄露本地路径", async () => {
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
      .attach("file", Buffer.from("原始材料"), "路径安全测试.txt");
    const documentId = uploaded.body.conversation.document.documentId as string;

    const outsideStorage = join(dataRoot, "outside-secret.txt");
    await writeFile(outsideStorage, "不得读取的内容");
    setDocumentStoragePath(dataRoot, documentId, "outside-secret.txt");
    const escaped = await request(app).get(
      `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
    );
    expect(escaped.status).toBe(404);
    expect(escaped.text).not.toContain("不得读取的内容");
    expect(escaped.text).not.toContain(dataRoot);

    setDocumentStoragePath(
      dataRoot,
      documentId,
      `documents/${documentId}/original/missing.txt`,
    );
    const missingStorage = await request(app).get(
      `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
    );
    expect(missingStorage.status).toBe(404);
    expect(missingStorage.body).toMatchObject({ error: "not_found" });
    expect(missingStorage.text).not.toContain(dataRoot);
  });

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
            title: "白杨智能有限公司公开信息",
            site: "example.com",
            url: "https://example.com/companies/%E7%99%BD%E6%9D%A8%E6%99%BA%E8%83%BD%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8",
            accessStatus: "accessible",
            retrievedAt: "2026-08-24T00:00:00.000Z",
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

  it("投研 Skill 要求显式输入范围审批，并仅传递当前公司的可追溯材料", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-research-v1-"));
    roots.push(dataRoot);
    const researchInputs: CompanyResearchInput[] = [];
    const search = { search: vi.fn() };
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
      research: {
        async analyze(input) {
          researchInputs.push(input);
          return {
            providerId: "workflow-boundary-test",
            modelId: "workflow-boundary-test",
            sessionId: `workflow-${input.taskId}`,
            summary: "已生成内部 BP 诊断草稿。",
            candidates: [],
            rawText: "{}",
          };
        },
      },
      search,
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
        Buffer.from("白杨智能有限公司\nA 轮融资材料\n核心产品为企业智能化平台。"),
        "白杨智能 BP.txt",
      );
    expect(uploaded.status).toBe(201);
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }
    const material = await platform.getConversation(
      uploaded.body.conversation.conversationId,
    );
    if (!material.company) throw new Error("company missing");

    const laterMaterial = await request(app)
      .post("/api/v1/documents")
      .attach(
        "file",
        Buffer.from("白杨智能有限公司\n后续补充材料\n新增客户线索待确认。"),
        "白杨智能 补充材料.txt",
      );
    expect(laterMaterial.status).toBe(201);
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }
    const workflowSources = await request(app).get(
      `/api/v1/companies/${material.company.companyId}/workflow-sources`,
    );
    expect(workflowSources.status).toBe(200);
    const approvedSourceIds = (workflowSources.body as Array<{
      sourceId: string;
      title: string;
    }>)
      .filter((source) => source.title === "白杨智能 BP.txt")
      .map((source) => source.sourceId);
    expect(approvedSourceIds.length).toBeGreaterThan(0);
    expect(workflowSources.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "白杨智能 补充材料.txt" }),
      ]),
    );

    const rejected = await request(app).post("/api/v1/company-research").send({
      companyId: material.company.companyId,
      intent: "诊断当前 BP 的证据缺口",
      explicitWebSearch: false,
      workflow: {
        skill: "diagnose-bp",
        scope: {
          asOfDate: "2026-08-26",
          transactionSide: "company",
          stage: "A 轮",
          audience: "内部投资团队",
          confidentiality: "restricted",
          decisionOwner: "投资经理",
        },
        inputScopeApproval: {
          approved: false,
          approvedBy: "投资经理",
          approvedAt: "2026-08-26T00:00:00.000Z",
        },
      },
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({
      error: "workflow_input_scope_approval_required",
    });

    const mismatchedScope = await request(app).post("/api/v1/company-research").send({
      companyId: material.company.companyId,
      intent: "诊断当前 BP 的证据缺口",
      explicitWebSearch: false,
      workflow: {
        skill: "diagnose-bp",
        scope: {
          asOfDate: "2026-08-26",
          transactionSide: "company",
          stage: "A 轮",
          audience: "内部投资团队",
          confidentiality: "restricted",
          decisionOwner: "投资经理",
        },
        inputScopeApproval: {
          approved: true,
          approvedBy: "投资经理",
          approvedAt: "2026-08-26T00:30:00.000Z",
          sourceIds: ["source-from-another-company"],
        },
      },
    });
    expect(mismatchedScope.status).toBe(400);
    expect(mismatchedScope.body).toMatchObject({
      error: "workflow_material_scope_invalid",
    });

    const approvedAt = "2026-08-26T01:00:00.000Z";
    const started = await request(app).post("/api/v1/company-research").send({
      companyId: material.company.companyId,
      intent: "诊断当前 BP 的证据缺口",
      explicitWebSearch: false,
      workflow: {
        skill: "diagnose-bp",
        scope: {
          asOfDate: "2026-08-26",
          transactionSide: "company",
          stage: "A 轮",
          audience: "内部投资团队",
          confidentiality: "restricted",
          decisionOwner: "投资经理",
        },
        inputScopeApproval: {
          approved: true,
          approvedBy: "投资经理",
          approvedAt,
          sourceIds: approvedSourceIds,
        },
      },
    });
    expect(started.status).toBe(201);
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    expect(researchInputs).toHaveLength(1);
    expect(search.search).not.toHaveBeenCalled();
    expect(researchInputs[0]).toMatchObject({
      triggerReason: "not_needed",
      webResults: [],
      workflowSkill: "diagnose-bp",
      workflowContext: {
        scope: {
          stage: "A 轮",
          decisionOwner: "投资经理",
        },
        gates: {
          inputScopeApproval: {
            approved: true,
            approvedBy: "投资经理",
            sourceIds: approvedSourceIds,
          },
          externalReleaseApproval: { approved: false },
        },
        materials: expect.arrayContaining([
          expect.objectContaining({
            title: "白杨智能 BP.txt",
            evidenceState: "user-provided",
          }),
        ]),
      },
    });
    expect(
      researchInputs[0]?.workflowContext?.materials.map(
        (source) => source.sourceId,
      ),
    ).toEqual(approvedSourceIds);
    expect(
      researchInputs[0]?.workflowContext?.materials.every(
        (source) => source.title === "白杨智能 BP.txt",
      ),
    ).toBe(true);
    const completed = await platform.getConversation(started.body.conversationId);
    expect(completed.companyResearch).toMatchObject({
      workflowSkill: "diagnose-bp",
      workflowScope: {
        stage: "A 轮",
        confidentiality: "restricted",
      },
      summary: "【内部草稿｜非投资决定】\n已生成内部 BP 诊断草稿。",
    });
    const workflowSection = completed.analysisSections.find(
      (section) => section.key === "company_research",
    );
    expect(
      workflowSection?.evidence.map((item) => item.evidenceId).sort(),
    ).toEqual([...approvedSourceIds].sort());
    expect(workflowSection?.evidence.every(
      (item) =>
        item.sourceType === "material" && item.fileName === "白杨智能 BP.txt",
    )).toBe(true);
  });

  it("拒绝在同一次投研 Skill 运行中混入公开搜索", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-research-v1-"));
    roots.push(dataRoot);
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
      research: createDeterministicResearchAdapter(),
      search: createDeterministicSearchAdapter(),
    });
    modules.push(platform);

    await expect(platform.startCompanyResearch({
      companyName: "白杨智能有限公司",
      intent: "诊断当前 BP 的证据缺口",
      explicitWebSearch: true,
      workflow: {
        skill: "diagnose-bp",
        scope: {
          asOfDate: "2026-08-26",
          transactionSide: "company",
          stage: "A 轮",
          audience: "内部投资团队",
          confidentiality: "restricted",
          decisionOwner: "投资经理",
        },
        inputScopeApproval: {
          approved: true,
          approvedBy: "投资经理",
          approvedAt: "2026-08-26T01:00:00.000Z",
          sourceIds: ["source-placeholder"],
        },
      },
    })).rejects.toMatchObject({
      code: "workflow_external_search_must_be_separate",
    });
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

function setDocumentStoragePath(
  dataRoot: string,
  documentId: string,
  storagePath: string,
): void {
  const database = new DatabaseSync(
    join(dataRoot, "database", "platform.sqlite"),
  );
  try {
    database
      .prepare("UPDATE documents SET storage_path = ? WHERE document_id = ?")
      .run(storagePath, documentId);
  } finally {
    database.close();
  }
}
