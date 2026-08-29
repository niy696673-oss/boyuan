import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpPlatformClient } from '../src/platform-client.js';
import { companyQuickCard, conversation, quickCard, tempDir } from './helpers.js';

describe('HTTP platform client', () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

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
