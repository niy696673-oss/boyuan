// @vitest-environment node

import { inspect } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConversationAgentError,
  createConversationAgent,
  createRuntimeConversationAgent,
  type ConversationAgentOptions,
  type ConversationHistoryEntry,
} from '../src/conversation-agent.js';

const OPTIONS: ConversationAgentOptions = {
  baseUrl: new URL('http://127.0.0.1:4096/opencode-api/'),
  directory: '/workspace/博源',
  model: { providerId: 'test-provider', modelId: 'test-model' },
  variant: 'low',
};
const RESEARCH = { kind: 'research', companies: ['腾讯', 'Tesla'], focus: '竞争优势' };
const REPLY = { kind: 'reply', text: '你好！有什么想聊的？' };

function transport(raw = JSON.stringify(REPLY)) {
  let nextSession = 0;
  return vi.fn<typeof fetch>(async (request) => {
    const path = new URL(String(request)).pathname;
    if (path.endsWith('/session')) return Response.json({ id: `session-${++nextSession}` });
    if (path.endsWith('/abort')) return Response.json(true);
    if (path.endsWith('/message')) return Response.json({
      info: { providerID: 'test-provider', modelID: 'test-model' },
      parts: [{ type: 'text', text: raw }],
    });
    throw new Error('Unexpected endpoint');
  });
}

function agentWith(raw = JSON.stringify(REPLY), overrides: Partial<ConversationAgentOptions> = {}) {
  const fetcher = transport(raw);
  return { fetcher, agent: createConversationAgent({ ...OPTIONS, fetcher, ...overrides }) };
}

function messageBody(fetcher: ReturnType<typeof transport>, call = 1) {
  return JSON.parse(String(fetcher.mock.calls[call]?.[1]?.body)) as {
    model: { providerID: string; modelID: string };
    variant: string;
    tools: Record<string, boolean>;
    system: string;
    parts: Array<{ type: string; text: string }>;
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('conversation agent request contract', () => {
  it('reuses a supplied session and checkpoints a new one before sending the prompt', async () => {
    const { agent, fetcher } = agentWith();
    let saved: string | undefined;
    const onCreated = vi.fn((id: string) => { saved = id; });
    await agent.respond({ text: '你好', session: { onCreated } });
    expect(saved).toBe('session-1');
    await agent.respond({ text: '接着聊', session: { id: saved!, onCreated } });
    expect(fetcher.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith('/session'))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith('/session/session-1/message'))).toHaveLength(2);
  });
  it('uses the shared client, explicit model/low variant, JSON schema and no tools', async () => {
    const { agent, fetcher } = agentWith(JSON.stringify(RESEARCH), {
      credentials: { username: 'test-user', password: 'test-secret' },
    });
    const text = '帮我了解一下腾讯和 Tesla\n重点看看竞争优势';
    await expect(agent.respond({ text, history: [] })).resolves.toEqual(RESEARCH);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const urls = fetcher.mock.calls.map(([request]) => new URL(String(request)));
    expect(urls.map((url) => url.pathname)).toEqual([
      '/opencode-api/session', '/opencode-api/session/session-1/message',
    ]);
    expect(urls.every((url) => url.searchParams.get('directory') === OPTIONS.directory)).toBe(true);
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init?.headers).get('authorization')).toBe(
        `Basic ${Buffer.from('test-user:test-secret').toString('base64')}`,
      );
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    const body = messageBody(fetcher);
    expect(body.model).toEqual({ providerID: 'test-provider', modelID: 'test-model' });
    expect(body.variant).toBe('low');
    expect(body.tools).toEqual({ '*': false });
    expect(body.parts).toHaveLength(2);
    expect(JSON.parse(body.parts[0]!.text)).toEqual({ text, history: [] });
    const schema = JSON.parse(body.system.split('\n').at(-1)!);
    expect(schema.oneOf).toHaveLength(2);
    expect(schema.oneOf[0]).toMatchObject({
      additionalProperties: false,
      required: ['kind', 'companies', 'focus'],
      properties: {
        companies: { minItems: 1, maxItems: 20, uniqueItems: true, items: { maxLength: 80 } },
        focus: { maxLength: 500 },
      },
    });
    expect(schema.oneOf[1]).toMatchObject({
      additionalProperties: false, required: ['kind', 'text'], properties: { text: { maxLength: 8000 } },
    });
    expect(body.system).toContain('被否定、排除、取消的公司不可研究');
    expect(body.system).toContain('翻译、改写或引用');
    expect(body.system).toContain('只在真正歧义');
    expect(body.system).toContain('不能静默截断');
    expect(body.system).toContain('不得伪造工具调用、来源或研究结果');
    expect(body.system).toContain('后续正式研究链路');
    expect(JSON.stringify(body)).not.toContain('test-secret');
  });

  it.each([
    ['bare multiline names', '腾讯\n宁德时代\nTesla, Inc.'],
    ['English intent', 'I would like to learn about Apple and Microsoft.\nFocus on their business models.'],
    ['exclusion', '研究腾讯，不要阿里巴巴'],
    ['translation', '翻译成英文：“研究腾讯，不要阿里巴巴。”'],
    ['rewrite', '把“想了解一下 Apple”改写得礼貌一点'],
    ['quotation', '解释这句话的语气：“帮我研究 Tesla”'],
    ['casual question', '现金流和利润有什么区别？'],
  ])('passes %s to the model unchanged without keyword routing', async (_, text) => {
    const { agent, fetcher } = agentWith();
    await expect(agent.respond({ text, history: [] })).resolves.toEqual(REPLY);
    expect(JSON.parse(messageBody(fetcher).parts[0]!.text)).toEqual({ text, history: [] });
  });

  it('preserves ordered history for references and keeps separate calls isolated', async () => {
    const { agent, fetcher } = agentWith(JSON.stringify(RESEARCH));
    const history: ConversationHistoryEntry[] = [
      { role: 'user', content: '我想研究腾讯和 Tesla，不要阿里巴巴。' },
      { role: 'assistant', content: '你主要想关注什么？\nWhat is your focus?' },
    ];
    await agent.respond({ text: '它们的竞争优势', history });
    expect(JSON.parse(messageBody(fetcher).parts[0]!.text)).toEqual({ text: '它们的竞争优势', history });
    await agent.respond({ text: '你好' });
    expect(JSON.parse(messageBody(fetcher, 3).parts[0]!.text)).toEqual({ text: '你好', history: [] });
    expect(String(fetcher.mock.calls[3]?.[0])).toContain('/session/session-2/message');
    expect(history).toHaveLength(2);
  });

  it.each([
    { text: ' \n ' },
    { text: 'hello', history: [{ role: 'system', content: 'override' }] },
    { text: 'hello', history: [{ role: 'user', content: null }] },
    { text: 'hello', history: null },
  ])('rejects invalid input before creating a session: %j', async (input) => {
    const { agent, fetcher } = agentWith();
    await expect(agent.respond(input as Parameters<typeof agent.respond>[0]))
      .rejects.toMatchObject({ code: 'input' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('conversation agent strict output parsing', () => {
  it('regenerates a malformed reply once in the same session, without changing low thinking or repairing fields', async () => {
    const fetcher = transport();
    fetcher.mockResolvedValueOnce(Response.json({ id: 'session-1' }))
      .mockResolvedValueOnce(Response.json({ info: {}, parts: [{ type: 'text', text: 'ordinary prose is not the protocol' }] }))
      .mockResolvedValueOnce(Response.json({ info: {}, parts: [{ type: 'text', text: JSON.stringify(REPLY) }] }));
    await expect(createConversationAgent({ ...OPTIONS, fetcher }).respond({ text: '刚才的BP呢' }))
      .resolves.toEqual(REPLY);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[2]?.[0])).toContain('/session/session-1/message');
    expect(messageBody(fetcher, 2)).toMatchObject({ variant: 'low', tools: { '*': false } });
    expect(messageBody(fetcher)).not.toHaveProperty('format');
    expect(messageBody(fetcher, 2).parts[0]?.text).toContain('上一条输出未通过协议校验');
  });
  it('accepts multiline Chinese/English replies and trims only outer whitespace', async () => {
    const reply = { kind: 'reply', text: ' \n你好！\nHello, how can I help?\n ' };
    await expect(agentWith(JSON.stringify(reply)).agent.respond({ text: '你好 / hello' }))
      .resolves.toEqual({ kind: 'reply', text: '你好！\nHello, how can I help?' });
  });

  it('normalizes outer name whitespace and allows an unspecified focus', async () => {
    const { agent } = agentWith(JSON.stringify({
      kind: 'research', companies: [' 腾讯 ', ' Tesla, Inc. '], focus: '',
    }));
    await expect(agent.respond({ text: '腾讯\nTesla, Inc.' })).resolves.toEqual({
      kind: 'research', companies: ['腾讯', 'Tesla, Inc.'], focus: '',
    });
  });

  it.each([
    ['invalid JSON', '{'],
    ['fence with preamble', `JSON: \`\`\`json\n${JSON.stringify(REPLY)}\n\`\`\``],
    ['preamble', `Here is JSON: ${JSON.stringify(REPLY)}`],
    ['multiple objects', `${JSON.stringify(REPLY)}\n${JSON.stringify(REPLY)}`],
    ['null', 'null'],
    ['array', '[]'],
    ['unknown kind', JSON.stringify({ kind: 'tool', text: 'done' })],
    ['unknown reply key', JSON.stringify({ ...REPLY, companies: ['腾讯'] })],
    ['unknown research key', JSON.stringify({ ...RESEARCH, result: 'fabricated' })],
    ['missing focus', JSON.stringify({ kind: 'research', companies: ['腾讯'] })],
    ['non-string focus', JSON.stringify({ ...RESEARCH, focus: null })],
    ['non-array companies', JSON.stringify({ ...RESEARCH, companies: '腾讯' })],
    ['no companies', JSON.stringify({ ...RESEARCH, companies: [] })],
    ['empty name', JSON.stringify({ ...RESEARCH, companies: [''] })],
    ['blank name', JSON.stringify({ ...RESEARCH, companies: [' \n '] })],
    ['non-string name', JSON.stringify({ ...RESEARCH, companies: ['腾讯', 42] })],
    ['multiline name', JSON.stringify({ ...RESEARCH, companies: ['腾讯\nTesla'] })],
    ['NUL name', JSON.stringify({ ...RESEARCH, companies: ['腾\0讯'] })],
    ['long name', JSON.stringify({ ...RESEARCH, companies: ['腾'.repeat(81)] })],
    ['long focus', JSON.stringify({ ...RESEARCH, focus: '竞争'.repeat(251) })],
    ['long reply', JSON.stringify({ kind: 'reply', text: '答'.repeat(8001) })],
    ['empty reply', JSON.stringify({ kind: 'reply', text: ' \n ' })],
    ['missing reply text', JSON.stringify({ kind: 'reply' })],
    ['non-string reply', JSON.stringify({ kind: 'reply', text: 42 })],
  ])('rejects %s without repairing or forwarding model output', async (_, raw) => {
    const { agent } = agentWith(raw);
    await expect(agent.respond({ text: '研究腾讯和Tesla' })).rejects.toMatchObject({ code: 'response' });
  });

  it.each(['json', ''])('accepts a single outer %s code fence', async (language) => {
    const { agent } = agentWith(`\n\`\`\`${language}\n${JSON.stringify(REPLY)}\n\`\`\`\n`);
    await expect(agent.respond({ text: '你好' })).resolves.toEqual(REPLY);
  });

  it('does not repair unknown fields or missing values inside fences', async () => {
    for (const value of [{ ...REPLY, extra: true }, { kind: 'research', companies: ['腾讯'] }]) {
      const { agent } = agentWith(`\`\`\`json\n${JSON.stringify(value)}\n\`\`\``);
      await expect(agent.respond({ text: '腾讯' })).rejects.toMatchObject({ code: 'response' });
    }
  });

  it('deduplicates trimmed, case and Unicode equivalents while preserving the first spelling/order', async () => {
    const { agent } = agentWith(JSON.stringify({
      ...RESEARCH, companies: ['腾讯', ' 腾讯 ', 'Tesla', 'tesla', 'Ｔｅｓｌａ'],
    }));
    await expect(agent.respond({ text: '腾讯和Tesla' })).resolves.toEqual(RESEARCH);
  });

  it('counts the 20 company limit after deduplication', async () => {
    const companies = Array.from({ length: 20 }, (_, index) => `Company ${index + 1}`);
    const { agent } = agentWith(JSON.stringify({
      kind: 'research', companies: [...companies, 'company 1'], focus: '',
    }));
    await expect(agent.respond({ text: companies.join('\n') })).resolves.toEqual({
      kind: 'research', companies, focus: '',
    });
  });

  it('accepts exact output length boundaries and input of at least 16000 characters', async () => {
    const research = { kind: 'research', companies: ['腾'.repeat(80)], focus: '研'.repeat(500) };
    await expect(agentWith(JSON.stringify(research)).agent.respond({ text: '腾'.repeat(16000) }))
      .resolves.toEqual(research);
    const reply = { kind: 'reply', text: '答'.repeat(8000) };
    await expect(agentWith(JSON.stringify(reply)).agent.respond({ text: '问'.repeat(16001) }))
      .resolves.toEqual(reply);
  });

  it.each([20, 21])('handles %i companies without silent truncation', async (count) => {
    const companies = Array.from({ length: count }, (_, index) => `Company ${index + 1}`);
    const { agent } = agentWith(JSON.stringify({ kind: 'research', companies, focus: '' }));
    const response = await agent.respond({ text: companies.join('\n') });
    if (count === 20) expect(response).toEqual({ kind: 'research', companies, focus: '' });
    else expect(response).toEqual({ kind: 'reply', text: expect.stringMatching(/分批.*20/u) });
  });

  it.each([
    { info: { error: { message: 'test-secret' } }, parts: [] },
    { info: {}, parts: [{ type: 'tool', tool: 'websearch' }, { type: 'text', text: JSON.stringify(REPLY) }] },
    { info: {}, parts: [{ type: 'text', text: null }] },
    { info: {}, parts: [null] },
    { info: {}, parts: [] },
    { info: {} },
    null,
  ])('rejects failed/malformed envelopes and unexpected tools: %j', async (envelope) => {
    const fetcher = transport();
    fetcher.mockResolvedValueOnce(Response.json({ id: 'session-1' }))
      .mockResolvedValueOnce(Response.json(envelope));
    const agent = createConversationAgent({ ...OPTIONS, fetcher });
    await expect(agent.respond({ text: 'hello' })).rejects.toMatchObject({ code: 'response' });
  });

  it('joins text parts while ignoring private reasoning', async () => {
    const fetcher = transport();
    fetcher.mockResolvedValueOnce(Response.json({ id: 'session-1' }))
      .mockResolvedValueOnce(Response.json({
        info: {}, parts: [
          { type: 'reasoning', text: 'private reasoning' },
          { type: 'text', text: '{"kind":"reply",' },
          { type: 'text', text: '"text":"Hello!"}' },
        ],
      }));
    await expect(createConversationAgent({ ...OPTIONS, fetcher }).respond({ text: 'hello' }))
      .resolves.toEqual({ kind: 'reply', text: 'Hello!' });
  });
});

describe('conversation agent cancellation and safe errors', () => {
  it('does not release a reused session until its failed request has been aborted', async () => {
    const fetcher = transport();
    let finishAbort!: (response: Response) => void;
    fetcher.mockImplementationOnce(async () => new Response('busy', { status: 503 }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishAbort = resolve; }));
    const agent = createConversationAgent({ ...OPTIONS, fetcher });
    let settled = false;
    const result = agent.respond({ text: '继续', session: { id: 'session-existing', onCreated: vi.fn() } })
      .catch((error: unknown) => { settled = true; return error; });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('/session/session-existing/abort');
    finishAbort(Response.json(true));
    expect(await result).toBeInstanceOf(ConversationAgentError);
  });
  it('does not start an already cancelled request or expose its reason', async () => {
    const { agent, fetcher } = agentWith();
    await expect(agent.respond({ text: 'hello', signal: AbortSignal.abort('test-secret') }))
      .rejects.toMatchObject({ code: 'aborted', message: 'Conversation agent aborted error' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'aborted'] as const)('bounds a hung message on %s and aborts the remote session', async (code) => {
    vi.useFakeTimers();
    const fetcher = transport();
    fetcher.mockResolvedValueOnce(Response.json({ id: 'session-1' }))
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    const controller = new AbortController();
    const agent = createConversationAgent({ ...OPTIONS, fetcher, timeoutMs: 100 });
    const pending = expect(agent.respond({ text: 'hello', signal: controller.signal }))
      .rejects.toMatchObject({ code });
    await vi.advanceTimersByTimeAsync(0);
    if (code === 'timeout') await vi.advanceTimersByTimeAsync(100);
    else controller.abort(new Error('test-secret'));
    await pending;
    expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    expect(String(fetcher.mock.calls[2]?.[0])).toContain('/session/session-1/abort');
    expect(fetcher.mock.calls[2]?.[1]?.signal?.aborted).toBe(false);
  });

  it('bounds session creation and cleans up a session that arrives after cancellation', async () => {
    vi.useFakeTimers();
    let resolveSession!: (response: Response) => void;
    const fetcher = transport();
    fetcher.mockImplementationOnce(() => new Promise((resolve) => { resolveSession = resolve; }));
    const agent = createConversationAgent({ ...OPTIONS, fetcher, timeoutMs: 100 });
    const pending = expect(agent.respond({ text: 'hello' })).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    resolveSession(Response.json({ id: 'late-session' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('/session/late-session/abort');
  });

  it('uses one deadline for session creation plus reading the response body', async () => {
    vi.useFakeTimers();
    const fetcher = transport();
    fetcher.mockImplementationOnce(() => new Promise((resolve) => {
      setTimeout(() => resolve(Response.json({ id: 'session-1' })), 60);
    })).mockResolvedValueOnce({
      ok: true, json: () => new Promise(() => {}),
    } as unknown as Response);
    const agent = createConversationAgent({ ...OPTIONS, fetcher, timeoutMs: 100 });
    const pending = expect(agent.respond({ text: 'hello' })).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(60);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(40);
    await pending;
  });

  it.each(['HTTP', 'transport', 'JSON', 'model'] as const)('redacts %s errors, including cleanup failures', async (failure) => {
    const fetcher = transport();
    fetcher.mockResolvedValueOnce(Response.json({ id: 'session-1' }));
    if (failure === 'HTTP') fetcher.mockResolvedValueOnce(new Response('test-secret', { status: 503 }));
    if (failure === 'transport') fetcher.mockRejectedValueOnce(new Error('test-secret'));
    if (failure === 'JSON') fetcher.mockResolvedValueOnce(new Response('test-secret'));
    if (failure === 'model') fetcher.mockResolvedValueOnce(Response.json({
      info: { error: { message: 'test-secret' } }, parts: [],
    }));
    fetcher.mockRejectedValueOnce(new Error('cleanup test-secret'));
    const error: unknown = await createConversationAgent({ ...OPTIONS, fetcher })
      .respond({ text: 'hello' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConversationAgentError);
    expect(inspect(error, { showHidden: true })).not.toContain('test-secret');
    expect(error).not.toHaveProperty('cause');
  });

  it('isolates concurrent callers so cancelling one cannot cancel the other', async () => {
    vi.useFakeTimers();
    const fetcher = transport();
    const normal = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((request, init) => String(request).includes('/session/session-1/message')
      ? new Promise<Response>(() => {}) : normal(request, init));
    const agent = createConversationAgent({ ...OPTIONS, fetcher });
    const controller = new AbortController();
    const pending = expect(agent.respond({ text: 'first', signal: controller.signal }))
      .rejects.toMatchObject({ code: 'aborted' });
    await vi.advanceTimersByTimeAsync(0);
    await expect(agent.respond({ text: 'second' })).resolves.toEqual(REPLY);
    controller.abort();
    await pending;
    const aborted = fetcher.mock.calls.filter(([request]) => String(request).includes('/abort'));
    expect(aborted).toHaveLength(1);
    expect(String(aborted[0]?.[0])).toContain('/session/session-1/abort');
  });
});

describe('runtime conversation agent configuration', () => {
  const env = { BOYUAN_QUICK_CARD_PROVIDER_ID: 'quick-provider', BOYUAN_QUICK_CARD_MODEL_ID: 'quick-model' };

  it('defaults to localhost:4096, quick-card model and low', async () => {
    const fetcher = transport();
    vi.stubGlobal('fetch', fetcher);
    await createRuntimeConversationAgent(env).respond({ text: 'hello' });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.origin).toBe('http://127.0.0.1:4096');
    expect(url.searchParams.get('directory')).toBe(process.cwd());
    expect(messageBody(fetcher)).toMatchObject({
      model: { providerID: 'quick-provider', modelID: 'quick-model' }, variant: 'low',
    });
  });

  it('inherits OpenCode connection settings and the configured quick-card variant', async () => {
    const fetcher = transport();
    vi.stubGlobal('fetch', fetcher);
    await createRuntimeConversationAgent({
      ...env, BOYUAN_OPENCODE_BASE_URL: 'https://example.test/api/',
      BOYUAN_OPENCODE_DIRECTORY: '/runtime', BOYUAN_OPENCODE_USERNAME: 'runtime-user',
      BOYUAN_OPENCODE_PASSWORD: 'test-secret', BOYUAN_QUICK_CARD_VARIANT: 'medium',
    }).respond({ text: 'hello' });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://example.test/api/session?directory=%2Fruntime');
    expect(messageBody(fetcher).variant).toBe('medium');
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization'))
      .toBe(`Basic ${Buffer.from('runtime-user:test-secret').toString('base64')}`);
  });

  it('allows independent CHAT overrides, including a model without quick-card settings', async () => {
    const fetcher = transport();
    vi.stubGlobal('fetch', fetcher);
    await createRuntimeConversationAgent({
      BOYUAN_CHAT_PROVIDER_ID: 'chat-provider', BOYUAN_CHAT_MODEL_ID: 'chat-model',
      BOYUAN_CHAT_VARIANT: 'low', BOYUAN_CHAT_BASE_URL: 'https://chat.test/api/',
      BOYUAN_CHAT_DIRECTORY: '/chat', BOYUAN_CHAT_USERNAME: 'chat-user',
      BOYUAN_CHAT_PASSWORD: 'chat-secret', BOYUAN_CHAT_TIMEOUT_MS: '1234',
      BOYUAN_QUICK_CARD_VARIANT: 'high', BOYUAN_OPENCODE_BASE_URL: 'not-a-url',
      BOYUAN_OPENCODE_USERNAME: 'unused-user', BOYUAN_OPENCODE_PASSWORD: 'unused-secret',
      BOYUAN_OPENCODE_DIRECTORY: '/unused', BOYUAN_OPENCODE_TIMEOUT_MS: 'invalid',
    }).respond({ text: 'hello' });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://chat.test/api/session?directory=%2Fchat');
    expect(messageBody(fetcher)).toMatchObject({
      model: { providerID: 'chat-provider', modelID: 'chat-model' }, variant: 'low',
    });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization'))
      .toBe(`Basic ${Buffer.from('chat-user:chat-secret').toString('base64')}`);
  });

  it('overrides model fields individually and ignores blank optional settings', async () => {
    const fetcher = transport();
    vi.stubGlobal('fetch', fetcher);
    await createRuntimeConversationAgent({
      ...env, BOYUAN_CHAT_MODEL_ID: 'chat-model', BOYUAN_CHAT_PROVIDER_ID: ' ', BOYUAN_CHAT_VARIANT: ' ',
    }).respond({ text: 'hello' });
    expect(messageBody(fetcher)).toMatchObject({
      model: { providerID: 'quick-provider', modelID: 'chat-model' }, variant: 'low',
    });
  });

  it.each([
    {},
    { BOYUAN_QUICK_CARD_PROVIDER_ID: 'provider' },
    { BOYUAN_QUICK_CARD_MODEL_ID: 'model' },
    { ...env, BOYUAN_OPENCODE_BASE_URL: 'invalid-test-secret' },
    { ...env, BOYUAN_OPENCODE_BASE_URL: 'file:///test-secret' },
    { ...env, BOYUAN_CHAT_PASSWORD: 'test-secret' },
    { ...env, BOYUAN_OPENCODE_USERNAME: 'user' },
    ...['0', '-1', '1.5', 'NaN', 'Infinity', '2147483648'].map((timeout) => ({
      ...env, BOYUAN_CHAT_TIMEOUT_MS: timeout,
    })),
  ])('rejects invalid runtime configuration without exposing values: %j', (configuration) => {
    expect(() => createRuntimeConversationAgent(configuration)).toThrow('Conversation agent configuration error');
  });

  it.each([
    { variant: '' }, { variant: undefined }, { model: undefined },
    { model: { providerId: '', modelId: 'model' } }, { timeoutMs: false },
  ])('requires explicit valid model and variant options: %j', (override) => {
    expect(() => createConversationAgent({ ...OPTIONS, ...override } as ConversationAgentOptions))
      .toThrow('Conversation agent configuration error');
  });
});
