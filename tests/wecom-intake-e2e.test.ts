// @vitest-environment node

import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.js';
import { createDemoServices } from '../server/platform/runtime.js';
import { createDeterministicAnalysisAdapter } from '../server/research-platform/analysis/deterministic-analysis.js';
import type { CompanyQuickCardAnalysisPort } from '../server/research-platform/company-quick-card/contracts.js';
import type { PlatformModule } from '../server/research-platform/contracts.js';
import { createPlatformModule } from '../server/research-platform/platform-module.js';
import { createPlatformWorker, type PlatformWorker } from '../server/research-platform/platform-worker.js';
import type { QuickCardAnalysisPort } from '../server/research-platform/quick-card/contracts.js';
import { createDeterministicResearchAdapter } from '../server/research-platform/research/deterministic-research.js';
import type { WebSearchPort } from '../server/research-platform/search/contracts.js';
import { initialStoreData, Store } from '../server/store.js';
import {
  DirectWeComCompanyResearchIngress,
  DirectWeComFileIngress,
  WeComTextDelivery,
} from '../integrations/botmux-ai-platform-intake/src/direct-wecom-intake.js';
import { IntakeService } from '../integrations/botmux-ai-platform-intake/src/intake-service.js';
import { MemoryJobStore } from '../integrations/botmux-ai-platform-intake/src/job-store.js';
import { HttpPlatformClient } from '../integrations/botmux-ai-platform-intake/src/platform-client.js';
import {
  COMPANY_RESEARCH_FILE_KEY,
  type WeComBotPort,
  type WeComIntakeConfig,
} from '../integrations/botmux-ai-platform-intake/src/types.js';

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

describe('企业微信智能机器人本地端到端', () => {
  it('用官方事件形状完成 PDF 与公司名的快速/深度分流，并回写同一条文本流', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'boyuan-wecom-e2e-'));
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
      sessionId: 'wecom-pdf-quick',
    }));
    const search = vi.fn<WebSearchPort['search']>(async () => [{
      title: '新研科技公开更新',
      url: 'https://example.com/xinyan/update',
      site: 'example.com',
      highlights: ['新研科技发布机构研究产品。'],
      accessStatus: 'accessible',
      retrievedAt: '2026-08-31T00:00:00.000Z',
    }]);
    const companyAnalyze = vi.fn<CompanyQuickCardAnalysisPort['analyze']>(async (input) => ({
      companyIdentity: input.companyName,
      productTechnology: 'AI 推理基础设施研究工作台',
      industryTrack: '企业研究智能化',
      marketView: '机构研究智能化需求增长，规模待核验',
      financing: '暂未检索到',
      keyPeople: '暂未检索到',
      companyRegion: '成都',
      financingStage: 'A轮',
      financingAmountWan: 2_000,
      highlights: ['机构知识沉淀闭环'],
      riskSignals: ['客户集中度待核验'],
      diligenceQuestions: ['前五大客户收入占比是多少？'],
      industryTags: ['AI推理基础设施'],
      recentSignals: input.webResults.flatMap((item) => item.highlights),
      competitorNames: ['竞品甲'],
      upstreamNames: ['模型服务商甲'],
      downstreamNames: ['投资机构甲'],
      providerId: 'openai',
      modelId: 'gpt-5.6-luna',
      variant: 'none',
      sessionId: 'wecom-company-quick',
    }));
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
      quickCardAnalysis: { analyze: quickAnalyze },
      companyQuickCardAnalysis: { analyze: companyAnalyze },
      research: createDeterministicResearchAdapter(),
      search: { search },
    });
    modules.push(platform);
    workers.push(createPlatformWorker(platform, { intervalMs: 5, batchSize: 10 }));
    const appStore = new Store({ initialData: initialStoreData(), persistToDisk: false });
    const app = createApp(appStore, createDemoServices(appStore), {
      researchPlatform: platform,
      wecomIntakeKey: 'test-wecom-intake-key-123',
    });
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_missing');

    const config: WeComIntakeConfig = {
      schemaVersion: 1,
      platformBaseUrl: `http://127.0.0.1:${address.port}`,
      platformIntakeKey: 'test-wecom-intake-key-123',
      publicWorkbenchUrl: 'https://demo.example.com/workbench',
      publicProductUrl: 'https://demo.example.com',
      servicePort: 19480,
      attachmentRoot,
      statePath: join(dataRoot, 'jobs.json'),
      retryDelayMs: 1_500,
      timeoutMs: 600_000,
    };
    const replyStream = vi.fn(async () => undefined);
    const sendMarkdown = vi.fn(async () => undefined);
    const downloadFile = vi.fn(async () => ({
      buffer: simplePdf('Boyuan BP material for local WeCom integration test.'),
      filename: '白杨智能商业计划书.pdf',
    }));
    const transport: WeComBotPort = { replyStream, sendMarkdown, downloadFile };
    const delivery = new WeComTextDelivery(transport);
    const materialize = async (message: Parameters<DirectWeComFileIngress['resume']>[0]) => {
      const downloaded = await transport.downloadFile(message.downloadUrl, message.aesKey);
      const path = join(attachmentRoot, `${message.fileKey}.pdf`);
      await writeFile(path, downloaded.buffer, { mode: 0o600 });
      const fileStat = await stat(path);
      return {
        fileKey: message.fileKey,
        name: downloaded.filename ?? '企业微信项目材料.pdf',
        mimeType: 'application/pdf',
        path,
        size: fileStat.size,
      };
    };
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
      releaseAttachment: (attachment) => rm(attachment.path, { force: true }),
    });
    const receipts = {
      statusReceiptId: (messageId: string, fileKey: string) => service.statusCardId(messageId, fileKey),
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
    const fileIngress = new DirectWeComFileIngress({
      delivery,
      materialize,
      ingestTurn: (turn) => service.ingestTurn(turn),
      ...receipts,
    });
    const companyIngress = new DirectWeComCompanyResearchIngress({
      delivery,
      researchCompany: (turn) => service.researchCompany(turn),
      ...receipts,
    });

    await expect(fileIngress.handle({
      cmd: 'aibot_msg_callback',
      headers: { req_id: 'req-pdf-1' },
      body: {
        msgid: 'wecom-pdf-message-1',
        aibotid: 'bot-1',
        chattype: 'single',
        from: { userid: 'wecom-user-1' },
        create_time: 1_788_102_400,
        msgtype: 'file',
        file: { url: 'https://files.example.com/encrypted-pdf', aeskey: 'test-aes-key' },
      },
    })).resolves.toEqual({ handled: true });

    expect(replyStream).toHaveBeenCalledTimes(2);
    expect(replyStream.mock.calls[0]?.[3]).toBe(false);
    expect(replyStream.mock.calls[1]?.[3]).toBe(true);
    expect(replyStream.mock.calls[1]?.[2]).toContain('【博源AI｜BP事实核验】');
    expect(replyStream.mock.calls[1]?.[2]).toContain('竞品3家：竞品甲、竞品乙等');
    expect(replyStream.mock.calls[1]?.[2]).toContain('基金匹配（确定性规则）');
    expect(replyStream.mock.calls[1]?.[2]).toContain('/workbench/conversations/');
    expect(downloadFile).toHaveBeenCalledWith(
      'https://files.example.com/encrypted-pdf',
      'test-aes-key',
    );
    expect(sendMarkdown).not.toHaveBeenCalled();

    await expect(companyIngress.handle({
      cmd: 'aibot_msg_callback',
      headers: { req_id: 'req-company-1' },
      body: {
        msgid: 'wecom-company-message-1',
        aibotid: 'bot-1',
        chatid: 'wecom-group-1',
        chattype: 'group',
        from: { userid: 'wecom-user-2' },
        create_time: 1_788_102_401,
        msgtype: 'text',
        text: { content: '研究 新研科技有限公司' },
      },
    })).resolves.toEqual({ handled: true });

    expect(replyStream).toHaveBeenCalledTimes(4);
    expect(replyStream.mock.calls[3]?.[2]).toContain('【博源AI｜公司快速研究】');
    expect(replyStream.mock.calls[3]?.[2]).toContain('新研科技发布机构研究产品');
    expect(JSON.stringify(replyStream.mock.calls)).not.toContain('Sol');
    expect(quickAnalyze).toHaveBeenCalledOnce();
    expect(companyAnalyze).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledOnce();

    const conversations = await platform.listConversations();
    expect(conversations).toHaveLength(2);
    expect(conversations).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceChannel: 'wecom', type: 'material' }),
      expect.objectContaining({ sourceChannel: 'wecom', type: 'company' }),
    ]));
    for (const conversation of conversations) {
      for (let index = 0; index < 100; index += 1) {
        if ((await platform.getConversation(conversation.conversationId)).status === 'completed') break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(await platform.getConversation(conversation.conversationId)).toMatchObject({
        sourceChannel: 'wecom',
        status: 'completed',
        task: { status: 'completed' },
      });
    }
    expect(jobStore.listPending()).toEqual([]);
    expect(jobStore.listStatusCards()).toEqual([]);
    expect(COMPANY_RESEARCH_FILE_KEY).toBe('company-research');
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
