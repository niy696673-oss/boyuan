import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeishuConversationIngress, companyResearchKey } from '../src/feishu-conversation.js';
import { parseFeishuTextMessage } from '../src/direct-feishu-intake.js';
import type { ConversationAgent } from '../src/conversation-agent.js';

const paths: string[] = [];
afterEach(() => paths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
function event(text = '你好', id = 'om_1', sender = 'ou_user') {
  return { sender: { sender_type: 'user', sender_id: { open_id: sender } }, message: {
    message_id: id, chat_id: 'oc_test', chat_type: 'p2p', message_type: 'text',
    content: JSON.stringify({ text }), create_time: String(Date.now()),
  } };
}
function setup(agent: ConversationAgent, statePath?: string) {
  if (!statePath) {
    const path = mkdtempSync(join(tmpdir(), 'boyuan-dialogue-')); paths.push(path); statePath = join(path, 'state.json');
  }
  const reply = vi.fn(async () => undefined);
  const research = vi.fn(async ({ companyName }: { companyName: string }) => `${companyName}研究结果`);
  const options = { botOpenId: 'ou_bot', statePath, agent, reply, research, onError: vi.fn(), setTimer: vi.fn() };
  return { ingress: new FeishuConversationIngress(options), options, reply, research };
}

describe('natural Feishu conversations', () => {
  it('answers ordinary chat, and remembers it for the next turn', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'reply', text: '你好，有什么可以帮你？' });
    const { ingress, reply, research } = setup({ respond });
    await ingress.handle(event());
    await ingress.handle(event('刚才我说了什么？', 'om_2'));
    expect(reply).toHaveBeenCalledTimes(2);
    expect(research).not.toHaveBeenCalled();
    expect(respond.mock.calls[1]?.[0].history).toEqual([
      { role: 'user', content: '你好' }, { role: 'assistant', content: '你好，有什么可以帮你？' },
    ]);
  });

  it('passes a bare name and multiline request to semantic routing unchanged', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'research', companies: ['宁德时代'], focus: '融资' });
    const { ingress, research, reply } = setup({ respond });
    await ingress.handle(event('宁德时代'));
    await ingress.handle(event('麻烦看看\n宁德时代最近的融资情况', 'om_2'));
    expect(respond.mock.calls.map(([input]) => input.text)).toEqual(['宁德时代', '麻烦看看\n宁德时代最近的融资情况']);
    expect(research).toHaveBeenLastCalledWith(expect.objectContaining({ companyName: '宁德时代', researchFocus: '融资', messageId: 'om_2' }));
    expect(reply).not.toHaveBeenCalled();
  });

  it('gives each company a stable independent key while preserving the real reply message id', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'research', companies: ['宁德时代', '比亚迪'], focus: '' });
    const { ingress, options, research } = setup({ respond });
    await Promise.all([ingress.handle(event('看看这两家')), ingress.handle(event('看看这两家'))]);
    const keys = research.mock.calls.map(([input]) => (input as { researchKey?: string }).researchKey);
    expect(new Set(keys).size).toBe(2);
    expect(research).toHaveBeenCalledTimes(2);
    for (const [input] of research.mock.calls) expect(input).toMatchObject({ messageId: 'om_1' });
    await new FeishuConversationIngress(options).handle(event('看看这两家'));
    expect(respond).toHaveBeenCalledOnce();
    expect(research).toHaveBeenCalledTimes(2);
  });

  it('does not share history between senders or chats', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'reply', text: '收到' });
    const { ingress } = setup({ respond });
    await ingress.handle(event('私有上下文'));
    await ingress.handle(event('你知道我吗', 'om_2', 'ou_other'));
    const otherChat = event('你知道我吗', 'om_3'); otherChat.message.chat_id = 'oc_other';
    await ingress.handle(otherChat);
    expect(respond.mock.calls[1]?.[0].history).toEqual([]);
    expect(respond.mock.calls[2]?.[0].history).toEqual([]);
  });

  it('serializes one user for context but processes different users concurrently', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const respond = vi.fn<ConversationAgent['respond']>().mockImplementation(async ({ text }) => {
      if (text === 'first') await gate;
      return { kind: 'reply', text: '收到' };
    });
    const { ingress, reply } = setup({ respond });
    const first = ingress.handle(event('first'));
    const second = ingress.handle(event('second', 'om_2'));
    await ingress.handle(event('other', 'om_3', 'ou_other'));
    expect(reply).toHaveBeenCalledOnce();
    expect(respond.mock.calls.map(([input]) => input.text)).toEqual(['first', 'other']);
    release(); await Promise.all([first, second]);
    expect(respond.mock.calls.at(-1)?.[0].history).toHaveLength(2);
  });

  it('does not call the model on bot events or group messages addressed to someone else', async () => {
    const respond = vi.fn<ConversationAgent['respond']>();
    const { ingress } = setup({ respond });
    const bot = event(); bot.sender.sender_type = 'app';
    const group = event(); group.message.chat_type = 'group';
    await expect(ingress.handle(bot)).resolves.toEqual({ handled: false });
    await expect(ingress.handle(group)).resolves.toEqual({ handled: false });
    expect(respond).not.toHaveBeenCalled();
  });

  it('accepts Feishu rich text without flattening away meaningful line breaks', () => {
    const rich = event(); rich.message.message_type = 'post';
    rich.message.content = JSON.stringify({ title: '请帮我看看', content: [[{ tag: 'text', text: '宁德时代' }], [{ tag: 'text', text: '最近怎么样？' }]] });
    expect(parseFeishuTextMessage(rich)?.text).toBe('请帮我看看\n宁德时代\n最近怎么样？');
  });

  it('returns an honest failure message when intent/model response fails', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockRejectedValue(new Error('model_bad_json'));
    const { ingress, reply, research } = setup({ respond });
    await ingress.handle(event());
    expect(reply).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('暂时失败'), expect.any(String));
    expect(research).not.toHaveBeenCalled();
    await ingress.handle(event());
    expect(reply).toHaveBeenCalledOnce();
  });

  it('retries a persisted text reply after delivery failure without changing its content', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'reply', text: '原始回答' });
    const { ingress, options, reply } = setup({ respond });
    reply.mockRejectedValueOnce(new Error('network_failure'));
    await expect(ingress.handle(event())).rejects.toThrow('network_failure');
    await new FeishuConversationIngress(options).handle(event());
    expect(respond).toHaveBeenCalledOnce();
    expect(reply.mock.calls[0]).toEqual(reply.mock.calls[1]);
  });

  it('resumes only unfinished members of a persisted company request', async () => {
    const respond = vi.fn<ConversationAgent['respond']>();
    const { options, research } = setup({ respond });
    writeFileSync(options.statePath, JSON.stringify({ schemaVersion: 1, histories: {}, turns: { om_1: {
      message: parseFeishuTextMessage(event('看看宁德时代和比亚迪')),
      status: 'pending', decision: { kind: 'research', companies: ['宁德时代', '比亚迪'], focus: '' },
      research: { [companyResearchKey('宁德时代')]: '已生成宁德时代卡片' },
    } } }));
    const restarted = new FeishuConversationIngress(options);
    restarted.resumePending();
    await vi.waitFor(() => expect(research).toHaveBeenCalledOnce());
    expect(research).toHaveBeenCalledWith(expect.objectContaining({ companyName: '比亚迪' }));
    expect(respond).not.toHaveBeenCalled();
  });

  it('keeps failed research retryable even when no loading receipt could be created', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'research', companies: ['宁德时代'], focus: '' });
    const { ingress, options, research } = setup({ respond });
    research.mockRejectedValueOnce(new Error('loading_delivery_failed'));
    await expect(ingress.handle(event('宁德时代'))).rejects.toThrow('company_research_retry_pending');
    await new FeishuConversationIngress(options).handle(event('宁德时代'));
    expect(research).toHaveBeenCalledTimes(2);
    expect(respond).toHaveBeenCalledOnce();
    expect(options.setTimer).toHaveBeenCalled();
  });

  it('keeps original history order when an older reply is retried after a newer turn', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'reply', text: '收到' });
    const { ingress, options, reply } = setup({ respond });
    const first = event('关心腾讯', 'om_old'); first.message.create_time = String(Date.now() - 3000);
    const second = event('改看比亚迪', 'om_new'); second.message.create_time = String(Date.now() - 2000);
    reply.mockRejectedValueOnce(new Error('network_failure'));
    await expect(ingress.handle(first)).rejects.toThrow('network_failure');
    await ingress.handle(second);
    const restarted = new FeishuConversationIngress(options);
    await restarted.handle(first);
    await restarted.handle(event('它的融资呢', 'om_followup'));
    const history = respond.mock.calls.at(-1)?.[0].history;
    expect(history?.filter((entry) => entry.role === 'user').map((entry) => entry.content)).toEqual(['关心腾讯', '改看比亚迪']);
  });
});
