import { describe, expect, it, vi } from 'vitest';
import { DirectWechatKfCompanyResearchIngress, WechatKfTextDelivery, parseWechatKfCompanyName } from '../src/direct-wechat-kf-intake.js';
import { WechatKfClient } from '../src/wechat-kf-client.js';
import { MemoryWechatKfCursorStore, WechatKfMessagePump } from '../src/wechat-kf-pump.js';
import { IntakeService } from '../src/intake-service.js';
import { MemoryJobStore } from '../src/job-store.js';
import type { CompanyResearchTurn } from '../src/types.js';
import { companyQuickCard, conversation, tempDir, testConfig } from './helpers.js';

describe('WeChat customer service company research', () => {
  it.each(['宁德时代', '分析宁德时代', '研究一下：宁德时代', '  研究 宁德时代  '])('accepts %s', (input) => {
    expect(parseWechatKfCompanyName(input)).toBe('宁德时代');
  });
  it.each(['', '你好', '已发送', '继续处理', '分析一下', '研究', '12345', '怎么使用？', 'https://example.com', '公司一\n公司二'])('ignores non-company text %s', (input) => {
    expect(parseWechatKfCompanyName(input)).toBeUndefined();
  });
  it('accepts English and parenthesized legal names', () => {
    expect(parseWechatKfCompanyName('分析 Acme Robotics')).toBe('Acme Robotics');
    expect(parseWechatKfCompanyName('博源（杭州）科技有限公司')).toBe('博源（杭州）科技有限公司');
  });

  it('routes customer text through sync, dedupe, quick research and ordinary text delivery', async () => {
    const temp = tempDir();
    try {
      const order: string[] = [];
      const sendText = vi.fn(async (input: { content: string }) => { order.push(input.content); });
      const delivery = new WechatKfTextDelivery({ sendText });
      const startCompanyResearch = vi.fn(async (_turn: CompanyResearchTurn) => {
        order.push('start-research');
        return { conversation: conversation('company-conversation', 'processing'), reusedResearch: false };
      });
      const quick = vi.fn(async () => companyQuickCard());
      const store = new MemoryJobStore();
      const service = new IntakeService({
        config: testConfig(temp.path), store, delivery,
        platform: {
          startCompanyResearch, companyQuickCard: quick,
          upload: vi.fn(), quickCard: vi.fn(),
        },
      });
      const makeIngress = () => new DirectWechatKfCompanyResearchIngress({
        delivery,
        researchCompany: (turn) => service.researchCompany(turn),
        statusReceiptId: (id, key) => service.statusCardId(id, key),
        statusReceiptTerminal: (id, key) => service.isStatusCardTerminal(id, key),
        markStatusReceiptTerminal: (id, key) => service.markStatusCardTerminal(id, key),
        rememberStatusReceipt: ({ receipt, ...input }) => service.rememberStatusCard({ ...input, cardMessageId: receipt }),
      });
      const wire = (id: string, origin = 3, content = '宁德时代') => ({
        msgid: id, open_kfid: 'wk-account', external_userid: 'customer',
        send_time: Date.now() / 1000, origin, msgtype: 'text', text: { content },
      });
      const client = new WechatKfClient({ corpId: 'ww1234567890abcdef', secret: 'test-secret' }, vi.fn(async (url) => {
        if (String(url).includes('/gettoken')) return Response.json({ errcode: 0, access_token: 'token', expires_in: 7200 });
        return Response.json({
          errcode: 0, next_cursor: 'after', has_more: 0,
          msg_list: [
            wire('recalled'), wire('staff', 5), wire('hello', 3, '你好'), wire('company'), wire('company'),
            { origin: 4, msgtype: 'event', event: { event_type: 'user_recall_msg', recall_msgid: 'recalled' } },
          ],
        });
      }));
      const cursors = new MemoryWechatKfCursorStore();
      let ingress = makeIngress();
      const pump = new WechatKfMessagePump({
        client, cursorStore: cursors,
        ingress: { handle: (message) => 'text' in message ? ingress.handle(message) : Promise.reject(new Error('unexpected_file')) },
      });
      await pump.handleEvent({ token: 'callback', openKfid: 'wk-account' });
      // New ingress instance exercises the persisted receipt/job, not an in-memory seen set.
      ingress = makeIngress();
      await pump.pollKnownAccounts();
      expect(startCompanyResearch).toHaveBeenCalledOnce();
      expect(startCompanyResearch.mock.calls[0]?.[0]).toMatchObject({ companyName: '宁德时代', messageId: 'company', sessionId: 'wechat-kf:company' });
      expect(quick).toHaveBeenCalledOnce();
      expect(order[0]).toContain('宁德时代');
      expect(order[1]).toBe('start-research');
      const final = sendText.mock.calls.slice(1).map(([input]) => input.content).join('\n');
      expect(final).toContain('公司快速研究');
      expect(final).toContain('/workbench/conversations/');
      expect(sendText.mock.calls.length).toBeLessThanOrEqual(4);
      expect(sendText.mock.calls.every(([input]) => Buffer.byteLength(input.content) <= 2048)).toBe(true);
      expect(cursors.get('wk-account')).toBe('after');
    } finally { temp.cleanup(); }
  });

  it('retains processing receipt when platform fails and resumes without another processing reply', async () => {
    let receipt: string | undefined;
    const sendText = vi.fn(async () => undefined);
    const researchCompany = vi.fn().mockRejectedValueOnce(new Error('platform_unavailable')).mockResolvedValue({ status: 'completed' });
    const options = {
      delivery: new WechatKfTextDelivery({ sendText }), researchCompany,
      statusReceiptId: () => receipt, statusReceiptTerminal: () => false,
      rememberStatusReceipt: (input: { receipt: string }) => { receipt = input.receipt; },
      markStatusReceiptTerminal: vi.fn(),
    };
    const message = { messageId: 'm', openKfid: 'wk-account', externalUserId: 'customer', receivedAt: new Date().toISOString(), text: '宁德时代' };
    await expect(new DirectWechatKfCompanyResearchIngress(options).handle(message)).rejects.toThrow('platform_unavailable');
    await new DirectWechatKfCompanyResearchIngress(options).handle(message);
    expect(sendText).toHaveBeenCalledOnce();
    expect(researchCompany).toHaveBeenCalledTimes(2);
    expect(options.markStatusReceiptTerminal).not.toHaveBeenCalled();
  });
});
