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
function imageEvent(imageKey = 'img_v2_123', id = 'om_img', sender = 'ou_user') {
  return {
    sender: { sender_type: 'user', sender_id: { open_id: sender } },
    message: {
      message_id: id,
      chat_id: 'oc_test',
      chat_type: 'p2p',
      message_type: 'image',
      content: JSON.stringify({ image_key: imageKey }),
      create_time: String(Date.now()),
    },
  };
}
function setup(agent: ConversationAgent, statePath?: string) {
  if (!statePath) {
    const path = mkdtempSync(join(tmpdir(), 'boyuan-dialogue-')); paths.push(path); statePath = join(path, 'state.json');
  }
  const reply = vi.fn(async () => undefined);
  const research = vi.fn(async ({ companyName }: { companyName: string }) => `${companyName}研究结果`);
  const options = { botOpenId: 'ou_bot', statePath, agent, reply, research, onError: vi.fn(), setTimer: vi.fn((callback: () => void) => queueMicrotask(callback)) };
  return { ingress: new FeishuConversationIngress(options), options, reply, research };
}

describe('natural Feishu conversations', () => {
  it('queues a BP and its immediate follow-up together and persists the material context', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'reply', text: '5000万元' });
    const { options, reply } = setup({ respond });
    const file = vi.fn(async () => { await gate; return 'BP第21页：计划融资5000万元；产线60%、厂房20%、运营20%。'; });
    const ingress = new FeishuConversationIngress({ ...options, file });
    const upload = event('', 'om_pdf'); upload.message.message_type = 'file';
    upload.message.content = JSON.stringify({ file_key: 'file_pdf', file_name: '国碳BP.pdf' });
    const pending = ingress.handle(upload);
    const followup = ingress.handle(event('刚才这份BP融资多少钱？', 'om_followup'));
    await vi.waitFor(() => expect(file).toHaveBeenCalledOnce());
    expect(respond).not.toHaveBeenCalled();
    release(); await Promise.all([pending, followup]);
    expect(JSON.stringify(respond.mock.calls[0]?.[0])).toContain('5000万元');
    expect(reply).toHaveBeenCalledOnce();
    const restarted = new FeishuConversationIngress({ ...options, file });
    await restarted.handle(upload); // Event replay must not upload or send a second card.
    expect(file).toHaveBeenCalledOnce();
    await restarted.handle(event('资金如何分配？', 'om_after_restart'));
    expect(JSON.stringify(respond.mock.calls.at(-1)?.[0])).toContain('产线60%');
  });

  it('persists one model session per private chat, isolated from other users', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockImplementation(async (input) => {
      if (!input.session?.id) input.session?.onCreated('ses_one');
      return { kind: 'reply', text: '收到' };
    });
    const { ingress, options } = setup({ respond });
    await ingress.handle(event());
    await new FeishuConversationIngress(options).handle(event('继续', 'om_2'));
    expect(respond.mock.calls[1]?.[0].session?.id).toBe('ses_one');
    await ingress.handle(event('别人', 'om_3', 'ou_other'));
    expect(respond.mock.calls[2]?.[0].session?.id).toBeUndefined();
  });

  it('restores existing uploaded material once and retains it beyond six text turns', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'reply', text: '收到' });
    const { options } = setup({ respond });
    const restoreFiles = vi.fn(async () => [{ file: { chatId: 'oc_test', senderId: 'ou_user',
      messageId: 'om_previous_pdf', fileKey: 'file', fileName: 'BP.pdf', receivedAt: '2026-01-01T00:00:00Z' }, content: '原文融资5000万元' }]);
    const ingress = new FeishuConversationIngress({ ...options, restoreFiles });
    for (let i = 0; i < 8; i++) await ingress.handle(event('融资用途呢', `om_${i}`));
    expect(restoreFiles).toHaveBeenCalledOnce();
    expect(respond.mock.calls.at(-1)?.[0].materials).toEqual([{ fileName: 'BP.pdf', content: '原文融资5000万元' }]);
    await new FeishuConversationIngress({ ...options, restoreFiles }).handle(event('继续', 'om_restarted'));
    expect(restoreFiles).toHaveBeenCalledOnce();
    expect(respond.mock.calls.at(-1)?.[0].materials?.[0]?.content).toContain('5000万元');
  });
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
    await ingress.handle(event());
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
    await ingress.handle(event('宁德时代'));
    await new FeishuConversationIngress(options).handle(event('宁德时代'));
    expect(research).toHaveBeenCalledTimes(2);
    expect(respond).toHaveBeenCalledOnce();
    expect(options.setTimer).toHaveBeenCalled();
  });

  it('keeps original history order across delivery retry and restart', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'reply', text: '收到' });
    const { ingress, options, reply } = setup({ respond });
    const first = event('关心腾讯', 'om_old'); first.message.create_time = String(Date.now() - 3000);
    const second = event('改看比亚迪', 'om_new'); second.message.create_time = String(Date.now() - 2000);
    reply.mockRejectedValueOnce(new Error('network_failure'));
    await ingress.handle(first);
    await ingress.handle(second);
    const restarted = new FeishuConversationIngress(options);
    await restarted.handle(first);
    await restarted.handle(event('它的融资呢', 'om_followup'));
    const history = respond.mock.calls.at(-1)?.[0].history;
    expect(history?.filter((entry) => entry.role === 'user').map((entry) => entry.content)).toEqual(['关心腾讯', '改看比亚迪']);
  });

  it('holds later messages behind a retry, while another private chat proceeds', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'reply', text: '收到' });
    const { options, reply } = setup({ respond });
    let retry!: () => void;
    const timer = vi.fn((cb: () => void) => { retry = cb; });
    const ingress = new FeishuConversationIngress({ ...options, setTimer: timer });
    reply.mockRejectedValueOnce(new Error('network_failure'));
    const first = ingress.handle(event('first'));
    const second = ingress.handle(event('second', 'om_2'));
    await vi.waitFor(() => expect(timer).toHaveBeenCalledOnce());
    expect(respond).toHaveBeenCalledOnce();
    await ingress.handle(event('other', 'om_3', 'ou_other'));
    expect(respond.mock.calls.map(([input]) => input.text)).toEqual(['first', 'other']);
    retry(); await Promise.all([first, second]);
    expect(respond.mock.calls.at(-1)?.[0].text).toBe('second');
    expect(respond.mock.calls.at(-1)?.[0].history).toEqual([
      { role: 'user', content: 'first' }, { role: 'assistant', content: '收到' },
    ]);
  });

  it('persists queued files and text before work and drains them in order after restart', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'reply', text: '5000万元' });
    const { options } = setup({ respond });
    const a = parseFeishuTextMessage(event('后问', 'om_later'))!;
    const b = { ...a, messageId: 'om_file', text: '[上传文件] BP.pdf', receivedAt: new Date(Date.parse(a.receivedAt) - 1000).toISOString() };
    writeFileSync(options.statePath, JSON.stringify({ schemaVersion: 1, sessions: { 'oc_test:ou_user': 'ses_saved' }, turns: {
      om_later: { message: a, status: 'pending', research: {} },
      om_file: { message: b, file: { ...b, fileKey: 'file', fileName: 'BP.pdf' }, status: 'pending', research: {} },
    } }));
    const file = vi.fn(async () => '计划融资5000万元');
    new FeishuConversationIngress({ ...options, file }).resumePending();
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(respond.mock.calls[0]?.[0].session?.id).toBe('ses_saved');
    expect(JSON.stringify(respond.mock.calls[0]?.[0].materials)).toContain('5000万元');
  });

  it('does not expose a previous BP to another user in the same chat', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'reply', text: '你好' });
    const { options } = setup({ respond });
    const ingress = new FeishuConversationIngress({ ...options, file: async () => 'secret BP 5000万' });
    const upload = event('', 'om_pdf'); upload.message.message_type = 'file';
    upload.message.content = JSON.stringify({ file_key: 'file_pdf', file_name: 'BP.pdf' });
    await ingress.handle(upload);
    await ingress.handle(event('给我看刚才的BP', 'om_other', 'ou_other'));
    expect(respond.mock.calls[0]?.[0].materials).toEqual([]);
  });

  it('terminates a repeatedly failing file without starving later messages', async () => {
    const respond = vi.fn<ConversationAgent['respond']>().mockResolvedValue({ kind: 'reply', text: '下一条' });
    const { options } = setup({ respond });
    const file = vi.fn(async () => { throw new Error('file_failure'); });
    const ingress = new FeishuConversationIngress({ ...options, file });
    const upload = event('', 'om_pdf'); upload.message.message_type = 'file';
    upload.message.content = JSON.stringify({ file_key: 'file_pdf', file_name: 'BP.pdf' });
    const failed = expect(ingress.handle(upload)).rejects.toThrow('file_failure');
    await ingress.handle(event('继续聊天', 'om_next'));
    await failed;
    expect(file).toHaveBeenCalledTimes(3);
    expect(respond).toHaveBeenCalledOnce();
    expect(respond.mock.calls[0]?.[0].materials).toEqual([]);
  });

  it('downloads Feishu images and extracts company names for batch research', async () => {
    const respond = vi.fn<ConversationAgent['respond']>();
    const { options, research } = setup({ respond });
    const downloadImage = vi.fn(async () => Buffer.from('fake-image-bytes'));
    const extractor = {
      extract: vi.fn(async () => ({
        companies: ['腾讯科技', '阿里巴巴'],
        uncertain: [],
      })),
    };
    const ingress = new FeishuConversationIngress({
      ...options,
      downloadImage,
      extractor,
    });

    const result = await ingress.handle(imageEvent('img_key_1', 'om_img_1'));
    expect(result).toEqual({ handled: true });
    expect(downloadImage).toHaveBeenCalledWith('om_img_1', 'img_key_1');
    expect(extractor.extract).toHaveBeenCalledWith({ image: Buffer.from('fake-image-bytes') });
    await ingress.waitForIdle();
    expect(research).toHaveBeenCalledTimes(2);
    expect(research).toHaveBeenCalledWith(expect.objectContaining({ companyName: '腾讯科技' }));
    expect(research).toHaveBeenCalledWith(expect.objectContaining({ companyName: '阿里巴巴' }));
    expect(respond).not.toHaveBeenCalled();
  });

  it('replies with guidance when Feishu image contains no company names', async () => {
    const respond = vi.fn<ConversationAgent['respond']>();
    const { options, reply, research } = setup({ respond });
    const downloadImage = vi.fn(async () => Buffer.from('fake-image-bytes'));
    const extractor = {
      extract: vi.fn(async () => ({
        companies: [],
        uncertain: [],
      })),
    };
    const ingress = new FeishuConversationIngress({
      ...options,
      downloadImage,
      extractor,
    });

    await ingress.handle(imageEvent('img_key_empty', 'om_img_empty'));
    await ingress.waitForIdle();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('未能从图片中清晰识别出公司名称'),
      expect.any(String),
    );
    expect(research).not.toHaveBeenCalled();
  });

  it('replies with guidance when Feishu image contains more than 20 companies', async () => {
    const respond = vi.fn<ConversationAgent['respond']>();
    const { options, reply, research } = setup({ respond });
    const downloadImage = vi.fn(async () => Buffer.from('fake-image-bytes'));
    const companies = Array.from({ length: 25 }, (_, i) => `公司${i + 1}`);
    const extractor = {
      extract: vi.fn(async () => ({
        companies,
        uncertain: [],
      })),
    };
    const ingress = new FeishuConversationIngress({
      ...options,
      downloadImage,
      extractor,
    });

    await ingress.handle(imageEvent('img_key_large', 'om_img_large'));
    await ingress.waitForIdle();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('超过 20 家公司'),
      expect.any(String),
    );
    expect(research).not.toHaveBeenCalled();
  });
});
