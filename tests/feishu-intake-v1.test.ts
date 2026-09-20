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
  it('只向原渠道和原收件人返回 BP 原文，并明确截断边界', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'boyuan-material-context-')); roots.push(dataRoot);
    const platform = createPlatformModule({ dataRoot }); modules.push(platform);
    const app = express(); app.use('/api/v1/feishu', createFeishuIntakeRouter(platform, 'test-key'));
    const headers = { 'x-boyuan-intake-key': 'test-key', 'x-boyuan-message-id': 'om_bp',
      'x-boyuan-file-key': 'file_bp', 'x-boyuan-sender-id': 'ou_owner' };
    const upload = await request(app).post('/api/v1/feishu/documents').set(headers)
      .attach('file', Buffer.from('融资计划5000万元，产线60%，厂房20%，运营20%。'), { filename: 'BP.txt', contentType: 'text/plain' });
    expect(upload.status).toBe(201);
    const url = `/api/v1/feishu/conversations/${upload.body.conversation.conversationId}/material-context`;
    const context = await request(app).get(url).set(headers);
    expect(context.status).toBe(200);
    expect(context.body).toMatchObject({ fileName: 'BP.txt', text: expect.stringContaining('5000万元'), truncated: false });
    for (const invalid of [{ 'x-boyuan-sender-id': 'ou_other' }, { 'x-boyuan-file-key': 'other' }, { 'x-boyuan-message-id': 'other' }]) {
      expect((await request(app).get(url).set({ ...headers, ...invalid })).status).toBe(404);
    }
    expect((await request(app).get(url)).status).toBe(401);
    await expect(platform.getChannelDocumentContext({ conversationId: upload.body.conversation.conversationId,
      sourceChannel: 'wecom', sourceMessageId: 'om_bp', sourceAttachmentKey: 'file_bp', senderId: 'ou_owner',
    })).rejects.toThrow('material receipt not found');
    const longHeaders = { ...headers, 'x-boyuan-message-id': 'om_long' };
    const longUpload = await request(app).post('/api/v1/feishu/documents').set(longHeaders)
      .attach('file', Buffer.from('首段材料\n' + '材料\n'.repeat(24000) + '末页融资5000万元'), { filename: 'long.txt', contentType: 'text/plain' });
    const longResult = await request(app).get(`/api/v1/feishu/conversations/${longUpload.body.conversation.conversationId}/material-context`).set(longHeaders);
    expect(longResult.body.truncated).toBe(true);
    expect(longResult.body.text).toContain('首段材料');
    expect(longResult.body.text).toContain('末页融资5000万元');
    expect(longResult.body.text).toContain('中间内容未纳入');
    expect(longResult.body.text.length).toBeLessThan(61_000);
  });
  it.each([undefined, '请关注最新融资与竞争格局，内部项目代号松针'])("公司研究持久化关注点 %s，按消息幂等且快速与深度共享检索", async (researchFocus) => {
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
      productTechnology: "AI 推理基础设施研究工作台",
      industryTrack: "企业研究智能化",
      marketView: "机构研究智能化需求增长，规模待核验",
      financing: "暂未检索到",
      keyPeople: "暂未检索到",
      companyRegion: "成都",
      financingStage: "A轮",
      financingAmountWan: 8_000,
      highlights: ["机构知识沉淀闭环"],
      riskSignals: ["客户集中度待核验"],
      diligenceQuestions: ["前五大客户收入占比是多少？"],
      industryTags: ["AI推理基础设施"],
      recentSignals: input.webResults.flatMap((item) => item.highlights).slice(0, 3),
      competitorNames: [],
      upstreamNames: [],
      downstreamNames: [],
      providerId: "openai",
      modelId: "gpt-5.6-luna",
      variant: "none",
      sessionId: "company-quick-session",
    }));
    let platform = createPlatformModule({
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
    let app = createApp(store, createDemoServices(store), {
      researchPlatform: platform,
      feishuIntakeKey: "test-feishu-intake-key-123",
    });

    const started = await request(app)
      .post("/api/v1/feishu/company-research")
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123")
      .set("x-boyuan-message-id", "om_company_research")
      .set("x-boyuan-sender-id", "ou_sender")
      .send({ companyName: "博源科技有限公司", ...(researchFocus ? { researchFocus: `  ${researchFocus}  ` } : {}) });
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
    expect(started.body.conversation.companyResearch.researchFocus).toBe(researchFocus);

    platform.close();
    modules.pop();
    platform = createPlatformModule({
      dataRoot, companyQuickCardAnalysis: { analyze }, research: createDeterministicResearchAdapter(), search: { search },
    });
    modules.push(platform);
    app = createApp(store, createDemoServices(store), {
      researchPlatform: platform, feishuIntakeKey: "test-feishu-intake-key-123",
    });

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
      fundMatch: {
        status: "matched",
        recommended: { fundId: "F03", score: 100 },
      },
      modelId: "gpt-5.6-luna",
    });
    expect(repeatedQuick.body).toEqual(firstQuick.body);
    expect(search).toHaveBeenCalledOnce();
    expect(analyze).toHaveBeenCalledOnce();
    expect(analyze.mock.calls[0]?.[0].companyName).toBe('博源科技有限公司');
    expect(analyze.mock.calls[0]?.[0].researchFocus).toBe(researchFocus);
    expect(search.mock.calls[0]?.[0].companyName).toBe('博源科技有限公司');
    if (researchFocus) {
      expect(search.mock.calls[0]?.[0]).toEqual({
        companyName: '博源科技有限公司', reason: 'user_requested', maxResults: 5,
        query: '博源科技有限公司 公司 业务 产品 竞品 竞争格局 最新 进展 融资',
      });
      expect(JSON.stringify(search.mock.calls[0]?.[0])).not.toContain('松针');
    }

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
    expect(completed.companyResearch?.researchFocus).toBe(researchFocus);

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

  it('校验可选关注点类型、空值和 500 字边界，不把问题写入公司名', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'boyuan-feishu-focus-'));
    roots.push(dataRoot);
    const platform = createPlatformModule({ dataRoot });
    modules.push(platform);
    const app = express();
    app.use(express.json());
    app.use('/api/v1/feishu', createFeishuIntakeRouter(platform, 'test-key'));
    for (const researchFocus of [null, 3, {}, [], '', '  \n ', '问'.repeat(501)]) {
      const result = await request(app).post('/api/v1/feishu/company-research')
        .set('x-boyuan-intake-key', 'test-key').set('x-boyuan-message-id', 'om_boundary')
        .send({ companyName: '边界科技有限公司', researchFocus });
      expect(result.status).toBe(400);
      expect(result.body.error).toBe('invalid_research_focus');
    }
    expect(await platform.listCompanies()).toHaveLength(0);
    expect(await platform.listConversations()).toHaveLength(0);
    const focus = '竞'.repeat(500);
    const accepted = await request(app).post('/api/v1/feishu/company-research')
      .set('x-boyuan-intake-key', 'test-key').set('x-boyuan-message-id', 'om_boundary')
      .send({ companyName: '边界科技有限公司', researchFocus: focus });
    expect(accepted.status).toBe(201);
    expect(accepted.body.conversation).toMatchObject({
      company: { canonicalName: '边界科技有限公司' },
      companyResearch: { researchFocus: focus, intent: focus },
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
      fundMatch: {
        status: "insufficient_input",
        eligibleFundCount: 3,
        excludedFundCount: 1,
        source: {
          fileName: "模拟私募基金清单_4只_成都.xlsx",
          asOfDate: "2026-08-28",
          simulated: true,
        },
      },
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
      productTechnology: "暂未检索到",
      industryTrack: "企业服务",
      marketView: "暂未检索到",
      financing: "暂未检索到",
      keyPeople: "暂未检索到",
      companyRegion: "暂未检索到",
      financingStage: "暂未检索到",
      financingAmountWan: null,
      highlights: [],
      riskSignals: [],
      diligenceQuestions: [],
      industryTags: [],
      recentSignals: input.webResults.flatMap((item) => item.highlights),
      competitorNames: [],
      upstreamNames: [],
      downstreamNames: [],
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
        productTechnology: "特种具身智能与机器人系统",
        industryTrack: "特种具身智能",
        marketView: "特种场景智能化需求待核验",
        financing: "已完成A轮及A+轮融资",
        keyPeople: "龙HT董事长、总经理",
        companyRegion: "北京",
        financingStage: "A轮",
        financingAmountWan: 5_000,
        highlights: ["国家级专精特新小巨人"],
        riskSignals: ["商业化规模待核验"],
        diligenceQuestions: ["核心客户复购率是多少？"],
        industryTags: ["机器人传感/Physical AI"],
        competitorNames: ["Google DeepMind", "Anduril", "Shield AI"],
        upstreamNames: ["上游企业"],
        downstreamNames: ["下游客户"],
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
      fundMatch: {
        status: "matched",
        recommended: { fundId: "F04", score: 76 },
      },
      confidence: 68,
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
    expect(linkedQuick.body).toMatchObject({
      confidence: 75,
      confidenceLevel: "中",
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
