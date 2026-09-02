// @vitest-environment node

import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.js';
import { createDemoServices } from '../server/platform/runtime.js';
import { createDeterministicAnalysisAdapter } from '../server/research-platform/analysis/deterministic-analysis.js';
import type { PlatformModule } from '../server/research-platform/contracts.js';
import { createPlatformModule } from '../server/research-platform/platform-module.js';
import { createPlatformWorker, type PlatformWorker } from '../server/research-platform/platform-worker.js';
import type { QuickCardAnalysisPort } from '../server/research-platform/quick-card/contracts.js';
import { createDeterministicResearchAdapter } from '../server/research-platform/research/deterministic-research.js';
import { initialStoreData, Store } from '../server/store.js';
import {
  DirectWechatKfFileIngress,
  WechatKfTextDelivery,
} from '../integrations/botmux-ai-platform-intake/src/direct-wechat-kf-intake.js';
import { IntakeService } from '../integrations/botmux-ai-platform-intake/src/intake-service.js';
import { MemoryJobStore } from '../integrations/botmux-ai-platform-intake/src/job-store.js';
import { HttpPlatformClient } from '../integrations/botmux-ai-platform-intake/src/platform-client.js';
import type { WechatKfIntakeConfig } from '../integrations/botmux-ai-platform-intake/src/types.js';
import { MemoryWechatKfCursorStore, WechatKfMessagePump } from '../integrations/botmux-ai-platform-intake/src/wechat-kf-pump.js';
import { WechatKfFileMaterializer } from '../integrations/botmux-ai-platform-intake/src/wechat-kf-runtime.js';

const roots: string[] = [];
const modules: PlatformModule[] = [];
const servers: Server[] = [];
const workers: PlatformWorker[] = [];

afterEach(async () => {
  while (workers.length) workers.pop()?.stop();
  await Promise.all(servers.splice(0).map((server) => (
    new Promise<void>((resolve) => server.close(() => resolve()))
  )));
  while (modules.length) modules.pop()?.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('微信客服本地端到端', () => {
  it('将微信转发的 PDF 接入现有快速/深度链路，重复通知不重复分析或回复', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'boyuan-wechat-kf-e2e-'));
    roots.push(dataRoot);
    const attachmentRoot = join(dataRoot, 'attachments');
    await mkdir(attachmentRoot, { recursive: true });
    const quickAnalyze = vi.fn<QuickCardAnalysisPort['analyze']>(async () => ({
      companyName: '白杨智能',
      companyIdentity: '北京白杨智能科技有限公司，总部位于北京',
      productTechnology: 'AI 推理基础设施与具身智能控制系统',
      industryTrack: '特种具身智能',
      marketView: '特种场景智能化需求增长，规模待核验',
      financing: '已完成 A 轮融资',
      keyPeople: '核心团队材料已披露',
      companyRegion: '北京',
      financingStage: 'A轮',
      financingAmountWan: 2_000,
      highlights: ['国家级专精特新企业'],
      riskSignals: ['收入质量待核验'],
      diligenceQuestions: ['前五大客户收入占比是多少？'],
      industryTags: ['AI推理基础设施'],
      competitorNames: ['竞品甲', '竞品乙', '竞品丙'],
      upstreamNames: ['上游甲'],
      downstreamNames: ['下游甲', '下游乙'],
      providerId: 'openai',
      modelId: 'gpt-5.6-luna',
      variant: 'none',
      sessionId: 'wechat-kf-pdf-quick',
    }));
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
      quickCardAnalysis: { analyze: quickAnalyze },
      research: createDeterministicResearchAdapter(),
    });
    modules.push(platform);
    workers.push(createPlatformWorker(platform, { intervalMs: 5, batchSize: 10 }));
    const appStore = new Store({ initialData: initialStoreData(), persistToDisk: false });
    const app = createApp(appStore, createDemoServices(appStore), {
      researchPlatform: platform,
      wecomIntakeKey: 'test-wechat-kf-intake-key-123',
    });
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_missing');

    const config: WechatKfIntakeConfig = {
      schemaVersion: 1,
      platformBaseUrl: `http://127.0.0.1:${address.port}`,
      platformIntakeKey: 'test-wechat-kf-intake-key-123',
      publicWorkbenchUrl: 'https://demo.example.com/workbench',
      publicProductUrl: 'https://demo.example.com',
      servicePort: 19481,
      attachmentRoot,
      statePath: join(dataRoot, 'jobs.json'),
      cursorStatePath: join(dataRoot, 'cursors.json'),
      retryDelayMs: 1_500,
      timeoutMs: 600_000,
    };
    const sendText = vi.fn(async () => undefined);
    const downloadMedia = vi.fn(async () => ({
      buffer: simplePdf('Boyuan BP material from WeChat Customer Service.'),
      filename: '白杨智能商业计划书.pdf',
    }));
    const delivery = new WechatKfTextDelivery({ sendText });
    const materializer = new WechatKfFileMaterializer(config, { downloadMedia });
    const jobStore = new MemoryJobStore();
    const service = new IntakeService({
      config,
      platform: new HttpPlatformClient(
        config.platformBaseUrl,
        config.platformIntakeKey,
        config.timeoutMs,
        fetch,
        'wecom',
      ),
      delivery,
      store: jobStore,
      releaseAttachment: (attachment) => materializer.release(attachment),
    });
    const receiptStore = {
      statusReceiptId: (messageId: string, fileKey: string) => service.statusCardId(messageId, fileKey),
      statusReceiptTerminal: (messageId: string, fileKey: string) => (
        service.isStatusCardTerminal(messageId, fileKey)
      ),
      rememberStatusReceipt: (input: {
        chatId: string; messageId: string; fileKey: string; fileName: string;
        receipt: string; createdAt: string; senderId: string; metadata?: Record<string, string>;
      }) => service.rememberStatusCard({
        chatId: input.chatId,
        messageId: input.messageId,
        fileKey: input.fileKey,
        fileName: input.fileName,
        cardMessageId: input.receipt,
        createdAt: input.createdAt,
        senderId: input.senderId,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }),
      markStatusReceiptTerminal: (messageId: string, fileKey: string) => {
        service.markStatusCardTerminal(messageId, fileKey);
      },
    };
    const ingress = new DirectWechatKfFileIngress({
      delivery,
      materialize: (message, fileKey) => materializer.materialize(message, fileKey),
      ingestTurn: (turn) => service.ingestTurn(turn),
      ...receiptStore,
    });
    const inbound = {
      messageId: 'wechat-kf-pdf-message-1',
      openKfid: 'wkAJ2GCAAAexample',
      externalUserId: 'wmAJ2GCAAAcustomer',
      receivedAt: '2026-09-03T00:00:00.000Z',
      mediaId: 'media-1',
    };
    const syncMessages = vi.fn(async () => ({
      nextCursor: 'cursor-1',
      hasMore: false,
      messages: [inbound],
    }));
    const pump = new WechatKfMessagePump({
      client: { syncMessages },
      ingress,
      cursorStore: new MemoryWechatKfCursorStore(),
    });

    await pump.handleEvent({ token: 'callback-token-1', openKfid: inbound.openKfid });
    const sendsAfterFirst = sendText.mock.calls.length;
    await pump.handleEvent({ token: 'callback-token-2', openKfid: inbound.openKfid });

    const combinedReply = sendText.mock.calls.map(([input]) => input.content).join('\n');
    expect(combinedReply).toContain('已收到项目材料');
    expect(combinedReply).toContain('【博源AI｜BP事实核验】');
    expect(combinedReply).toContain('竞品｜3家：竞品甲、竞品乙等');
    expect(combinedReply).toContain('基金匹配（确定性规则）');
    expect(combinedReply).toContain('/workbench/conversations/');
    expect(sendText).toHaveBeenCalledTimes(sendsAfterFirst);
    expect(quickAnalyze).toHaveBeenCalledOnce();

    const conversations = await platform.listConversations();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({ sourceChannel: 'wecom', type: 'material' });
    for (let index = 0; index < 100; index += 1) {
      if ((await platform.getConversation(conversations[0]!.conversationId)).status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(await platform.getConversation(conversations[0]!.conversationId)).toMatchObject({
      sourceChannel: 'wecom',
      status: 'completed',
      task: { status: 'completed' },
    });
    expect(jobStore.listPending()).toEqual([]);
  });
});

function simplePdf(text: string): Buffer {
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n(${text.replace(/[()\\]/gu, '\\$&')}) Tj\nET\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let value = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(value));
    value += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(value);
  value += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  value += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  value += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(value, 'ascii');
}
