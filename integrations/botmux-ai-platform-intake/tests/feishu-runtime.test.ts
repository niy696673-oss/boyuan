import { describe, expect, it, vi } from 'vitest';
import {
  LarkFeishuTransport,
  type LarkRequestClient,
} from '../src/feishu-runtime.js';
import { tempDir, testConfig } from './helpers.js';

describe('Lark Feishu transport', () => {
  it('resolves the bot identity and uses standard reply and in-place patch APIs', async () => {
    const temp = tempDir();
    const request = vi.fn<LarkRequestClient['request']>(async () => ({
      code: 0,
      bot: { open_id: 'ou_company_research_bot' },
    }));
    const reply = vi.fn<LarkRequestClient['im']['v1']['message']['reply']>(async () => ({
      code: 0,
      data: { message_id: 'om_processing_card' },
    }));
    const patch = vi.fn<LarkRequestClient['im']['v1']['message']['patch']>(async () => ({ code: 0 }));
    const client: LarkRequestClient = {
      request,
      im: { v1: { message: { reply, patch } } },
    };
    const transport = new LarkFeishuTransport(testConfig(temp.path), {
      appId: 'cli_test_app',
      appSecret: 'test-app-secret',
      brand: 'feishu',
    }, client);

    try {
      await expect(transport.botOpenId()).resolves.toBe('ou_company_research_bot');
      await expect(transport.reply({
        messageId: 'om_user_message',
        messageType: 'interactive',
        content: '{"schema":"2.0"}',
        uuid: 'company-card-uuid',
      })).resolves.toEqual({ messageId: 'om_processing_card' });
      await expect(transport.update({
        cardMessageId: 'om_processing_card',
        content: '{"schema":"2.0","updated":true}',
      })).resolves.toBeUndefined();

      expect(request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/open-apis/bot/v3/info',
      });
      expect(reply).toHaveBeenCalledWith(expect.objectContaining({
        path: { message_id: 'om_user_message' },
        data: expect.objectContaining({ msg_type: 'interactive' }),
      }));
      expect(patch).toHaveBeenCalledWith({
        path: { message_id: 'om_processing_card' },
        data: { content: '{"schema":"2.0","updated":true}' },
      });
    } finally {
      temp.cleanup();
    }
  });

  it('downloads images via OpenAPI resources endpoint and returns Buffer', async () => {
    const temp = tempDir();
    const imagePayload = Buffer.from('fake-png-image-bytes');
    const request = vi.fn<LarkRequestClient['request']>(async (input) => {
      if (input.url === '/open-apis/im/v1/messages/om_msg_123/resources/img_v2_456') {
        return imagePayload;
      }
      throw new Error('unexpected_url');
    });
    const client: LarkRequestClient = {
      request,
      im: { v1: { message: { reply: vi.fn(), patch: vi.fn() } } },
    };
    const transport = new LarkFeishuTransport(testConfig(temp.path), {
      appId: 'cli_test_app',
      appSecret: 'test-app-secret',
      brand: 'feishu',
    }, client);

    try {
      const buffer = await transport.downloadImage('om_msg_123', 'img_v2_456');
      expect(buffer).toEqual(imagePayload);
      expect(request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/open-apis/im/v1/messages/om_msg_123/resources/img_v2_456',
        params: { type: 'image' },
        responseType: 'stream',
      });
    } finally {
      temp.cleanup();
    }
  });

  it('materializes arbitrary file types without restricting to fixed extensions', async () => {
    const temp = tempDir();
    const fileContent = Buffer.from('test presentation binary data');
    const request = vi.fn<LarkRequestClient['request']>(async () => fileContent);
    const client: LarkRequestClient = {
      request,
      im: { v1: { message: { reply: vi.fn(), patch: vi.fn() } } },
    };
    const transport = new LarkFeishuTransport(testConfig(temp.path), {
      appId: 'cli_test_app',
      appSecret: 'test-app-secret',
      brand: 'feishu',
    }, client);

    try {
      const attachment = await transport.materialize({
        chatId: 'oc_test',
        messageId: 'om_pptx',
        fileKey: 'file_key_pptx',
        fileName: '项目路演.pptx',
        receivedAt: new Date().toISOString(),
      });
      expect(attachment.name).toBe('项目路演.pptx');
      expect(attachment.mimeType).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    } finally {
      temp.cleanup();
    }
  });
});
