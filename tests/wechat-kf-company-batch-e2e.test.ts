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
import { WechatKfCompanyBatch } from '../integrations/botmux-ai-platform-intake/src/wechat-kf-company-batch.js';
import { HttpPlatformClient } from '../integrations/botmux-ai-platform-intake/src/platform-client.js';
import { companyQuickCard, testConfig } from '../integrations/botmux-ai-platform-intake/tests/helpers.js';

it('微信公司列表经 HTTP/SQLite 创建两家公司研究并汇总，重放不重复', async () => {
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
    const ingress = new WechatKfCompanyBatch({
      statePath: join(root, 'batches.json'), publicProductUrl: config.publicProductUrl,
      client: { sendText, downloadMedia: vi.fn() }, onError: (error) => { throw error; },
      extractor: { extract: async () => ({ companies: ['新研科技有限公司', '另一科技有限公司'], uncertain: [] }) },
      platform: new HttpPlatformClient(config.platformBaseUrl, config.platformIntakeKey, config.timeoutMs, fetch, 'wecom'),
    });
    const message = {
      messageId: 'wechat-company-e2e', openKfid: 'wk-account', externalUserId: 'customer',
      receivedAt: new Date().toISOString(), text: '新研科技有限公司、另一科技有限公司',
    };
    await ingress.handle(message);
    await ingress.waitForIdle();
    const count = sendText.mock.calls.length;
    await ingress.handle(message);
    await ingress.waitForIdle();
    expect(sendText).toHaveBeenCalledTimes(count);
    expect(sendText.mock.invocationCallOrder[0]).toBeLessThan(analyze.mock.invocationCallOrder[0]!);
    const result = sendText.mock.calls.map(([input]) => input.content).join('\n');
    expect(result).toContain('公司批量研究');
    expect(result).toContain('新研科技有限公司');
    expect(result).toContain('/workbench/conversations/');
    expect(sendText.mock.calls.every(([input]) => input.openKfid === 'wk-account' && input.externalUserId === 'customer')).toBe(true);
    const conversations = await platform.listConversations();
    expect(conversations).toHaveLength(2);
    expect(conversations[0]).toMatchObject({ sourceChannel: 'wecom', type: 'company' });
    await vi.waitFor(async () => {
      for (const conversation of conversations) expect(await platform.getConversation(conversation.conversationId)).toMatchObject({ status: 'completed' });
    });
    expect(search).toHaveBeenCalledTimes(2);
    expect(analyze).toHaveBeenCalledTimes(2);
  } finally {
    worker.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    platform.close();
    await rm(root, { recursive: true, force: true });
  }
});
