import { describe, expect, it, vi } from 'vitest';
import { DirectFeishuFileIngress, FeishuCardMessenger, parseFeishuFileMessage } from '../src/direct-feishu-intake.js';
import type { IntakeAttachment } from '../src/types.js';

const pdf: IntakeAttachment = {
  fileKey: 'file_pdf',
  name: '项目 BP.pdf',
  mimeType: 'application/pdf',
  path: '/managed/项目 BP.pdf',
  size: 1024,
};

function fileEvent(overrides: Record<string, unknown> = {}) {
  return {
    sender: { sender_id: { open_id: 'ou_sender' }, sender_type: 'user' },
    message: {
      message_id: 'om_pdf',
      chat_id: 'oc_chat',
      chat_type: 'p2p',
      message_type: 'file',
      create_time: '1787702400000',
      content: JSON.stringify({ file_key: 'file_pdf', file_name: '项目 BP.pdf' }),
      ...overrides,
    },
  };
}

describe('direct Feishu file intake', () => {
  it('routes one PDF directly to the platform intake without creating a BotMux model turn', async () => {
    const materialize = vi.fn(async () => pdf);
    const ingestTurn = vi.fn(async () => [{
      fileKey: 'file_pdf', fileName: '项目 BP.pdf', status: 'completed' as const,
    }]);
    const ingress = new DirectFeishuFileIngress({ materialize, ingestTurn });

    await expect(ingress.handle(fileEvent())).resolves.toEqual({ handled: true });

    expect(materialize).toHaveBeenCalledOnce();
    expect(ingestTurn).toHaveBeenCalledOnce();
    expect(ingestTurn).toHaveBeenCalledWith(expect.objectContaining({
      chatId: 'oc_chat',
      sessionId: 'feishu:om_pdf',
      messageId: 'om_pdf',
      senderId: 'ou_sender',
      attachments: [pdf],
    }));
  });

  it('ignores ordinary chat messages and malformed file events', async () => {
    const materialize = vi.fn(async () => pdf);
    const ingestTurn = vi.fn(async () => []);
    const ingress = new DirectFeishuFileIngress({ materialize, ingestTurn });

    await expect(ingress.handle(fileEvent({ message_type: 'text', content: '{"text":"你好"}' })))
      .resolves.toEqual({ handled: false });
    await expect(ingress.handle(fileEvent({ content: '{"file_key":"file_pdf"}' })))
      .resolves.toEqual({ handled: false });
    await expect(ingress.handle({ ...fileEvent(), sender: { sender_type: 'app', sender_id: { open_id: 'ou_bot' } } }))
      .resolves.toEqual({ handled: false });
    expect(materialize).not.toHaveBeenCalled();
    expect(ingestTurn).not.toHaveBeenCalled();
  });

  it('creates one interactive status card, then replaces it without a text or Sol message', async () => {
    const reply = vi.fn(async () => ({ messageId: 'om_status_card' }));
    const update = vi.fn(async () => undefined);
    const messenger = new FeishuCardMessenger({ reply, update });

    await expect(messenger.sendCard({
      chatId: 'oc_chat',
      sessionId: 'feishu:om_pdf',
      messageId: 'om_pdf',
      fileKey: 'file_pdf',
      responseKind: 'loading',
      cardKind: 'loading',
      card: { schema: '2.0', body: { elements: [{ content: '资料处理中', tag: 'markdown' }] } },
    })).resolves.toEqual({ messageId: 'om_status_card' });

    await messenger.updateCard({
      cardMessageId: 'om_status_card',
      card: { schema: '2.0', body: { elements: [{ content: 'BP 导入 · 事实核验', tag: 'markdown' }] } },
    });

    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'om_pdf',
      messageType: 'interactive',
      content: expect.stringContaining('资料处理中'),
    }));
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      cardMessageId: 'om_status_card',
      content: expect.stringContaining('BP 导入 · 事实核验'),
    }));
    expect(JSON.stringify([reply.mock.calls, update.mock.calls])).not.toContain('gpt-5.6-sol');
  });

  it('uses a stable attachment-level UUID for each card reply', async () => {
    const reply = vi.fn(async (_input: { uuid: string }) => ({ messageId: 'om_status_card' }));
    const messenger = new FeishuCardMessenger({ reply, update: vi.fn(async () => undefined) });
    const base = {
      chatId: 'oc_chat',
      sessionId: 'feishu:om_pdf',
      messageId: 'om_pdf',
      card: { schema: '2.0' },
    } as const;

    await messenger.sendCard({ ...base, fileKey: 'file_one', responseKind: 'loading', cardKind: 'loading' });
    await messenger.sendCard({ ...base, fileKey: 'file_two', responseKind: 'loading', cardKind: 'loading' });
    await messenger.sendCard({ ...base, fileKey: 'file_one', responseKind: 'loading', cardKind: 'loading' });
    await messenger.sendCard({ ...base, fileKey: 'file_one', responseKind: 'final', cardKind: 'failure' });
    await messenger.sendCard({ ...base, fileKey: 'file_one', responseKind: 'final', cardKind: 'completion' });

    const uuids = reply.mock.calls.map(([input]) => input.uuid);
    expect(uuids[0]).not.toBe(uuids[1]);
    expect(uuids[0]).toBe(uuids[2]);
    expect(uuids[0]).not.toBe(uuids[3]);
    expect(uuids[3]).not.toBe(uuids[4]);
  });

  it('processes different attachments from the same message concurrently', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const materialize = vi.fn(async (message: { fileKey: string; fileName: string }) => ({
      ...pdf,
      fileKey: message.fileKey,
      name: message.fileName,
    }));
    const ingestTurn = vi.fn(async (input) => {
      await gate;
      const attachment = input.attachments[0]!;
      return [{ fileKey: attachment.fileKey, fileName: attachment.name, status: 'completed' as const }];
    });
    const ingress = new DirectFeishuFileIngress({ materialize, ingestTurn });
    const base = {
      chatId: 'oc_chat',
      messageId: 'om_shared',
      receivedAt: new Date(1787702400000).toISOString(),
    };

    const first = ingress.resume({ ...base, fileKey: 'file_one', fileName: 'one.pdf' });
    const second = ingress.resume({ ...base, fileKey: 'file_two', fileName: 'two.pdf' });
    await vi.waitFor(() => expect(materialize).toHaveBeenCalledTimes(2));
    release?.();
    await Promise.all([first, second]);

    expect(ingestTurn).toHaveBeenCalledTimes(2);
    expect(ingestTurn.mock.calls.map(([input]) => input.attachments[0]?.fileKey).sort())
      .toEqual(['file_one', 'file_two']);
  });

  it('posts the processing card before downloading the file and passes its message id to intake', async () => {
    const order: string[] = [];
    let storedStatusCardId: string | undefined;
    const messenger = {
      sendCard: vi.fn(async () => { order.push('loading'); return { messageId: 'om_status_card' }; }),
      updateCard: vi.fn(async () => undefined),
    };
    const materialize = vi.fn(async () => { order.push('materialize'); return pdf; });
    const ingestTurn = vi.fn(async (input) => {
      order.push('ingest');
      expect(input.statusCardMessageId).toBe('om_status_card');
      return [{ fileKey: 'file_pdf', fileName: '项目 BP.pdf', status: 'completed' as const }];
    });
    const ingress = new DirectFeishuFileIngress({
      materialize,
      ingestTurn,
      messenger,
      statusCardId: () => storedStatusCardId,
      rememberStatusCard: (_message, cardMessageId) => {
        order.push('persist');
        storedStatusCardId = cardMessageId;
      },
      markStatusCardTerminal: vi.fn(),
    });

    await expect(ingress.handle(fileEvent())).resolves.toEqual({ handled: true });

    expect(order).toEqual(['loading', 'persist', 'materialize', 'ingest']);
    expect(JSON.stringify(messenger.sendCard.mock.calls)).toContain('资料处理中');
  });

  it('does not create another processing reply for a persisted duplicate event', async () => {
    const messenger = {
      sendCard: vi.fn(async () => ({ messageId: 'om_duplicate' })),
      updateCard: vi.fn(async () => undefined),
    };
    const materialize = vi.fn(async () => pdf);
    const ingestTurn = vi.fn(async () => [{
      fileKey: 'file_pdf', fileName: '项目 BP.pdf', status: 'completed' as const,
    }]);
    const ingress = new DirectFeishuFileIngress({
      materialize,
      ingestTurn,
      messenger,
      statusCardId: () => 'om_duplicate',
      rememberStatusCard: vi.fn(),
      markStatusCardTerminal: vi.fn(),
    });

    await ingress.handle(fileEvent());

    expect(messenger.sendCard).not.toHaveBeenCalled();
    expect(ingestTurn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCardMessageId: 'om_duplicate' }),
    );
  });

  it('turns the processing card into a failure card when file download fails', async () => {
    const messenger = {
      sendCard: vi.fn(async () => ({ messageId: 'om_status_card' })),
      updateCard: vi.fn(async () => undefined),
    };
    const ingress = new DirectFeishuFileIngress({
      materialize: vi.fn(async () => { throw new Error('download_failed'); }),
      ingestTurn: vi.fn(async () => []),
      messenger,
      statusCardId: () => undefined,
      rememberStatusCard: vi.fn(),
      markStatusCardTerminal: vi.fn(),
    });

    await expect(ingress.handle(fileEvent())).rejects.toThrow('download_failed');

    expect(messenger.updateCard).toHaveBeenCalledWith(expect.objectContaining({
      cardMessageId: 'om_status_card',
      card: expect.objectContaining({ schema: '2.0' }),
    }));
    expect(JSON.stringify(messenger.updateCard.mock.calls)).toContain('材料处理失败');
  });

  it('reuses the persisted processing card after a restart before upload acceptance', async () => {
    let storedStatusCardId: string | undefined;
    const sendCard = vi.fn(async () => ({ messageId: 'om_status_card' }));
    const messenger = {
      sendCard,
      updateCard: vi.fn(async () => undefined),
    };
    const statusCardId = () => storedStatusCardId;
    const rememberStatusCard = (_message: unknown, cardMessageId: string) => {
      storedStatusCardId = cardMessageId;
    };
    const first = new DirectFeishuFileIngress({
      materialize: vi.fn(async () => { throw new Error('service_restarted'); }),
      ingestTurn: vi.fn(async () => []),
      messenger,
      statusCardId,
      rememberStatusCard,
      markStatusCardTerminal: vi.fn(),
    });

    await expect(first.handle(fileEvent())).rejects.toThrow('service_restarted');

    const ingestTurn = vi.fn(async () => [{
      fileKey: 'file_pdf', fileName: '项目 BP.pdf', status: 'completed' as const,
    }]);
    const resumed = new DirectFeishuFileIngress({
      materialize: vi.fn(async () => pdf),
      ingestTurn,
      messenger,
      statusCardId,
      rememberStatusCard,
      markStatusCardTerminal: vi.fn(),
    });
    await resumed.handle(fileEvent());

    expect(sendCard).toHaveBeenCalledOnce();
    expect(ingestTurn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCardMessageId: 'om_status_card' }),
    );
  });

  it('can resume a persisted source message without waiting for Feishu to redeliver it', async () => {
    const ingestTurn = vi.fn(async () => [{
      fileKey: 'file_pdf', fileName: '项目 BP.pdf', status: 'completed' as const,
    }]);
    const ingress = new DirectFeishuFileIngress({
      materialize: vi.fn(async () => pdf),
      ingestTurn,
      messenger: {
        sendCard: vi.fn(async () => ({ messageId: 'om_unexpected' })),
        updateCard: vi.fn(async () => undefined),
      },
      statusCardId: () => 'om_status_card',
      rememberStatusCard: vi.fn(),
      markStatusCardTerminal: vi.fn(),
    });

    await ingress.resume({
      chatId: 'oc_chat',
      messageId: 'om_pdf',
      fileKey: 'file_pdf',
      fileName: '项目 BP.pdf',
      receivedAt: new Date(1787702400000).toISOString(),
      senderId: 'ou_sender',
    });

    expect(ingestTurn).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'om_pdf',
      statusCardMessageId: 'om_status_card',
    }));
  });

  it('marks a permanently unsupported attachment as terminal for restart recovery', async () => {
    const markStatusCardTerminal = vi.fn();
    const ingress = new DirectFeishuFileIngress({
      materialize: vi.fn(async () => { throw new Error('attachment_type_unsupported'); }),
      ingestTurn: vi.fn(async () => []),
      messenger: {
        sendCard: vi.fn(async () => ({ messageId: 'om_status_card' })),
        updateCard: vi.fn(async () => undefined),
      },
      statusCardId: () => 'om_status_card',
      rememberStatusCard: vi.fn(),
      markStatusCardTerminal,
    });

    await expect(ingress.resume({
      chatId: 'oc_chat', messageId: 'om_pdf', fileKey: 'file_pdf',
      fileName: '项目 BP.exe', receivedAt: new Date().toISOString(),
    })).rejects.toThrow('attachment_type_unsupported');

    expect(markStatusCardTerminal).toHaveBeenCalledWith(expect.objectContaining({ fileName: '项目 BP.exe' }));
  });

  it('extracts the original Feishu receive time for end-to-end timing', () => {
    expect(parseFeishuFileMessage(fileEvent())).toEqual(expect.objectContaining({
      messageId: 'om_pdf',
      receivedAt: new Date(1787702400000).toISOString(),
    }));
  });
});
