import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpPlatformClient } from '../src/platform-client.js';
import { COMPANY_RESEARCH_FILE_KEY } from '../src/types.js';
import { companyQuickCard, conversation, quickCard, tempDir } from './helpers.js';

describe('HTTP platform client', () => {
  it('fetches original BP context using the original message, attachment and sender receipt', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ fileName: 'BP.pdf', text: '[第21页]融资5000万', truncated: false }));
    const client = new HttpPlatformClient('http://platform.test', 'test-key', 1000, fetcher);
    await expect(client.documentContext('conversation', { messageId: 'om_file', fileKey: 'file', senderId: 'ou_owner' }))
      .resolves.toMatchObject({ text: expect.stringContaining('5000万') });
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://platform.test/api/v1/feishu/conversations/conversation/material-context');
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get('x-boyuan-sender-id')).toBe('ou_owner');
    expect(headers.get('x-boyuan-message-id')).toBe('om_file');
    expect(headers.get('x-boyuan-file-key')).toBe('file');
  });
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

  it.each([undefined, COMPANY_RESEARCH_FILE_KEY, 'legacy-key'])('preserves the real message ID for legacy research key %s', async (researchKey) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      conversation: conversation('conversation-legacy', 'processing'), reusedResearch: true,
    }), { status: 201 }));
    const client = new HttpPlatformClient('http://platform.test', 'test-key', 10_000, fetcher);
    await client.startCompanyResearch({
      chatId: 'oc_chat', sessionId: 'session', messageId: 'om_legacy', companyName: '甲科技',
      ...(researchKey !== undefined ? { researchKey } : {}),
    });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('x-boyuan-message-id')).toBe('om_legacy');
  });

  it.each(['feishu', 'wecom'] as const)('derives stable child IDs and carries focus for %s', async (channel) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      conversation: conversation('conversation-company', 'processing'), reusedResearch: false,
    }), { status: 201 }));
    const client = new HttpPlatformClient('http://platform.test', 'test-key', 10_000, fetcher, channel);
    const input = {
      chatId: 'oc_chat', sessionId: 'session', messageId: 'om_multi', companyName: '甲科技',
      researchKey: `${COMPANY_RESEARCH_FILE_KEY}:${'公司甲\n'.repeat(200)}`, researchFocus: '最近一轮融资与竞争格局', senderId: 'ou_sender',
    };
    await client.startCompanyResearch(input);
    await client.startCompanyResearch({ ...input, researchKey: 'company-research:乙' });
    await new HttpPlatformClient('http://platform.test', 'test-key', 10_000, fetcher, channel).startCompanyResearch(input);
    await client.startCompanyResearch({ ...input, messageId: 'om_other' });
    const ids = fetcher.mock.calls.map((call) => new Headers(call[1]?.headers).get('x-boyuan-message-id'));
    expect(ids[0]).toMatch(/^company-research:[a-f0-9]{64}$/u);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).toBe(ids[2]);
    expect(ids[0]).not.toBe(ids[3]);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      companyName: '甲科技', researchFocus: input.researchFocus,
    });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('x-boyuan-sender-id')).toBe('ou_sender');
    expect(input.messageId).toBe('om_multi');
  });

  it('preserves legacy WeCom message IDs while carrying research focus', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      conversation: conversation('conversation-company', 'processing'), reusedResearch: false,
    }), { status: 201 }));
    const client = new HttpPlatformClient('http://platform.test', 'test-key', 10_000, fetcher, 'wecom');
    await client.startCompanyResearch({
      chatId: 'chat', sessionId: 'session', messageId: 'wecom-real-message', companyName: '甲科技',
      researchKey: 'child-key', researchFocus: '融资',
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://platform.test/api/v1/wecom/company-research');
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('x-boyuan-message-id')).toBe('wecom-real-message');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ companyName: '甲科技', researchFocus: '融资' });
  });

  it('streams multipart bytes with authenticated Feishu metadata and parses the platform response', async () => {
    const temp = tempDir();
    const path = join(temp.path, 'stream.pdf');
    writeFileSync(path, 'streamed-content');
    let received = '';
    let headers: Record<string, string | string[] | undefined> = {};
    const server = createServer(async (request, response) => {
      headers = request.headers;
      for await (const chunk of request) received += Buffer.from(chunk).toString('utf8');
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ conversation: conversation('conversation-stream', 'processing'), reusedDocument: false }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_missing');
    try {
      const client = new HttpPlatformClient(`http://127.0.0.1:${address.port}`, 'platform-secret-123456', 10_000);
      const result = await client.upload({
        chatId: 'oc', sessionId: 'session', messageId: 'om_message', senderId: 'ou_sender', attachments: [],
      }, { fileKey: 'key', name: 'stream.pdf', mimeType: 'application/pdf', path, size: 16 }, 9_000);
      expect(result.conversation.conversationId).toBe('conversation-stream');
      expect(headers['x-boyuan-intake-key']).toBe('platform-secret-123456');
      expect(headers['x-boyuan-message-id']).toBe('om_message');
      expect(headers['x-boyuan-file-key']).toBe('key');
      expect(headers['x-boyuan-sender-id']).toBe('ou_sender');
      expect(received).toContain('streamed-content');
      expect(received).toContain('filename="stream.pdf"');
    } finally { temp.cleanup(); }
  });

  it('requests the authenticated quick-card endpoint and parses only concise fields', async () => {
    let requestPath = '';
    let intakeKey = '';
    let requestSignal: AbortSignal | null | undefined;
    const server = createServer((request, response) => {
      requestPath = request.url ?? '';
      intakeKey = String(request.headers['x-boyuan-intake-key'] ?? '');
      response.writeHead(200, { 'content-type': 'application/json' });
      const platformResult = { ...quickCard() };
      Reflect.deleteProperty(platformResult, 'status');
      response.end(JSON.stringify(platformResult));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_missing');

    const fetcher: typeof fetch = async (input, init) => {
      requestSignal = init?.signal;
      return fetch(input, init);
    };
    const client = new HttpPlatformClient(`http://127.0.0.1:${address.port}`, 'platform-secret-123456', 10_000, fetcher);
    await expect(client.quickCard('conversation/one')).resolves.toMatchObject({
      status: 'completed', modelId: 'gpt-5.6-luna', companyName: '博源科技', confidence: 86,
    });
    expect(requestPath).toBe('/api/v1/feishu/conversations/conversation%2Fone/quick-card');
    expect(intakeKey).toBe('platform-secret-123456');
    expect(requestSignal).toBeUndefined();
  });

  it('starts idempotent company research and reads the company quick-card contract', async () => {
    const requests: Array<{ path: string; body: string; messageId: string }> = [];
    const server = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += Buffer.from(chunk).toString('utf8');
      requests.push({
        path: request.url ?? '',
        body,
        messageId: String(request.headers['x-boyuan-message-id'] ?? ''),
      });
      response.writeHead(request.url === '/api/v1/feishu/company-research' ? 201 : 200, {
        'content-type': 'application/json',
      });
      response.end(JSON.stringify(request.url === '/api/v1/feishu/company-research'
        ? { conversation: conversation('conversation-company', 'processing'), reusedResearch: false }
        : companyQuickCard({ navigation: { companyId: 'company-one' } })));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_missing');
    const client = new HttpPlatformClient(
      `http://127.0.0.1:${address.port}`,
      'platform-secret-123456',
      10_000,
    );

    await expect(client.startCompanyResearch({
      chatId: 'oc_chat',
      sessionId: 'feishu:om_company',
      messageId: 'om_company',
      companyName: '博源科技',
      senderId: 'ou_sender',
    })).resolves.toMatchObject({
      reusedResearch: false,
      conversation: { conversationId: 'conversation-company' },
    });
    await expect(client.companyQuickCard('conversation/company')).resolves.toMatchObject({
      kind: 'company_research',
      companyName: '博源科技',
      sourceCount: 5,
      navigation: { companyId: 'company-one' },
    });

    expect(requests[0]).toEqual({
      path: '/api/v1/feishu/company-research',
      body: JSON.stringify({ companyName: '博源科技' }),
      messageId: 'om_company',
    });
    expect(requests[1]?.path).toBe('/api/v1/feishu/company-research/conversation%2Fcompany/quick-card');
  });
});
