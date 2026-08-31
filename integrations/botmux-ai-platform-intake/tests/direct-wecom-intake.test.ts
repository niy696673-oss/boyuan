import { describe, expect, it, vi } from 'vitest';
import {
  DirectWeComCompanyResearchIngress,
  DirectWeComFileIngress,
  parseWeComCompanyResearchMessage,
  parseWeComFileMessage,
  WeComTextDelivery,
} from '../src/direct-wecom-intake.js';
import type { IntakeAttachment } from '../src/types.js';
import type { WeComBotPort } from '../src/wecom-runtime.js';
import { companyQuickCard, quickCard } from './helpers.js';

function fileFrame() {
  return {
    cmd: 'aibot_msg_callback',
    headers: { req_id: 'req-file-1' },
    body: {
      msgid: 'wecom-message-file-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'zhangsan' },
      create_time: 1_787_702_400,
      msgtype: 'file',
      file: { url: 'https://files.example.com/material?id=1', aeskey: 'aes-key' },
    },
  };
}

function textFrame(content = '研究 博源科技') {
  return {
    cmd: 'aibot_msg_callback',
    headers: { req_id: 'req-text-1' },
    body: {
      msgid: 'wecom-message-text-1',
      aibotid: 'bot-1',
      chatid: 'group-chat-1',
      chattype: 'group',
      from: { userid: 'lisi' },
      create_time: 1_787_702_400,
      msgtype: 'text',
      text: { content },
    },
  };
}

function portFixture(): WeComBotPort & {
  replyStream: ReturnType<typeof vi.fn>;
  sendMarkdown: ReturnType<typeof vi.fn>;
  downloadFile: ReturnType<typeof vi.fn>;
} {
  return {
    replyStream: vi.fn(async () => undefined),
    sendMarkdown: vi.fn(async () => undefined),
    downloadFile: vi.fn(async () => ({ buffer: Buffer.from('%PDF-1.4'), filename: '项目 BP.pdf' })),
  };
}

describe('direct WeCom intake', () => {
  it('parses official file frames and rejects insecure download URLs', () => {
    const first = parseWeComFileMessage(fileFrame());
    expect(first).toMatchObject({
      reqId: 'req-file-1',
      chatId: 'zhangsan',
      messageId: 'wecom-message-file-1',
      senderId: 'zhangsan',
      downloadUrl: 'https://files.example.com/material?id=1',
      aesKey: 'aes-key',
      receivedAt: new Date(1_787_702_400_000).toISOString(),
    });
    const insecure = fileFrame();
    insecure.body.file.url = 'http://127.0.0.1/private';
    expect(parseWeComFileMessage(insecure)).toBeNull();
    const refreshed = fileFrame();
    refreshed.body.file.url = 'https://files.example.com/refreshed?id=2';
    expect(parseWeComFileMessage(refreshed)?.fileKey).toBe(first?.fileKey);
  });

  it('posts processing before download, persists the stream receipt, and finalizes the same reply', async () => {
    const port = portFixture();
    const delivery = new WeComTextDelivery(port);
    const order: string[] = [];
    let receipt: string | undefined;
    const attachment: IntakeAttachment = {
      fileKey: 'file',
      name: '项目 BP.pdf',
      mimeType: 'application/pdf',
      path: '/managed/项目 BP.pdf',
      size: 100,
    };
    port.replyStream.mockImplementation(async (_req, _stream, _content, finish) => {
      order.push(finish ? 'final' : 'processing');
    });
    const ingress = new DirectWeComFileIngress({
      delivery,
      statusReceiptId: () => receipt,
      rememberStatusReceipt: (input) => { order.push('persist'); receipt = input.receipt; },
      markStatusReceiptTerminal: vi.fn(),
      materialize: vi.fn(async (message) => {
        order.push('materialize');
        return { ...attachment, fileKey: message.fileKey };
      }),
      ingestTurn: vi.fn(async (turn) => {
        order.push('ingest');
        await delivery.complete({
          kind: 'bp',
          chatId: turn.chatId,
          sessionId: turn.sessionId,
          messageId: turn.messageId,
          fileKey: turn.attachments[0]!.fileKey,
          statusReceipt: turn.statusCardMessageId,
          result: quickCard(),
          links: { deepAnalysisUrl: 'https://demo.example.com/workbench/conversations/c1' },
        });
        return [{
          fileKey: turn.attachments[0]!.fileKey,
          fileName: '项目 BP.pdf',
          status: 'completed' as const,
        }];
      }),
    });

    await expect(ingress.handle(fileFrame())).resolves.toEqual({ handled: true });

    expect(order).toEqual(['processing', 'persist', 'materialize', 'ingest', 'final']);
    expect(port.replyStream).toHaveBeenCalledTimes(2);
    expect(port.replyStream.mock.calls[0]?.[0]).toBe('req-file-1');
    expect(port.replyStream.mock.calls[0]?.[3]).toBe(false);
    expect(port.replyStream.mock.calls[1]?.[3]).toBe(true);
    expect(port.replyStream.mock.calls[1]?.[2]).toContain('BP事实核验');
    expect(JSON.stringify(port.replyStream.mock.calls)).not.toContain('Sol');
  });

  it('finishes a failed download and marks the receipt terminal', async () => {
    const port = portFixture();
    const delivery = new WeComTextDelivery(port);
    const markStatusReceiptTerminal = vi.fn();
    const ingress = new DirectWeComFileIngress({
      delivery,
      statusReceiptId: () => undefined,
      rememberStatusReceipt: vi.fn(),
      markStatusReceiptTerminal,
      materialize: vi.fn(async () => { throw new Error('attachment_type_unsupported'); }),
      ingestTurn: vi.fn(async () => []),
    });

    await expect(ingress.handle(fileFrame())).rejects.toThrow('attachment_type_unsupported');

    expect(port.replyStream).toHaveBeenCalledTimes(2);
    expect(port.replyStream.mock.calls[1]?.[2]).toContain('接入失败');
    expect(port.replyStream.mock.calls[1]?.[3]).toBe(true);
    expect(markStatusReceiptTerminal).toHaveBeenCalledOnce();
  });

  it('routes an explicit company command into quick and deep research with one stream', async () => {
    const port = portFixture();
    const delivery = new WeComTextDelivery(port);
    let receipt: string | undefined;
    const researchCompany = vi.fn(async (turn) => {
      await delivery.complete({
        kind: 'company_research',
        chatId: turn.chatId,
        sessionId: turn.sessionId,
        messageId: turn.messageId,
        fileKey: 'company-research',
        statusReceipt: turn.statusCardMessageId,
        result: companyQuickCard(),
        links: { deepAnalysisUrl: 'https://demo.example.com/workbench/conversations/c2' },
      });
      return { fileKey: 'company-research', fileName: turn.companyName, status: 'completed' as const };
    });
    const ingress = new DirectWeComCompanyResearchIngress({
      delivery,
      researchCompany,
      statusReceiptId: () => receipt,
      rememberStatusReceipt: (input) => { receipt = input.receipt; },
      markStatusReceiptTerminal: vi.fn(),
    });

    await expect(ingress.handle(textFrame())).resolves.toEqual({ handled: true });

    expect(parseWeComCompanyResearchMessage(textFrame())).toMatchObject({
      chatId: 'group-chat-1',
      companyName: '博源科技',
      senderId: 'lisi',
    });
    expect(researchCompany).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'wecom:wecom-message-text-1',
      companyName: '博源科技',
    }));
    expect(port.replyStream).toHaveBeenCalledTimes(2);
    expect(port.replyStream.mock.calls[1]?.[2]).toContain('公司快速研究');
    expect(parseWeComCompanyResearchMessage(textFrame('你好'))).toBeNull();
  });
});
