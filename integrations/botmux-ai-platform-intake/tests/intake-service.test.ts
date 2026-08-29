import { describe, expect, it, vi } from 'vitest';
import { FeishuCardMessenger } from '../src/direct-feishu-intake.js';
import { IntakeService, jobKey } from '../src/intake-service.js';
import { MemoryJobStore } from '../src/job-store.js';
import type { IntakeAttachment, IntakeTurn, Messenger, PlatformClient, SendCardInput } from '../src/types.js';
import { companyQuickCard, conversation, quickCard, tempDir, testConfig } from './helpers.js';

const attachment = (key: string, name = `${key}.pdf`): IntakeAttachment => ({
  fileKey: key, name, mimeType: 'application/pdf', path: `/managed/${name}`, size: 10,
});
const turn = (...attachments: IntakeAttachment[]): IntakeTurn => ({
  chatId: 'oc_chat', sessionId: 'session', messageId: 'om_message', senderId: 'ou_sender', attachments,
});

function platformFixture(): PlatformClient {
  return {
    upload: vi.fn(async (_turn, file) => ({ conversation: conversation(`conversation-${file.fileKey}`, 'processing'), reusedDocument: false })),
    quickCard: vi.fn(async () => quickCard()),
    startCompanyResearch: vi.fn(async () => ({ conversation: conversation('conversation-company', 'processing'), reusedResearch: false })),
    companyQuickCard: vi.fn(async () => companyQuickCard()),
  };
}

describe('intake service', () => {
  it('starts company deep research and updates the same card with the independent quick result', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    const updateCard = vi.fn(async () => undefined);
    const messenger: Messenger = {
      sendCard: vi.fn(async () => ({ messageId: 'om_unexpected' })),
      updateCard,
    };
    try {
      const service = new IntakeService({
        config: testConfig(temp.path),
        platform,
        messenger,
        store: new MemoryJobStore(),
      });
      const input = {
        chatId: 'oc_chat',
        sessionId: 'feishu:om_company',
        messageId: 'om_company',
        companyName: '博源科技',
        senderId: 'ou_sender',
        statusCardMessageId: 'om_processing',
      };

      const first = await service.researchCompany(input);
      const replay = await service.researchCompany(input);

      expect(platform.startCompanyResearch).toHaveBeenCalledOnce();
      expect(platform.companyQuickCard).toHaveBeenCalledOnce();
      expect(first).toMatchObject({ status: 'completed', conversationId: 'conversation-company' });
      expect(replay).toMatchObject({ status: 'completed', conversationId: 'conversation-company' });
      expect(messenger.sendCard).not.toHaveBeenCalled();
      expect(messenger.updateCard).toHaveBeenCalledOnce();
      const rendered = JSON.stringify(updateCard.mock.calls[0]);
      expect(rendered).toContain('公司研究 · 快速分析');
      expect(rendered).toContain('公开来源');
      expect(rendered).not.toContain('Sol');
    } finally { temp.cleanup(); }
  });

  it('keeps the deep research link when company quick analysis fails', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    vi.mocked(platform.companyQuickCard).mockRejectedValue(new Error('luna_failed'));
    const updateCard = vi.fn(async () => undefined);
    const messenger: Messenger = {
      sendCard: vi.fn(async () => undefined),
      updateCard,
    };
    try {
      const service = new IntakeService({
        config: testConfig(temp.path),
        platform,
        messenger,
        store: new MemoryJobStore(),
      });
      await service.researchCompany({
        chatId: 'oc_chat',
        sessionId: 'feishu:om_company',
        messageId: 'om_company',
        companyName: '博源科技',
        statusCardMessageId: 'om_processing',
      });

      const rendered = JSON.stringify(updateCard.mock.calls[0]);
      expect(rendered).toContain('快速分析未完成');
      expect(rendered).toContain('/workbench/conversations/conversation-company');
      expect(platform.startCompanyResearch).toHaveBeenCalledOnce();
    } finally { temp.cleanup(); }
  });

  it('resumes orphan processing receipts and removes the redundant receipt after upload is durable', async () => {
    const temp = tempDir();
    const store = new MemoryJobStore();
    const service = new IntakeService({
      config: testConfig(temp.path),
      platform: platformFixture(),
      messenger: { sendCard: vi.fn(async () => undefined), updateCard: vi.fn(async () => undefined) },
      store,
      setTimer: () => undefined,
    });
    service.rememberStatusCard({
      chatId: 'oc_chat',
      messageId: 'om_message',
      fileKey: 'one',
      fileName: 'one.pdf',
      cardMessageId: 'om_status_card',
      createdAt: '2026-08-26T00:00:00.000Z',
      senderId: 'ou_sender',
    });

    try {
      expect(service.listOrphanStatusCards()).toEqual([
        expect.objectContaining({ messageId: 'om_message', cardMessageId: 'om_status_card' }),
      ]);
      service.markStatusCardTerminal('om_message', 'one');
      expect(service.listOrphanStatusCards()).toEqual([]);
      service.rememberStatusCard({
        chatId: 'oc_chat', messageId: 'om_message', fileKey: 'one', fileName: 'one.pdf',
        cardMessageId: 'om_status_card', createdAt: '2026-08-26T00:00:00.000Z', senderId: 'ou_sender',
      });
      const input = turn(attachment('one'));
      input.statusCardMessageId = 'om_status_card';
      await service.ingestTurn(input);
      expect(service.listOrphanStatusCards()).toEqual([]);
      expect(store.getStatusCard(jobKey('om_message', 'one'))).toBeUndefined();
    } finally { temp.cleanup(); }
  });

  it('replaces an existing processing card instead of posting a second reply', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    const messenger: Messenger = {
      sendCard: vi.fn(async () => ({ messageId: 'om_unexpected' })),
      updateCard: vi.fn(async () => undefined),
    };
    const input = turn(attachment('one'));
    input.statusCardMessageId = 'om_status_card';
    try {
      const service = new IntakeService({ config: testConfig(temp.path), platform, messenger, store: new MemoryJobStore() });
      await service.ingestTurn(input);

      expect(messenger.sendCard).not.toHaveBeenCalled();
      expect(messenger.updateCard).toHaveBeenCalledOnce();
      expect(messenger.updateCard).toHaveBeenCalledWith(expect.objectContaining({
        cardMessageId: 'om_status_card',
        card: expect.objectContaining({ schema: '2.0' }),
      }));
    } finally { temp.cleanup(); }
  });

  it('creates deep tasks and sends each Luna completion card without using the performance target as a deadline', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    const sent: SendCardInput[] = [];
    let now = 1_000;
    const messenger: Messenger = { sendCard: async (input) => { now += 100; sent.push(input); } };
    vi.mocked(platform.upload).mockImplementation(async (_turn, file) => {
      now += 200;
      return { conversation: conversation(`conversation-${file.fileKey}`, 'processing'), reusedDocument: false };
    });
    vi.mocked(platform.quickCard).mockImplementation(async () => { now += 300; return quickCard(); });
    try {
      const service = new IntakeService({
        config: testConfig(temp.path), platform, messenger, store: new MemoryJobStore(),
        nowMs: () => now, setTimer: () => undefined,
      });
      const outcomes = await service.ingestTurn(turn(attachment('one'), attachment('two', 'two.docx')));
      expect(platform.upload).toHaveBeenCalledTimes(2);
      expect(platform.quickCard).toHaveBeenCalledTimes(2);
      expect(vi.mocked(platform.upload).mock.calls[0]?.[2]).toBe(600_000);
      expect(vi.mocked(platform.quickCard).mock.calls[0]).toEqual(['conversation-one']);
      expect(outcomes).toMatchObject([
        { fileKey: 'one', status: 'completed' }, { fileKey: 'two', status: 'completed' },
      ]);
      expect(outcomes.map((item) => item.completionCardMs)).toEqual([600, 600]);
      expect(sent.map((item) => item.responseKind)).toEqual(['final', 'final']);
      expect(sent.map((item) => item.fileKey)).toEqual(['one', 'two']);
      expect(sent[0]?.timeoutMs).toBeUndefined();
      expect(JSON.stringify(sent[0]?.card)).toContain('深度分析继续运行');
    } finally { temp.cleanup(); }
  });

  it('binds a shared processing card to only one attachment in a multi-attachment turn', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    const messenger: Messenger = {
      sendCard: vi.fn(async () => ({ messageId: 'om_second_card' })),
      updateCard: vi.fn(async () => undefined),
    };
    const input = turn(attachment('one'), attachment('two'));
    input.statusCardMessageId = 'om_shared_status';
    try {
      const service = new IntakeService({
        config: testConfig(temp.path), platform, messenger, store: new MemoryJobStore(),
      });
      await service.ingestTurn(input);

      expect(messenger.updateCard).toHaveBeenCalledOnce();
      expect(messenger.updateCard).toHaveBeenCalledWith(expect.objectContaining({
        cardMessageId: 'om_shared_status',
      }));
      expect(messenger.sendCard).toHaveBeenCalledOnce();
      expect(messenger.sendCard).toHaveBeenCalledWith(expect.objectContaining({
        messageId: 'om_message',
        fileKey: 'two',
        responseKind: 'final',
      }));
    } finally { temp.cleanup(); }
  });

  it('delivers a completion card after an earlier failure UUID was deduplicated', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    vi.mocked(platform.upload)
      .mockRejectedValueOnce(new Error('temporary_upload_failure'))
      .mockResolvedValueOnce({
        conversation: conversation('conversation-one', 'processing'),
        reusedDocument: false,
      });
    const delivered = new Map<string, string>();
    const reply = vi.fn(async (input: {
      uuid: string;
      content: string;
    }) => {
      if (!delivered.has(input.uuid)) delivered.set(input.uuid, input.content);
      return { messageId: `om_card_${delivered.size}` };
    });
    const messenger = new FeishuCardMessenger({
      reply,
      update: vi.fn(async () => undefined),
    });
    try {
      const service = new IntakeService({
        config: testConfig(temp.path),
        platform,
        messenger,
        store: new MemoryJobStore(),
        setTimer: () => undefined,
      });

      await expect(service.ingestTurn(turn(attachment('one')))).resolves.toMatchObject([
        { status: 'failed' },
      ]);
      await expect(service.ingestTurn(turn(attachment('one')))).resolves.toMatchObject([
        { status: 'completed' },
      ]);

      expect(delivered.size).toBe(2);
      expect([...delivered.values()].some((content) => content.includes('材料处理失败'))).toBe(true);
      expect([...delivered.values()].some((content) => content.includes('BP 导入 · 事实核验'))).toBe(true);
    } finally { temp.cleanup(); }
  });

  it('releases the downloaded BP immediately after upload, before Luna runs', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    const order: string[] = [];
    vi.mocked(platform.upload).mockImplementation(async (_turn, file) => {
      order.push(`upload:${file.fileKey}`);
      return { conversation: conversation('conversation-one', 'processing'), reusedDocument: false };
    });
    vi.mocked(platform.quickCard).mockImplementation(async () => {
      order.push('luna');
      return quickCard();
    });
    try {
      const service = new IntakeService({
        config: testConfig(temp.path), platform,
        messenger: { sendCard: vi.fn(async () => undefined) },
        store: new MemoryJobStore(), setTimer: () => undefined,
        releaseAttachment: async () => { order.push('release'); },
      });
      await service.ingestTurn(turn(attachment('one')));
      expect(order).toEqual(['upload:one', 'release', 'luna']);
    } finally { temp.cleanup(); }
  });

  it('keeps a successful upload durable when local cleanup must be retried', async () => {
    const temp = tempDir();
    const store = new MemoryJobStore();
    const platform = platformFixture();
    const releaseAttachment = vi.fn(async () => { throw new Error('disk_busy'); });
    try {
      const service = new IntakeService({
        config: testConfig(temp.path), platform,
        messenger: { sendCard: vi.fn(async () => undefined) },
        store, setTimer: () => undefined, releaseAttachment,
      });
      await service.ingestTurn(turn(attachment('one')));
      expect(store.get(jobKey('om_message', 'one'))).toMatchObject({
        conversationId: 'conversation-one',
        completionCardSent: true,
        cleanupPending: true,
        cleanupError: 'disk_busy',
      });

      await service.ingestTurn(turn(attachment('one')));
      expect(platform.upload).toHaveBeenCalledTimes(1);
      expect(platform.quickCard).toHaveBeenCalledTimes(1);
      expect(releaseAttachment).toHaveBeenCalledTimes(2);
    } finally { temp.cleanup(); }
  });

  it('records BotMux attachment resolution time without turning it into a deadline', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    let now = 5_000;
    const input = turn(attachment('one'));
    input.receivedAt = new Date(0).toISOString();
    try {
      const service = new IntakeService({
        config: testConfig(temp.path), platform, messenger: { sendCard: async () => { now += 100; } },
        store: new MemoryJobStore(), nowMs: () => now, setTimer: () => undefined,
      });
      const outcomes = await service.ingestTurn(input);
      expect(vi.mocked(platform.upload).mock.calls[0]?.[2]).toBe(600_000);
      expect(vi.mocked(platform.quickCard).mock.calls[0]).toEqual(['conversation-one']);
      expect(outcomes[0]?.completionCardMs).toBe(5_100);
    } finally { temp.cleanup(); }
  });

  it('sends the completed Luna result when end-to-end latency exceeds 30 seconds', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    const sent: SendCardInput[] = [];
    let now = 1_000;
    vi.mocked(platform.quickCard).mockImplementation(async () => {
      now += 31_000;
      return quickCard();
    });
    try {
      const service = new IntakeService({
        config: testConfig(temp.path), platform, messenger: { sendCard: async (input) => { sent.push(input); } },
        store: new MemoryJobStore(), nowMs: () => now, setTimer: () => undefined,
      });
      const outcomes = await service.ingestTurn(turn(attachment('one')));
      expect(outcomes[0]).toMatchObject({ status: 'completed', completionCardMs: 31_000 });
      expect(JSON.stringify(sent[0]?.card)).toContain('BP 导入 · 事实核验');
      expect(JSON.stringify(sent[0]?.card)).not.toContain('快速提取失败');
    } finally { temp.cleanup(); }
  });

  it('uses product entity links when quick analysis finds existing company and industry records', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    vi.mocked(platform.quickCard).mockResolvedValue(quickCard({
      navigation: { companyId: 'company/one', industryId: 'industry/one' },
    }));
    const sent: SendCardInput[] = [];
    try {
      const service = new IntakeService({
        config: testConfig(temp.path), platform, messenger: { sendCard: async (input) => { sent.push(input); } },
        store: new MemoryJobStore(), setTimer: () => undefined,
      });
      await service.ingestTurn(turn(attachment('one')));
      const card = JSON.stringify(sent[0]?.card);
      expect(card).toContain('https://demo.example.com/companies/company%2Fone?tab=relations');
      expect(card).toContain('https://demo.example.com/industry/industry%2Fone?tab=chain');
      expect(card).not.toContain('/workbench/companies/');
    } finally { temp.cleanup(); }
  });

  it('does not upload, rerun Luna, or resend a card for an exact duplicate event', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    const messenger: Messenger = { sendCard: vi.fn(async () => undefined) };
    try {
      const service = new IntakeService({ config: testConfig(temp.path), platform, messenger, store: new MemoryJobStore(), setTimer: () => undefined });
      await service.ingestTurn(turn(attachment('one')));
      const duplicate = await service.ingestTurn(turn(attachment('one')));
      expect(platform.upload).toHaveBeenCalledTimes(1);
      expect(platform.quickCard).toHaveBeenCalledTimes(1);
      expect(messenger.sendCard).toHaveBeenCalledTimes(1);
      expect(duplicate[0]).toMatchObject({ status: 'completed', conversationId: 'conversation-one' });
    } finally { temp.cleanup(); }
  });

  it('coalesces concurrent deliveries of the same BotMux event', async () => {
    const temp = tempDir();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const platform = platformFixture();
    vi.mocked(platform.upload).mockImplementation(async () => {
      await gate;
      return { conversation: conversation('conversation-one', 'processing'), reusedDocument: false };
    });
    const messenger: Messenger = { sendCard: vi.fn(async () => undefined) };
    try {
      const service = new IntakeService({ config: testConfig(temp.path), platform, messenger, store: new MemoryJobStore(), setTimer: () => undefined });
      const first = service.ingestTurn(turn(attachment('one')));
      const second = service.ingestTurn(turn(attachment('one')));
      release();
      await Promise.all([first, second]);
      expect(platform.upload).toHaveBeenCalledTimes(1);
      expect(platform.quickCard).toHaveBeenCalledTimes(1);
      expect(messenger.sendCard).toHaveBeenCalledTimes(1);
    } finally { temp.cleanup(); }
  });

  it('returns a fallback completion card only when Luna fails while the deep task remains created', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    vi.mocked(platform.quickCard).mockRejectedValue(new Error('quick_card_failed'));
    const sent: SendCardInput[] = [];
    const messenger: Messenger = { sendCard: async (input) => { sent.push(input); } };
    try {
      const service = new IntakeService({ config: testConfig(temp.path), platform, messenger, store: new MemoryJobStore(), setTimer: () => undefined });
      await expect(service.ingestTurn(turn(attachment('one')))).resolves.toMatchObject([{ status: 'completed' }]);
      expect(platform.upload).toHaveBeenCalledTimes(1);
      expect(sent).toHaveLength(1);
      expect(JSON.stringify(sent[0]?.card)).toContain('快速提取失败');
      expect(JSON.stringify(sent[0]?.card)).toContain('深度分析任务已创建并继续运行');
    } finally { temp.cleanup(); }
  });

  it('accounts for upload failure and attempts a simple failure card', async () => {
    const temp = tempDir();
    const platform = platformFixture();
    vi.mocked(platform.upload).mockRejectedValue(new Error('platform_http_503'));
    const messenger: Messenger = { sendCard: vi.fn(async () => undefined) };
    try {
      const service = new IntakeService({ config: testConfig(temp.path), platform, messenger, store: new MemoryJobStore() });
      await expect(service.ingestTurn(turn(attachment('one')))).resolves.toEqual([
        { fileKey: 'one', fileName: 'one.pdf', status: 'failed', error: 'platform_http_503' },
      ]);
      expect(platform.quickCard).not.toHaveBeenCalled();
      expect(messenger.sendCard).toHaveBeenCalledWith(expect.objectContaining({ responseKind: 'final' }));
    } finally { temp.cleanup(); }
  });

  it('persists the quick result and retries card delivery without uploading or rerunning Luna', async () => {
    const temp = tempDir();
    const store = new MemoryJobStore();
    const platform = platformFixture();
    const sendCard = vi.fn().mockRejectedValueOnce(new Error('botmux_send_card_failed')).mockResolvedValue(undefined);
    try {
      const service = new IntakeService({
        config: testConfig(temp.path), platform, messenger: { sendCard }, store, setTimer: () => undefined,
      });
      expect((await service.ingestTurn(turn(attachment('one'))))[0]).toMatchObject({ status: 'failed' });
      expect(store.get(jobKey('om_message', 'one'))).toMatchObject({ completionCardSent: false, quickCard: { modelId: 'gpt-5.6-luna' } });
      expect((await service.ingestTurn(turn(attachment('one'))))[0]).toMatchObject({ status: 'completed' });
      expect(platform.upload).toHaveBeenCalledTimes(1);
      expect(platform.quickCard).toHaveBeenCalledTimes(1);
      expect(sendCard).toHaveBeenCalledTimes(2);
      expect(store.get(jobKey('om_message', 'one'))?.completionCardSent).toBe(true);
    } finally { temp.cleanup(); }
  });
});
