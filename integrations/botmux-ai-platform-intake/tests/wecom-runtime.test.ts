import { existsSync, realpathSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadWeComCredentials, WeComFileMaterializer } from '../src/wecom-runtime.js';
import { tempDir, testConfig } from './helpers.js';

describe('WeCom runtime boundary', () => {
  it('loads bot credentials from environment variables without putting them in config', () => {
    expect(loadWeComCredentials({ WECOM_BOT_ID: 'bot-id', WECOM_BOT_SECRET: 'bot-secret' }))
      .toEqual({ botId: 'bot-id', secret: 'bot-secret' });
    expect(() => loadWeComCredentials({ WECOM_BOT_ID: 'bot-id' })).toThrow('wecom_bot_secret_missing');
  });

  it('downloads and materializes an SDK-decrypted PDF under the managed root', async () => {
    const temp = tempDir();
    const config = testConfig(temp.path);
    const downloadFile = vi.fn(async () => ({
      buffer: Buffer.from('%PDF-1.4\n% local integration fixture'),
      filename: '真实项目 BP.pdf',
    }));
    const materializer = new WeComFileMaterializer(config, { downloadFile });
    try {
      const attachment = await materializer.materialize({
        reqId: 'req-1',
        chatId: 'user-1',
        messageId: 'message-1',
        fileKey: 'file-key-1',
        receivedAt: new Date().toISOString(),
        senderId: 'user-1',
        downloadUrl: 'https://files.example.com/encrypted',
        aesKey: 'aes-key',
      });

      expect(downloadFile).toHaveBeenCalledWith('https://files.example.com/encrypted', 'aes-key');
      expect(attachment).toMatchObject({
        fileKey: 'file-key-1',
        name: '真实项目 BP.pdf',
        mimeType: 'application/pdf',
      });
      expect(attachment.path.startsWith(realpathSync(config.attachmentRoot))).toBe(true);
      expect(existsSync(attachment.path)).toBe(true);
      await materializer.release(attachment);
      expect(existsSync(attachment.path)).toBe(false);
    } finally {
      temp.cleanup();
    }
  });

  it('infers PDF when the official download response omits a filename', async () => {
    const temp = tempDir();
    const config = testConfig(temp.path);
    const materializer = new WeComFileMaterializer(config, {
      downloadFile: vi.fn(async () => ({ buffer: Buffer.from('%PDF-1.7\nfixture') })),
    });
    try {
      await expect(materializer.materialize({
        reqId: 'req-2', chatId: 'user-2', messageId: 'message-2', fileKey: 'file-key-2',
        receivedAt: new Date().toISOString(), senderId: 'user-2',
        downloadUrl: 'https://files.example.com/no-name',
      })).resolves.toMatchObject({ name: '企业微信项目材料.pdf', mimeType: 'application/pdf' });
    } finally {
      temp.cleanup();
    }
  });
});
