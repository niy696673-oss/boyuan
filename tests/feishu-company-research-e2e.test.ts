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
  it('从文本事件到同卡快速结果和后台深度完成只使用一次搜索', async () => {
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
    const messenger = {
      sendCard: vi.fn(async () => ({ messageId: 'om_processing_card' })),
      updateCard: vi.fn(async (input: { cardMessageId: string; card: JsonObject }) => { updates.push(input); }),
    };
    const service = new IntakeService({
      config,
      platform: new HttpPlatformClient(config.platformBaseUrl, config.platformIntakeKey, config.timeoutMs),
      messenger,
      store: jobStore,
    });
    const ingress = new DirectFeishuCompanyResearchIngress({
      botOpenId: 'ou_bot',
      researchCompany: (turn) => service.researchCompany(turn),
      messenger,
      statusCardId: (message) => service.statusCardId(message.messageId, COMPANY_RESEARCH_FILE_KEY),
      rememberStatusCard: (message, cardMessageId) => service.rememberStatusCard({
        chatId: message.chatId,
        messageId: message.messageId,
        fileKey: COMPANY_RESEARCH_FILE_KEY,
        fileName: message.companyName,
        cardMessageId,
        createdAt: message.receivedAt,
        ...(message.senderId ? { senderId: message.senderId } : {}),
      }),
      markStatusCardTerminal: (message) => service.markStatusCardTerminal(
        message.messageId,
        COMPANY_RESEARCH_FILE_KEY,
      ),
    });

    await expect(ingress.handle({
      sender: { sender_id: { open_id: 'ou_sender' }, sender_type: 'user' },
      message: {
        message_id: 'om_e2e_company',
        chat_id: 'oc_e2e_chat',
        chat_type: 'p2p',
        message_type: 'text',
        create_time: '1787932800000',
        content: JSON.stringify({ text: '研究 新研科技有限公司' }),
      },
    })).resolves.toEqual({ handled: true });

    expect(messenger.sendCard).toHaveBeenCalledOnce();
    expect(messenger.sendCard.mock.invocationCallOrder[0]).toBeLessThan(
      analyze.mock.invocationCallOrder[0]!,
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]?.cardMessageId).toBe('om_processing_card');
    const rendered = JSON.stringify(updates[0]?.card);
    expect(rendered).toContain('公司研究 · 快速分析');
    expect(rendered).toContain('新研科技发布企业研究产品');
    expect(rendered).toContain('基金匹配（确定性规则）');
    expect(rendered).toContain('成都元屿智算创业投资合伙企业');
    expect(rendered).toContain('/workbench/conversations/');
    expect(rendered).not.toContain('公司网络 →');

    const [conversation] = await platform.listConversations();
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
    expect(search).toHaveBeenCalledOnce();
    expect(analyze).toHaveBeenCalledOnce();
  });
});
