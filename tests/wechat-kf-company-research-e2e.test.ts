// @vitest-environment node
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createApp } from '../server/app.js';
import { createDemoServices } from '../server/platform/runtime.js';
import { createPlatformModule } from '../server/research-platform/platform-module.js';
import { createPlatformWorker } from '../server/research-platform/platform-worker.js';
import { createDeterministicResearchAdapter } from '../server/research-platform/research/deterministic-research.js';
import { initialStoreData, Store } from '../server/store.js';
import { DirectWechatKfCompanyResearchIngress, WechatKfTextDelivery } from '../integrations/botmux-ai-platform-intake/src/direct-wechat-kf-intake.js';
import { IntakeService } from '../integrations/botmux-ai-platform-intake/src/intake-service.js';
import { MemoryJobStore } from '../integrations/botmux-ai-platform-intake/src/job-store.js';
import { HttpPlatformClient } from '../integrations/botmux-ai-platform-intake/src/platform-client.js';
import { companyQuickCard, testConfig } from '../integrations/botmux-ai-platform-intake/tests/helpers.js';

it('微信公司名经真实 HTTP/SQLite 返回快速文本，后台完成深度研究，重放不重复', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boyuan-kf-company-e2e-'));
  const analyze = vi.fn(async () => companyQuickCard({ companyName: '新研科技有限公司' }));
  const search = vi.fn(async () => [{
    title: '新研科技公开更新', url: 'https://example.com/xinyan', site: 'example.com',
    highlights: ['新研科技发布企业研究产品'], accessStatus: 'accessible' as const,
    retrievedAt: new Date().toISOString(),
  }]);
  const platform = createPlatformModule({
    dataRoot: root, companyQuickCardAnalysis: { analyze }, search: { search },
    research: createDeterministicResearchAdapter(),
  });
  const worker = createPlatformWorker(platform, { intervalMs: 5, batchSize: 10 });
  const appStore = new Store({ initialData: initialStoreData(), persistToDisk: false });
  const config = testConfig(root, { platformIntakeKey: 'test-wechat-company-key-123' });
  const server = createServer(createApp(appStore, createDemoServices(appStore), {
    researchPlatform: platform, wecomIntakeKey: config.platformIntakeKey,
  }));
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_address_missing');
    config.platformBaseUrl = `http://127.0.0.1:${address.port}`;
    const sendText = vi.fn(async (_input: { content: string; openKfid: string; externalUserId: string }) => undefined);
    const delivery = new WechatKfTextDelivery({ sendText });
    const service = new IntakeService({
      config, delivery, store: new MemoryJobStore(),
      platform: new HttpPlatformClient(config.platformBaseUrl, config.platformIntakeKey, config.timeoutMs, fetch, 'wecom'),
    });
    const ingress = new DirectWechatKfCompanyResearchIngress({
      delivery, researchCompany: (turn) => service.researchCompany(turn),
      statusReceiptId: (id, key) => service.statusCardId(id, key),
      statusReceiptTerminal: (id, key) => service.isStatusCardTerminal(id, key),
      rememberStatusReceipt: ({ receipt, ...input }) => service.rememberStatusCard({ ...input, cardMessageId: receipt }),
      markStatusReceiptTerminal: (id, key) => service.markStatusCardTerminal(id, key),
    });
    const message = {
      messageId: 'wechat-company-e2e', openKfid: 'wk-account', externalUserId: 'customer',
      receivedAt: new Date().toISOString(), text: '新研科技有限公司',
    };
    await ingress.handle(message);
    const count = sendText.mock.calls.length;
    await ingress.handle(message);
    expect(sendText).toHaveBeenCalledTimes(count);
    expect(sendText.mock.invocationCallOrder[0]).toBeLessThan(analyze.mock.invocationCallOrder[0]!);
    const result = sendText.mock.calls.map(([input]) => input.content).join('\n');
    expect(result).toContain('公司快速研究');
    expect(result).toContain('新研科技有限公司');
    expect(result).toContain('/workbench/conversations/');
    expect(sendText.mock.calls.every(([input]) => input.openKfid === 'wk-account' && input.externalUserId === 'customer')).toBe(true);
    const conversations = await platform.listConversations();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({ sourceChannel: 'wecom', type: 'company' });
    await vi.waitFor(async () => {
      expect(await platform.getConversation(conversations[0]!.conversationId)).toMatchObject({ status: 'completed' });
    });
    expect(search).toHaveBeenCalledOnce();
    expect(analyze).toHaveBeenCalledOnce();
  } finally {
    worker.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    platform.close();
    await rm(root, { recursive: true, force: true });
  }
});
