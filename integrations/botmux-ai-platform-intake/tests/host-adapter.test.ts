import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ingestCurrentFeishuFiles } from '../src/host-adapter.js';
import { tempDir, testConfig } from './helpers.js';

const environment = (root: string): NodeJS.ProcessEnv => ({
  SESSION_DATA_DIR: root,
  BOTMUX_CHAT_ID: 'oc_test_chat',
  BOTMUX_SESSION_ID: 'session-test',
});
const resolveTurn = async () => ({ sessionId: 'session-test', turnId: 'om_test_message' });

describe('Feishu host adapter', () => {
  it('forwards all verified files in one authenticated loopback request without file bytes', async () => {
    const temp = tempDir();
    const first = join(temp.path, 'attachments', 'one.pdf');
    const second = join(temp.path, 'attachments', 'two.docx');
    mkdirSync(join(temp.path, 'attachments'), { recursive: true });
    writeFileSync(first, 'pdf');
    writeFileSync(second, 'docx');
    let requestBody: Record<string, unknown> | undefined;
    try {
      const result = await ingestCurrentFeishuFiles({
        config: testConfig(temp.path),
        env: environment(temp.path),
        resolveTurn,
        runner: async (_executable, args) => {
          expect(args).toEqual(['quoted', 'om_test_message']);
          return { code: 0, stderr: '', stdout: JSON.stringify({
            messageId: 'om_test_message', chatId: 'oc_test_chat', senderId: 'ou_sender',
            resources: [
              { type: 'file', key: 'key-1', name: 'one.pdf' },
              { type: 'file', key: 'key-2', name: 'two.docx' },
            ],
            attachments: [
              { type: 'file', path: first, name: 'one.pdf' },
              { type: 'file', path: second, name: 'two.docx' },
            ],
          }) };
        },
        fetcher: async (input, init) => {
          expect(input).toBe('http://127.0.0.1:19470/v1/intake');
          expect(new Headers(init?.headers).get('authorization')).toBe('Bearer loopback-secret-123456');
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return new Response(JSON.stringify({ ok: true, outcomes: [
            { fileKey: 'key-1', fileName: 'one.pdf', status: 'accepted' },
            { fileKey: 'key-2', fileName: 'two.docx', status: 'accepted' },
          ] }));
        },
      });
      expect(result.attachmentCount).toBe(2);
      expect(requestBody).toMatchObject({ messageId: 'om_test_message', senderId: 'ou_sender', receivedAt: expect.any(String) });
      expect(JSON.stringify(requestBody)).not.toContain(Buffer.from('pdf').toString('base64'));
      expect((requestBody?.attachments as unknown[])).toHaveLength(2);
    } finally { temp.cleanup(); }
  });

  it('fails closed when BotMux reports an attachment download/login failure', async () => {
    const temp = tempDir();
    mkdirSync(join(temp.path, 'attachments'), { recursive: true });
    const fetcher = vi.fn();
    try {
      await expect(ingestCurrentFeishuFiles({
        config: testConfig(temp.path), env: environment(temp.path), resolveTurn, fetcher,
        runner: async () => ({ code: 0, stderr: '', stdout: JSON.stringify({
          messageId: 'om_test_message', needLogin: true,
          resources: [{ type: 'file', key: 'key-1', name: 'one.pdf' }], attachments: [],
        }) }),
      })).rejects.toThrow('botmux_attachment_login_required');
      expect(fetcher).not.toHaveBeenCalled();
    } finally { temp.cleanup(); }
  });

  it('rejects an attachment path outside the configured BotMux root', async () => {
    const temp = tempDir();
    const outside = join(temp.path, 'outside.pdf');
    writeFileSync(outside, 'outside');
    try {
      await expect(ingestCurrentFeishuFiles({
        config: testConfig(temp.path), env: environment(temp.path), resolveTurn,
        runner: async () => ({ code: 0, stderr: '', stdout: JSON.stringify({
          messageId: 'om_test_message',
          resources: [{ type: 'file', key: 'key-1', name: 'one.pdf' }],
          attachments: [{ type: 'file', path: outside, name: 'one.pdf' }],
        }) }),
      })).rejects.toThrow('attachment_outside_botmux_root');
    } finally { temp.cleanup(); }
  });
});
