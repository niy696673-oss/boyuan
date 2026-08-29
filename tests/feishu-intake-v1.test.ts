// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app.js";
import { createDemoServices } from "../server/platform/runtime.js";
import { createDeterministicAnalysisAdapter } from "../server/research-platform/analysis/deterministic-analysis.js";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createFeishuIntakeRouter } from "../server/research-platform/feishu-intake-router.js";
import { createPlatformModule } from "../server/research-platform/platform-module.js";
import type { QuickCardAnalysisPort } from "../server/research-platform/quick-card/contracts.js";
import type { CompanyQuickCardAnalysisPort } from "../server/research-platform/company-quick-card/contracts.js";
import { createDeterministicResearchAdapter } from "../server/research-platform/research/deterministic-research.js";
import type { WebSearchPort } from "../server/research-platform/search/contracts.js";
import { initialStoreData, Store } from "../server/store.js";

const roots: string[] = [];
const modules: PlatformModule[] = [];

afterEach(async () => {
  while (modules.length) modules.pop()?.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("飞书材料接入新工作台", () => {
  it("公司名研究按消息幂等创建深度会话，并让快速与深度链路共享一次公开检索", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-feishu-company-"));
    roots.push(dataRoot);
    const search = vi.fn<WebSearchPort['search']>(async (input) => [{
      title: `${input.companyName}发布新产品`,
      url: "https://example.com/boyuan/new-product",
      site: "example.com",
      highlights: ["公司发布新一代机构研究工作台。"],
      accessStatus: "accessible",
      retrievedAt: "2026-08-29T00:00:00.000Z",
    }]);
    const analyze = vi.fn<CompanyQuickCardAnalysisPort['analyze']>(async (input) => ({
      companyIdentity: `${input.companyName}，平台已有正式主体`,
      industryTrack: "企业研究智能化",
      financing: "暂未检索到",
      keyPeople: "暂未检索到",
      highlights: ["机构知识沉淀闭环"],
      recentSignals: input.webResults.flatMap((item) => item.highlights).slice(0, 3),
      providerId: "openai",
      modelId: "gpt-5.6-luna",
      variant: "none",
      sessionId: "company-quick-session",
    }));
    const platform = createPlatformModule({
      dataRoot,
      companyQuickCardAnalysis: { analyze },
      research: createDeterministicResearchAdapter(),
      search: { search },
    });
    modules.push(platform);
    const seededCompany = await platform.startCompanyResearch({
      companyName: "博源科技有限公司",
      intent: "建立已有正式主体测试数据",
      explicitWebSearch: false,
    });
    await platform.cancelTask(seededCompany.task.taskId);
    const store = new Store({ initialData: initialStoreData(), persistToDisk: false });
    const app = createApp(store, createDemoServices(store), {
      researchPlatform: platform,
      feishuIntakeKey: "test-feishu-intake-key-123",
    });

    const started = await request(app)
      .post("/api/v1/feishu/company-research")
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123")
      .set("x-boyuan-message-id", "om_company_research")
      .set("x-boyuan-sender-id", "ou_sender")
      .send({ companyName: "博源科技有限公司" });
    const replayed = await request(app)
      .post("/api/v1/feishu/company-research")
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123")
      .set("x-boyuan-message-id", "om_company_research")
      .set("x-boyuan-sender-id", "ou_sender")
      .send({ companyName: "不应创建的新主体有限公司" });

    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({
      reusedResearch: false,
      conversation: {
        sourceChannel: "feishu",
        status: "waiting",
        company: { canonicalName: "博源科技有限公司", status: "active" },
      },
    });
    expect(replayed.body).toMatchObject({
      reusedResearch: true,
      conversation: { conversationId: started.body.conversation.conversationId },
    });
    expect(await platform.listCompanies()).toHaveLength(1);

    const conversationId = started.body.conversation.conversationId as string;
    const firstQuick = await request(app)
      .post(`/api/v1/feishu/company-research/${encodeURIComponent(conversationId)}/quick-card`)
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123");
    const repeatedQuick = await request(app)
      .post(`/api/v1/feishu/company-research/${encodeURIComponent(conversationId)}/quick-card`)
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123");

    expect(firstQuick.status).toBe(200);
    expect(firstQuick.body).toMatchObject({
      kind: "company_research",
      status: "completed",
      companyName: "博源科技有限公司",
      identityState: "existing",
      recentSignals: ["公司发布新一代机构研究工作台。"],
      sourceCount: 1,
      navigation: { companyId: expect.any(String) },
      modelId: "gpt-5.6-luna",
    });
    expect(repeatedQuick.body).toEqual(firstQuick.body);
    expect(search).toHaveBeenCalledOnce();
    expect(analyze).toHaveBeenCalledOnce();

    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }
    const completed = await platform.getConversation(conversationId);
    expect(completed).toMatchObject({
      sourceChannel: "feishu",
      status: "completed",
      companyResearch: { sources: [{ url: "https://example.com/boyuan/new-product" }] },
    });
    expect(search).toHaveBeenCalledOnce();

    const provisional = await platform.startFeishuCompanyResearch({
      companyName: "新研科技有限公司",
      sourceMessageId: "om_new_company_research",
      senderId: "ou_sender",
    });
    expect(provisional.conversation).toMatchObject({
      sourceChannel: "feishu",
      company: { canonicalName: "新研科技有限公司", status: "provisional" },
    });
    await expect(platform.quickAnalyzeCompanyResearch(
      provisional.conversation.conversationId,
    )).resolves.toMatchObject({
      identityState: "provisional",
      navigation: {},
    });
  });

  it("公司名匹配多个主体时返回待确认快速卡并暂停深度研究", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-feishu-company-ambiguous-"));
    roots.push(dataRoot);
    const analyze = vi.fn<CompanyQuickCardAnalysisPort['analyze']>();
    const search = vi.fn<WebSearchPort['search']>();
    const platform = createPlatformModule({
      dataRoot,
      companyQuickCardAnalysis: { analyze },
      research: createDeterministicResearchAdapter(),
      search: { search },
    });
    modules.push(platform);
    const firstSeed = await platform.startCompanyResearch({
      companyName: "白杨智能有限公司",
      intent: "建立第一个测试主体",
      explicitWebSearch: false,
    });
    const secondSeed = await platform.startCompanyResearch({
      companyName: "白杨智能有限责任公司",
      intent: "建立第二个测试主体",
      explicitWebSearch: false,
    });
    await platform.cancelTask(firstSeed.task.taskId);
    await platform.cancelTask(secondSeed.task.taskId);
    const started = await platform.startFeishuCompanyResearch({
      companyName: "白杨智能",
      sourceMessageId: "om_ambiguous_company",
      senderId: "ou_sender",
    });

    expect(started.conversation).toMatchObject({
      sourceChannel: "feishu",
      status: "pending_confirmation",
      companyMatch: { status: "pending", options: [{}, {}] },
    });
    await expect(platform.quickAnalyzeCompanyResearch(
      started.conversation.conversationId,
    )).resolves.toMatchObject({
      status: "pending_confirmation",
      identityState: "ambiguous",
      navigation: {},
    });
    expect(analyze).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(await platform.runPendingSteps()).toBe(0);
  });

  it("公开检索失败时快速卡失败且不缓存空快照，深度链路可独立重试", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-feishu-company-search-retry-"));
    roots.push(dataRoot);
    const search = vi.fn<WebSearchPort['search']>()
      .mockRejectedValueOnce(new Error("temporary_search_failure"))
      .mockResolvedValueOnce([{
        title: "重试后的公开来源",
        url: "https://example.com/retry-success",
        site: "example.com",
        highlights: ["公开检索重试成功。"],
        accessStatus: "accessible",
        retrievedAt: "2026-08-29T00:00:00.000Z",
      }]);
    const analyze = vi.fn<CompanyQuickCardAnalysisPort['analyze']>(async (input) => ({
      companyIdentity: input.companyName,
      industryTrack: "企业服务",
      financing: "暂未检索到",
      keyPeople: "暂未检索到",
      highlights: [],
      recentSignals: input.webResults.flatMap((item) => item.highlights),
      providerId: "openai",
      modelId: "gpt-5.6-luna",
      variant: "none",
      sessionId: "retry-quick-session",
    }));
    const platform = createPlatformModule({
      dataRoot,
      companyQuickCardAnalysis: { analyze },
      research: createDeterministicResearchAdapter(),
      search: { search },
    });
    modules.push(platform);
    const started = await platform.startFeishuCompanyResearch({
      companyName: "重试科技",
      sourceMessageId: "om_search_retry",
    });

    await expect(platform.quickAnalyzeCompanyResearch(
      started.conversation.conversationId,
    )).rejects.toThrow("temporary_search_failure");
    expect(analyze).not.toHaveBeenCalled();

    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }
    expect(await platform.getConversation(started.conversation.conversationId)).toMatchObject({
      status: "completed",
      companyResearch: { sources: [{ url: "https://example.com/retry-success" }] },
    });
    await expect(platform.quickAnalyzeCompanyResearch(
      started.conversation.conversationId,
    )).resolves.toMatchObject({
      recentSignals: ["公开检索重试成功。"],
      sourceCount: 1,
    });
    expect(search).toHaveBeenCalledTimes(2);
    expect(analyze).toHaveBeenCalledOnce();
  });

  it("同一条飞书消息按附件标识分别接入，并只复用重试的附件", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-feishu-v1-"));
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
      feishuIntakeKey: "test-feishu-intake-key-123",
    });

    const first = await request(app)
      .post("/api/v1/feishu/documents")
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123")
      .set("x-boyuan-message-id", "om_multi_attachment")
      .set("x-boyuan-file-key", "file_first")
      .attach("file", Buffer.from("第一家公司商业计划书"), "第一份 BP.txt");
    const second = await request(app)
      .post("/api/v1/feishu/documents")
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123")
      .set("x-boyuan-message-id", "om_multi_attachment")
      .set("x-boyuan-file-key", "file_second")
      .attach("file", Buffer.from("第二家公司商业计划书"), "第二份 BP.txt");
    const firstRetry = await request(app)
      .post("/api/v1/feishu/documents")
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123")
      .set("x-boyuan-message-id", "om_multi_attachment")
      .set("x-boyuan-file-key", "file_first")
      .attach("file", Buffer.from("重试内容不应生成新对话"), "第一份重试 BP.txt");

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(firstRetry.status).toBe(201);
    expect(first.body.reusedDocument).toBe(false);
    expect(second.body.reusedDocument).toBe(false);
    expect(second.body.conversation.conversationId).not.toBe(
      first.body.conversation.conversationId,
    );
    expect(firstRetry.body).toMatchObject({
      reusedDocument: true,
      conversation: {
        conversationId: first.body.conversation.conversationId,
        title: "第一份 BP.txt",
      },
    });
    expect(await platform.listConversations()).toHaveLength(2);
  });

  it("使用独立密钥创建飞书对话，并在深度任务运行期间返回快速卡", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-feishu-v1-"));
    roots.push(dataRoot);
    const quickCardAnalysis: QuickCardAnalysisPort = {
      analyze: async () => ({
        companyName: "白杨智能",
        companyIdentity: "北京白杨智能科技有限公司，总部位于北京，成立于2018年",
        industryTrack: "特种具身智能",
        financing: "已完成A轮及A+轮融资",
        keyPeople: "龙HT董事长、总经理",
        highlights: ["国家级专精特新小巨人"],
        competitorNames: ["Google DeepMind", "Anduril", "Shield AI"],
        upstreamNames: [],
        downstreamNames: [],
        providerId: "openai",
        modelId: "gpt-5.6-luna",
        variant: "none",
        sessionId: "quick-session",
      }),
    };
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
      quickCardAnalysis,
    });
    modules.push(platform);
    const store = new Store({
      initialData: initialStoreData(),
      persistToDisk: false,
    });
    const app = createApp(store, createDemoServices(store), {
      researchPlatform: platform,
      feishuIntakeKey: "test-feishu-intake-key-123",
    });

    const denied = await request(app)
      .post("/api/v1/feishu/documents")
      .set("x-boyuan-intake-key", "wrong-key-value-12345")
      .set("x-boyuan-message-id", "om_denied")
      .attach("file", Buffer.from("白杨智能商业计划书"), "白杨智能BP.txt");
    expect(denied.status).toBe(401);
    expect(denied.body).toEqual({ error: "invalid_intake_key" });

    const uploaded = await request(app)
      .post("/api/v1/feishu/documents")
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123")
      .set("x-boyuan-message-id", "om_feishu_material")
      .set("x-boyuan-sender-id", "ou_sender")
      .attach(
        "file",
        Buffer.from(
          "北京白杨智能科技有限公司\n公司专注特种具身智能，位于产业链中游。",
        ),
        "白杨智能BP.txt",
      );

    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toMatchObject({
      reusedDocument: false,
      conversation: {
        sourceChannel: "feishu",
        title: "白杨智能BP.txt",
        status: "processing",
        task: { status: "queued" },
      },
    });

    const replayed = await request(app)
      .post("/api/v1/feishu/documents")
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123")
      .set("x-boyuan-message-id", "om_feishu_material")
      .set("x-boyuan-sender-id", "ou_sender")
      .attach(
        "file",
        Buffer.from("同一条飞书消息重试时不应新建对话"),
        "重试副本.txt",
      );
    expect(replayed.status).toBe(201);
    expect(replayed.body).toMatchObject({
      reusedDocument: true,
      conversation: {
        conversationId: uploaded.body.conversation.conversationId,
        title: "白杨智能BP.txt",
      },
    });
    expect(await platform.listConversations()).toHaveLength(1);

    const conversationId = uploaded.body.conversation.conversationId as string;
    const quick = await request(app)
      .post(
        `/api/v1/feishu/conversations/${encodeURIComponent(conversationId)}/quick-card`,
      )
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123");

    expect(quick.status).toBe(200);
    expect(quick.body).toMatchObject({
      companyName: "白杨智能",
      industryTrack: "特种具身智能",
      competitorNames: ["Google DeepMind", "Anduril", "Shield AI"],
      confidenceLevel: "中",
      navigation: {},
      providerId: "openai",
      modelId: "gpt-5.6-luna",
    });

    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }
    const completed = await request(app).get(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
    );
    expect(completed.body).toMatchObject({
      sourceChannel: "feishu",
      status: "completed",
      task: { status: "completed" },
    });

    const [company] = await platform.listCompanies();
    const [industry] = await platform.listIndustries();
    expect(company).toBeTruthy();
    expect(industry).toBeTruthy();
    const linkedQuick = await request(app)
      .post(
        `/api/v1/feishu/conversations/${encodeURIComponent(conversationId)}/quick-card`,
      )
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123");
    expect(linkedQuick.status).toBe(200);
    expect(linkedQuick.body.navigation).toEqual({
      companyId: company.companyId,
      industryId: industry.industryId,
    });
  });

  it("未配置飞书接入密钥时不开放入口", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-feishu-v1-"));
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
      .post("/api/v1/feishu/documents")
      .set("x-boyuan-intake-key", "unconfigured-key")
      .set("x-boyuan-message-id", "om_unavailable")
      .attach("file", Buffer.from("x"), "x.txt");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "feishu_intake_unavailable" });
  });

  it("保留新 UI 公司关系与行业产业链深链所需的持久实体 ID", async () => {
    const platform = {
      quickAnalyzeConversation: async () => ({
        companyName: "白杨智能",
        companyIdentity: "北京白杨智能科技有限公司",
        industryTrack: "特种具身智能",
        financing: "材料未披露",
        keyPeople: "材料未披露",
        highlights: [],
        competitorNames: [],
        upstreamNames: [],
        downstreamNames: [],
        providerId: "openai",
        modelId: "gpt-5.6-luna",
        variant: "none",
        sessionId: "quick-session",
        confidence: 50,
        confidenceLevel: "中" as const,
        navigation: {
          companyId: "research-company",
          industryId: "research-industry",
        },
      }),
      getIndustry: async () => ({ name: "具身智能" }),
    } as unknown as PlatformModule;
    const app = express();
    app.use(
      "/api/v1/feishu",
      createFeishuIntakeRouter(platform, "test-feishu-intake-key-123"),
    );

    const response = await request(app)
      .post("/api/v1/feishu/conversations/conversation/quick-card")
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123");

    expect(response.status).toBe(200);
    expect(response.body.navigation).toEqual({
      companyId: "research-company",
      industryId: "research-industry",
    });
  });
});
