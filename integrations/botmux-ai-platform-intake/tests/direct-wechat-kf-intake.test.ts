import { describe, expect, it, vi } from 'vitest';
import {
  DirectWechatKfFileIngress,
  WechatKfTextDelivery,
  type WechatKfTextPort,
} from '../src/direct-wechat-kf-intake.js';
import type { IntakeAttachment } from '../src/types.js';
import { quickCard } from './helpers.js';

function message() {
  return {
    messageId: 'wechat-kf-message-1',
    openKfid: 'wkAJ2GCAAAexample',
    externalUserId: 'wmAJ2GCAAAcustomer',
    receivedAt: new Date(1_788_000_000_000).toISOString(),
    mediaId: 'media-1',
  };
}

describe('direct WeChat Customer Service intake', () => {
  it('sends processing text before download and returns the existing BP quick result as ordinary text', async () => {
    const order: string[] = [];
    const port: WechatKfTextPort = {
      sendText: vi.fn(async (input) => {
        order.push(input.content.includes('正在接入') ? 'processing' : 'final');
      }),
    };
    const delivery = new WechatKfTextDelivery(port);
    let receipt: string | undefined;
    const materialize = vi.fn(async (_input, fileKey: string): Promise<IntakeAttachment> => {
      order.push('materialize');
      return {
        fileKey,
        name: '项目 BP.pdf',
        mimeType: 'application/pdf',
        path: '/managed/project.pdf',
        size: 1_024,
      };
    });
    const ingress = new DirectWechatKfFileIngress({
      delivery,
      statusReceiptId: () => receipt,
      statusReceiptTerminal: () => false,
      rememberStatusReceipt: (input) => { order.push('persist'); receipt = input.receipt; },
      markStatusReceiptTerminal: vi.fn(),
      materialize,
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

    await ingress.handle(message());

    expect(order).toEqual(['processing', 'persist', 'materialize', 'ingest', 'final']);
    expect(materialize).toHaveBeenCalledWith(message(), expect.stringMatching(/^[a-f0-9]{48}$/u));
    expect(port.sendText).toHaveBeenCalledTimes(2);
    expect(vi.mocked(port.sendText).mock.calls[0]?.[0]).toMatchObject({
      externalUserId: 'wmAJ2GCAAAcustomer',
      openKfid: 'wkAJ2GCAAAexample',
    });
    expect(vi.mocked(port.sendText).mock.calls[1]?.[0].content).toContain('【博源AI｜BP事实核验】');
    expect(vi.mocked(port.sendText).mock.calls[1]?.[0].content).toContain('查看深度分析');
  });

  it('records an unsupported file as terminal and replies with the PDF-only rule just once', async () => {
    const port: WechatKfTextPort = { sendText: vi.fn(async () => undefined) };
    const sendText = vi.mocked(port.sendText);
    const delivery = new WechatKfTextDelivery(port);
    let receipt: string | undefined;
    let terminal = false;
    const materialize = vi.fn(async () => { throw new Error('attachment_type_unsupported'); });
    const ingress = new DirectWechatKfFileIngress({
      delivery,
      statusReceiptId: () => receipt,
      statusReceiptTerminal: () => terminal,
      rememberStatusReceipt: (input) => { receipt = input.receipt; },
      markStatusReceiptTerminal: () => { terminal = true; },
      materialize,
      ingestTurn: vi.fn(async () => []),
    });

    await expect(ingress.handle(message())).resolves.toBeUndefined();
    await expect(ingress.handle(message())).resolves.toBeUndefined();

    expect(sendText).toHaveBeenCalledTimes(2);
    expect(materialize).toHaveBeenCalledOnce();
    expect(sendText.mock.calls[1]?.[0].content).toContain('不超过 20MB 的 PDF');
    expect(sendText.mock.calls[1]?.[0].content).not.toContain('DOCX');
  });

  it('keeps an oversized quick result within three final messages and preserves the workbench link', async () => {
    const port: WechatKfTextPort = { sendText: vi.fn(async () => undefined) };
    const delivery = new WechatKfTextDelivery(port);
    const receipt = await delivery.openProcessing({ ...message(), fileKey: 'file-key' });
    vi.mocked(port.sendText).mockClear();

    await delivery.complete({
      kind: 'bp',
      chatId: message().externalUserId,
      sessionId: 'session-1',
      messageId: message().messageId,
      fileKey: 'file-key',
      statusReceipt: receipt,
      result: quickCard({
        productTechnology: '技术'.repeat(1_000),
        marketView: '市场'.repeat(1_000),
        financing: '融资'.repeat(1_000),
        keyPeople: '团队'.repeat(1_000),
      }),
      links: { deepAnalysisUrl: 'https://demo.example.com/workbench/conversations/preserved' },
    });

    const finalMessages = vi.mocked(port.sendText).mock.calls.map(([input]) => input.content);
    expect(finalMessages.length).toBeLessThanOrEqual(3);
    expect(finalMessages.every((content) => Buffer.byteLength(content, 'utf8') <= 2_048)).toBe(true);
    expect(finalMessages.join('')).toContain('/workbench/conversations/preserved');
  });
});
