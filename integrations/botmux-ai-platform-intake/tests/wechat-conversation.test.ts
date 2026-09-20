import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWechatConversationRuntime } from '../src/wechat-conversation-runtime.js';
import { WechatConversationIngress, wechatConversationMessage } from '../src/wechat-conversation.js';
import { WechatConversationDelivery } from '../src/wechat-conversation-delivery.js';
import type { ConversationAgent } from '../src/conversation-agent.js';
import type { ConversationPlatform } from '../src/conversation-workflows.js';
import { companyQuickCard, conversation, quickCard, tempDir, testConfig } from './helpers.js';
import type { WechatKfClient } from '../src/wechat-kf-client.js';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
const inbound = (text = '你好', id = 'm1', user = 'user-a', account = 'kf-a') => ({
  messageId: id, externalUserId: user, openKfid: account,
  receivedAt: '2026-09-21T01:00:00.000Z', text,
});
function fixture() {
  const temp = tempDir(); cleanups.push(temp.cleanup);
  const config = { ...testConfig(temp.path), cursorStatePath: `${temp.path}/cursor.json` };
  const respond = vi.fn<ConversationAgent['respond']>().mockImplementation(async (input) => {
    if (!input.session?.id) input.session?.onCreated(`session-${input.text}`);
    return { kind: 'reply', text: '你好，可以正常交流。' };
  });
  const platform: ConversationPlatform = {
    upload: vi.fn(async (_turn, file) => ({ conversation: conversation(`bp-${file.fileKey}`), reusedDocument: false })),
    quickCard: vi.fn(async () => quickCard()),
    startCompanyResearch: vi.fn(async (input) => ({ conversation: conversation(input.companyName), reusedResearch: false })),
    companyQuickCard: vi.fn(async (id) => companyQuickCard({ companyName: id, companyIdentity: id })),
    documentContext: vi.fn(async () => ({ fileName: '国碳BP.pdf', text: '第21页：融资5000万元，产线60%、厂房20%、运营20%。', truncated: false })),
  };
  const client = { sendText: vi.fn<WechatKfClient['sendText']>().mockResolvedValue(undefined),
    downloadMedia: vi.fn(async () => ({ buffer: Buffer.from('%PDF-1.7 test'), filename: '国碳BP.pdf' })) };
  mkdirSync(dirname(config.statePath), { recursive: true });
  const options = { config, agent: { respond }, platform, client, onError: vi.fn() };
  return { ...options, options, respond, runtime: createWechatConversationRuntime(options) };
}

describe('shared production WeChat conversation composition', () => {
  it('answers unrestricted text and reuses a durable session, isolated by customer and service account', async () => {
    const f = fixture();
    await f.runtime.conversation.handle(inbound()); await f.runtime.conversation.waitForIdle();
    let runtime = createWechatConversationRuntime(f.options);
    await runtime.conversation.handle(inbound('你记得我说什么吗', 'm2')); await runtime.conversation.waitForIdle();
    expect(f.respond.mock.calls[1]?.[0]).toMatchObject({ session: { id: 'session-你好' }, history: [
      { role: 'user', content: '你好' }, { role: 'assistant', content: '你好，可以正常交流。' },
    ] });
    await runtime.conversation.handle(inbound('另一客户', 'm1', 'user-b')); await runtime.conversation.waitForIdle();
    await runtime.conversation.handle(inbound('另一客服', 'm1', 'user-a', 'kf-b')); await runtime.conversation.waitForIdle();
    for (const [input] of f.respond.mock.calls.slice(2)) {
      expect(input.history).toEqual([]); expect(input.session?.id).toBeUndefined();
    }
    await runtime.conversation.handle(inbound()); await runtime.conversation.waitForIdle();
    expect(f.client.sendText).toHaveBeenCalledTimes(4);
    expect(f.platform.startCompanyResearch).not.toHaveBeenCalled();
  });

  it('routes natural multi-company intent with focus and one ack, and replays without new model calls', async () => {
    const f = fixture();
    f.respond.mockResolvedValue({ kind: 'research', companies: ['宁德时代', 'Tesla'], focus: '主营业务与风险' });
    const input = inbound('我想了解宁德时代和Tesla，帮我看看主营业务和风险。');
    await f.runtime.conversation.handle(input); await f.runtime.conversation.waitForIdle();
    expect(f.respond.mock.calls[0]?.[0].text).toBe(input.text);
    const turns = vi.mocked(f.platform.startCompanyResearch).mock.calls.map(([turn]) => turn);
    expect(turns.map((turn) => turn.companyName)).toEqual(['宁德时代', 'Tesla']);
    expect(new Set(turns.map((turn) => turn.researchKey)).size).toBe(2);
    turns.forEach((turn) => expect(turn.researchFocus).toBe('主营业务与风险'));
    const texts = f.client.sendText.mock.calls.map(([message]) => message.content);
    expect(texts.filter((text) => text.includes('已收到'))).toHaveLength(1);
    expect(texts.join('\n')).toContain('宁德时代'); expect(texts.join('\n')).toContain('Tesla');
    expect(texts.join('\n')).not.toMatch(/\/workbench\/|完整分析见工作台|后台深度/u);
    expect(texts.length).toBeLessThanOrEqual(4);
    texts.forEach((text) => expect(Buffer.byteLength(text)).toBeLessThanOrEqual(2048));
    const count = f.client.sendText.mock.calls.length;
    const restarted = createWechatConversationRuntime(f.options);
    await restarted.conversation.handle(input); await restarted.conversation.waitForIdle();
    expect(f.respond).toHaveBeenCalledOnce(); expect(f.client.sendText).toHaveBeenCalledTimes(count);
  });

  it('durably accepts BP and queued follow-up before analysis completes, and retains material after restart', async () => {
    const f = fixture(); let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(f.platform.quickCard).mockImplementationOnce(async () => { await gate; return quickCard(); });
    const { text: _, ...base } = inbound('', 'pdf');
    await f.runtime.conversation.handle({ ...base, mediaId: 'media-pdf' });
    await f.runtime.conversation.handle(inbound('刚才这份BP融资多少钱？', 'followup'));
    await vi.waitFor(() => expect(f.platform.quickCard).toHaveBeenCalledOnce());
    const state = JSON.parse(readFileSync(`${f.config.statePath}.conversations.json`, 'utf8'));
    expect(Object.keys(state.turns)).toHaveLength(2); expect(f.respond).not.toHaveBeenCalled();
    // Another customer is not blocked by this material analysis.
    await f.runtime.conversation.handle(inbound('你好', 'other', 'user-b'));
    await vi.waitFor(() => expect(f.respond).toHaveBeenCalledOnce());
    release(); await f.runtime.conversation.waitForIdle();
    expect(JSON.stringify(f.respond.mock.calls[1]?.[0].materials)).toContain('融资5000万元');
    expect(f.platform.documentContext).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ senderId: 'user-a' }));
    const restarted = createWechatConversationRuntime(f.options);
    await restarted.conversation.handle(inbound('产线会用多少钱？', 'after-restart'));
    await restarted.conversation.waitForIdle();
    expect(JSON.stringify(f.respond.mock.calls[2]?.[0].materials)).toContain('产线60%');
    await restarted.conversation.handle({ ...base, mediaId: 'media-pdf' }); await restarted.conversation.waitForIdle();
    expect(f.platform.upload).toHaveBeenCalledOnce(); expect(f.client.downloadMedia).toHaveBeenCalledOnce();
    expect(f.options.onError).not.toHaveBeenCalled();
  });

  it('resumes a persisted but unfinished WeChat inbox in arrival order', async () => {
    const f = fixture(); const file = wechatConversationMessage({ ...inbound('', 'file'), mediaId: 'pdf' });
    const later = { ...wechatConversationMessage(inbound('融资呢', 'later')), receivedAt: '2026-09-21T01:00:01.000Z' };
    const path = `${f.config.statePath}.conversations.json`;
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, turns: {
      [later.messageId]: { message: later, research: {}, status: 'pending' },
      [file.messageId]: { message: file, file: { ...file, fileKey: 'pdf', fileName: 'BP.pdf' }, research: {}, status: 'pending' },
    } }));
    const calls: string[] = [];
    const ingress = new WechatConversationIngress({ statePath: path, agent: { respond: async ({ materials }) => {
      expect(materials?.[0]?.content).toBe('融资5000万元'); calls.push('text'); return { kind: 'reply', text: '5000万元' };
    } }, file: async () => { calls.push('file'); return '融资5000万元'; }, research: async () => '', reply: async () => undefined });
    ingress.resumePending(); await ingress.waitForIdle(); expect(calls).toEqual(['file', 'text']);
  });

  it('does not acknowledge durable receipt when the state cannot be written', async () => {
    const f = fixture(); const path = `${f.config.statePath}/not-a-directory`;
    writeFileSync(f.config.statePath, 'blocked');
    const ingress = new WechatConversationIngress({ statePath: path, agent: f.options.agent,
      reply: async () => undefined, research: async () => '' });
    await expect(ingress.handle(inbound())).rejects.toThrow();
    await expect(ingress.handle(inbound())).rejects.toThrow(); expect(f.respond).not.toHaveBeenCalled();
  });
});

describe('WeChat durable outgoing delivery', () => {
  it('resumes a partially sent multi-page reply with the same Tencent message ID and no duplicate ack/page', async () => {
    const f = fixture(); const message = wechatConversationMessage(inbound());
    const path = `${f.config.statePath}.outbox-test.json`;
    const delivery = new WechatConversationDelivery({ statePath: path, client: f.client });
    f.client.sendText.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('response_lost'));
    await expect(delivery.reply(message, '消息😀'.repeat(1000))).rejects.toThrow('response_lost');
    const attempted = f.client.sendText.mock.calls[1]?.[0];
    const restarted = new WechatConversationDelivery({ statePath: path, client: f.client });
    await restarted.reply(message, '消息😀'.repeat(1000));
    expect(f.client.sendText.mock.calls[2]?.[0]).toEqual(attempted);
    const delivered = [f.client.sendText.mock.calls[0]![0], ...f.client.sendText.mock.calls.slice(2).map(([text]) => text)];
    expect(delivered).toHaveLength(3); expect(new Set(delivered.map((text) => text.msgid)).size).toBe(3);
    delivered.forEach((text) => expect(Buffer.byteLength(text.content)).toBeLessThanOrEqual(2048));
    expect(delivered.map((text) => text.content).join('')).toContain('部分内容未展示');
  });
});
