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
});
