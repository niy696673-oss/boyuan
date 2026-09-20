// @vitest-environment node

import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.js';
import { createDemoServices } from '../server/platform/runtime.js';
import type { CompanyQuickCardAnalysisPort } from '../server/research-platform/company-quick-card/contracts.js';
import type { PlatformModule } from '../server/research-platform/contracts.js';
import { createPlatformModule } from '../server/research-platform/platform-module.js';
import { createPlatformWorker, type PlatformWorker } from '../server/research-platform/platform-worker.js';
import { createDeterministicResearchAdapter } from '../server/research-platform/research/deterministic-research.js';
import type { WebSearchPort } from '../server/research-platform/search/contracts.js';
import { initialStoreData, Store } from '../server/store.js';
import { DirectFeishuCompanyResearchIngress } from '../integrations/botmux-ai-platform-intake/src/direct-feishu-intake.js';
import {
  IntakeService,
} from '../integrations/botmux-ai-platform-intake/src/intake-service.js';
import { MemoryJobStore } from '../integrations/botmux-ai-platform-intake/src/job-store.js';
import { HttpPlatformClient } from '../integrations/botmux-ai-platform-intake/src/platform-client.js';
import type {
  IntakeConfig,
  JsonObject,
} from '../integrations/botmux-ai-platform-intake/src/types.js';
import { COMPANY_RESEARCH_FILE_KEY } from '../integrations/botmux-ai-platform-intake/src/types.js';

const roots: string[] = [];
const modules: PlatformModule[] = [];
const servers: Server[] = [];
const workers: PlatformWorker[] = [];

afterEach(async () => {
  while (workers.length) workers.pop()?.stop();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  while (modules.length) modules.pop()?.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('飞书公司名研究本地端到端', () => {
  it.each([1, 2])('已识别消息内 %s 家公司各有独立状态卡与研究，重试复用结果', async (companyCount) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'boyuan-company-e2e-'));
    roots.push(dataRoot);
    const search = vi.fn<WebSearchPort['search']>(async () => [{
      title: '新研科技公开更新',
      url: 'https://example.com/xinyan/update',
      site: 'example.com',
      highlights: ['新研科技发布企业研究产品。'],
      accessStatus: 'accessible',
      retrievedAt: '2026-08-29T00:00:00.000Z',
    }]);
    const analyze = vi.fn<CompanyQuickCardAnalysisPort['analyze']>(async (input) => ({
      companyIdentity: input.companyName,
      productTechnology: 'AI 推理基础设施研究工作台',
      industryTrack: '企业研究智能化',
      marketView: '机构研究智能化需求增长，规模待核验',
      financing: '暂未检索到',
      keyPeople: '暂未检索到',
      companyRegion: '成都',
      financingStage: 'A轮',
      financingAmountWan: 8_000,
      highlights: ['机构知识沉淀'],
      riskSignals: ['客户集中度待核验'],
      diligenceQuestions: ['前五大客户收入占比是多少？'],
      industryTags: ['AI推理基础设施'],
      recentSignals: input.webResults.flatMap((item) => item.highlights),
      competitorNames: [],
      upstreamNames: [],
      downstreamNames: [],
      providerId: 'openai',
      modelId: 'gpt-5.6-luna',
      variant: 'none',
      sessionId: 'e2e-luna-session',
    }));
    const platform = createPlatformModule({
      dataRoot,
      companyQuickCardAnalysis: { analyze },
      research: createDeterministicResearchAdapter(),
      search: { search },
    });
    modules.push(platform);
    workers.push(createPlatformWorker(platform, { intervalMs: 5, batchSize: 10 }));
    const appStore = new Store({ initialData: initialStoreData(), persistToDisk: false });
    const app = createApp(appStore, createDemoServices(appStore), {
      researchPlatform: platform,
      feishuIntakeKey: 'test-feishu-intake-key-123',
    });
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_missing');

    const config: IntakeConfig = {
      schemaVersion: 1,
      larkAppId: 'cli_test',
      botmuxConfigPath: join(dataRoot, 'bots.json'),
      platformBaseUrl: `http://127.0.0.1:${address.port}`,
      platformIntakeKey: 'test-feishu-intake-key-123',
      publicWorkbenchUrl: 'https://demo.example.com/workbench',
      publicProductUrl: 'https://demo.example.com',
      servicePort: 19470,
      attachmentRoot: join(dataRoot, 'attachments'),
      statePath: join(dataRoot, 'jobs.json'),
      retryDelayMs: 1_500,
      timeoutMs: 600_000,
    };
    const jobStore = new MemoryJobStore();
    const updates: Array<{ cardMessageId: string; card: JsonObject }> = [];
    let cardIndex = 0;
    const messenger = {
      sendCard: vi.fn(async () => ({ messageId: `om_processing_card_${cardIndex++}` })),
      updateCard: vi.fn(async (input: { cardMessageId: string; card: JsonObject }) => { updates.push(input); }),
    };
    const service = new IntakeService({
      config,
      platform: new HttpPlatformClient(config.platformBaseUrl, config.platformIntakeKey, config.timeoutMs),
      messenger,
      store: jobStore,
    });
    const ingress = new DirectFeishuCompanyResearchIngress({
      researchCompany: (turn) => service.researchCompany(turn),
      messenger,
      statusCardId: (message) => service.statusCardId(message.messageId, message.researchKey ?? COMPANY_RESEARCH_FILE_KEY),
      rememberStatusCard: (message, cardMessageId) => service.rememberStatusCard({
        chatId: message.chatId,
        messageId: message.messageId,
        fileKey: message.researchKey ?? COMPANY_RESEARCH_FILE_KEY,
        fileName: message.companyName,
        cardMessageId,
        createdAt: message.receivedAt,
        ...(message.senderId ? { senderId: message.senderId } : {}),
      }),
      markStatusCardTerminal: (message) => service.markStatusCardTerminal(
        message.messageId,
        message.researchKey ?? COMPANY_RESEARCH_FILE_KEY,
      ),
    });

    const messages = ['新研科技有限公司', '白杨智能有限公司'].slice(0, companyCount).map((companyName, index) => ({
      chatId: 'oc_e2e_chat', messageId: 'om_e2e_company', companyName,
      receivedAt: '2026-08-29T00:00:00.000Z', senderId: 'ou_sender',
      ...(companyCount > 1 ? { researchKey: `company-research:${index}`, researchFocus: '最新融资与竞争格局' } : {}),
    }));
    await Promise.all(messages.map((message) => expect(ingress.resume(message)).resolves.toBeUndefined()));
    await Promise.all(messages.map((message) => ingress.resume(message)));

    expect(messenger.sendCard).toHaveBeenCalledTimes(companyCount);
    expect(messenger.sendCard.mock.invocationCallOrder[0]).toBeLessThan(
      analyze.mock.invocationCallOrder[0]!,
    );
    expect(updates).toHaveLength(companyCount);
    expect(new Set(updates.map((update) => update.cardMessageId)).size).toBe(companyCount);
    expect(updates.map((update) => update.cardMessageId)).toContain('om_processing_card_0');
    const rendered = JSON.stringify(updates[0]?.card);
    expect(rendered).toContain('公司研究 · 快速分析');
    expect(rendered).toContain('新研科技发布企业研究产品');
    expect(rendered).toContain('基金匹配（确定性规则）');
    expect(rendered).toContain('成都元屿智算创业投资合伙企业');
    expect(rendered).not.toContain('/workbench/conversations/');
    expect(rendered).not.toContain('公司网络 →');

    const conversations = await Promise.all((await platform.listConversations())
      .map((item) => platform.getConversation(item.conversationId)));
    expect(conversations).toHaveLength(companyCount);
    const conversation = conversations.find((item) => item.company?.canonicalName === '新研科技有限公司');
    expect(conversation).toMatchObject({
      sourceChannel: 'feishu',
      type: 'company',
    });
    for (let index = 0; index < 100; index += 1) {
      if ((await platform.getConversation(conversation!.conversationId)).status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(await platform.getConversation(conversation!.conversationId)).toMatchObject({
      status: 'completed',
      company: { canonicalName: '新研科技有限公司', status: 'provisional' },
      companyResearch: { sources: [{ url: 'https://example.com/xinyan/update' }] },
    });
    for (const message of messages) {
      const job = [...jobStore.jobs.values()].find((item) => item.fileKey === (message.researchKey ?? COMPANY_RESEARCH_FILE_KEY));
      expect(job).toMatchObject({ messageId: 'om_e2e_company', companyName: message.companyName });
      expect(analyze).toHaveBeenCalledWith(expect.objectContaining({
        companyName: message.companyName,
        ...(message.researchFocus ? { researchFocus: message.researchFocus } : {}),
      }));
      // A fresh client replay also exercises backend idempotency, bypassing the job cache.
      const replay = await new HttpPlatformClient(config.platformBaseUrl, config.platformIntakeKey, config.timeoutMs)
        .startCompanyResearch({
          ...message, sessionId: 'feishu:om_e2e_company',
          researchKey: message.researchKey ?? COMPANY_RESEARCH_FILE_KEY,
        });
      expect(replay).toMatchObject({ reusedResearch: true, conversation: { conversationId: job?.conversationId } });
    }
    expect(search).toHaveBeenCalledTimes(companyCount);
    expect(analyze).toHaveBeenCalledTimes(companyCount);
  });
});
