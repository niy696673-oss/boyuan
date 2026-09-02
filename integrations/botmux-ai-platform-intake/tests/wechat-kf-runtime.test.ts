import { existsSync, realpathSync, statSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  loadWechatKfCredentials,
  WechatKfFileMaterializer,
} from '../src/wechat-kf-runtime.js';
import { tempDir, testConfig } from './helpers.js';

describe('WeChat Customer Service runtime boundary', () => {
  it('loads all API and callback credentials from environment variables', () => {
    expect(loadWechatKfCredentials({
      WECOM_CORP_ID: 'ww1234567890abcdef',
      WECHAT_KF_APP_SECRET: 'application-secret',
      WECHAT_KF_CALLBACK_TOKEN: 'callbackToken123',
      WECHAT_KF_ENCODING_AES_KEY: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFG',
    })).toEqual({
      corpId: 'ww1234567890abcdef',
      secret: 'application-secret',
      callbackToken: 'callbackToken123',
      encodingAESKey: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFG',
    });
  });

  it('stores only a valid PDF under the managed attachment root and removes it after upload', async () => {
    const temp = tempDir();
    const config = testConfig(temp.path);
    const downloadMedia = vi.fn(async () => ({
      buffer: Buffer.from('%PDF-1.7\nfixture'),
      filename: '微信转发 BP.pdf',
    }));
    const materializer = new WechatKfFileMaterializer(config, { downloadMedia });
    try {
      const attachment = await materializer.materialize({
        messageId: 'message-1',
        openKfid: 'wkAJ2GCAAAexample',
        externalUserId: 'wmAJ2GCAAAcustomer',
        receivedAt: '2026-09-03T00:00:00.000Z',
        mediaId: 'media-1',
      }, 'file-key-1');

      expect(downloadMedia).toHaveBeenCalledWith('media-1');
      expect(attachment).toMatchObject({
        fileKey: 'file-key-1',
        name: '微信转发 BP.pdf',
        mimeType: 'application/pdf',
      });
      expect(attachment.path.startsWith(realpathSync(config.attachmentRoot))).toBe(true);
      expect(statSync(attachment.path).mode & 0o777).toBe(0o600);
      await materializer.release(attachment);
      expect(existsSync(attachment.path)).toBe(false);
    } finally {
      temp.cleanup();
    }
  });

  it('rejects non-PDF content even if the download filename ends with pdf', async () => {
    const temp = tempDir();
    const config = testConfig(temp.path);
    const materializer = new WechatKfFileMaterializer(config, {
      downloadMedia: vi.fn(async () => ({ buffer: Buffer.from('not-a-pdf'), filename: 'fake.pdf' })),
    });
    try {
      await expect(materializer.materialize({
        messageId: 'message-2',
        openKfid: 'wkAJ2GCAAAexample',
        externalUserId: 'wmAJ2GCAAAcustomer',
        receivedAt: '2026-09-03T00:00:00.000Z',
        mediaId: 'media-2',
      }, 'file-key-2')).rejects.toThrow('attachment_type_unsupported');
    } finally {
      temp.cleanup();
    }
  });
});
