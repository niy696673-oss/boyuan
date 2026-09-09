import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCompanyListExtractor, imageMime, isCompanyListText, parseCompanyList } from '../src/company-list-extractor.js';
import { WechatKfCompanyBatch, renderBatch, type CompanyBatchOptions } from '../src/wechat-kf-company-batch.js';
import { WechatKfClient } from '../src/wechat-kf-client.js';
import { MemoryWechatKfCursorStore, WechatKfMessagePump } from '../src/wechat-kf-pump.js';
import { companyQuickCard, conversation, tempDir } from './helpers.js';

const input = { messageId: 'list-1', externalUserId: 'customer', openKfid: 'wk-account', receivedAt: new Date().toISOString(), text: '分析以下公司：\n宁德时代\n比亚迪' };
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function fixture(path: string) {
  const sendText = vi.fn(async (_value: { content: string }) => undefined);
  const options: CompanyBatchOptions = {
    statePath: join(path, 'batch.json'), publicProductUrl: 'https://restaurant-west-enter-far.trycloudflare.com',
    client: { sendText, downloadMedia: vi.fn(async () => ({ buffer: png })) },
    extractor: { extract: vi.fn(async () => ({ companies: ['宁德时代', '比亚迪'], uncertain: ['模糊公司'] })) },
    platform: {
      startCompanyResearch: vi.fn(async (turn) => ({ conversation: conversation(turn.companyName), reusedResearch: false })),
      companyQuickCard: vi.fn(async () => companyQuickCard()),
    }, onError: vi.fn(),
  };
  return { options, sendText };
}

describe('company list extraction', () => {
  it.each(['宁德时代、比亚迪', '宁德时代，比亚迪', '1. 宁德时代\n2. 比亚迪', '分析宁德时代和比亚迪'])('routes %s to extraction', (text) => {
    expect(isCompanyListText(text)).toBe(true);
  });
  it('preserves single-company routing and deduplicates names without inventing entities', () => {
    expect(isCompanyListText('分析宁德时代')).toBe(false);
    expect(parseCompanyList('{"companies":[" Acme ","ACME","比亚迪"],"uncertain":["模糊"]}')).toEqual({ companies: ['Acme', '比亚迪'], uncertain: ['模糊'] });
    expect(() => parseCompanyList('{"companies":[12],"uncertain":[]}')).toThrow();
  });
  it('rejects unsupported/oversized images', () => {
    expect(imageMime(png)).toBe('image/png');
    expect(() => imageMime(Buffer.from('%PDF-fake-image'))).toThrow();
    expect(() => imageMime(Buffer.alloc(2 * 1024 * 1024 + 1))).toThrow();
  });
  it('uses a tool-free vision request with image bytes, not an external attachment URL', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).includes('/message')) {
        const body = JSON.parse(String(init?.body));
        expect(body.tools).toEqual({ '*': false });
        expect(body.parts[1]).toMatchObject({ type: 'file', mime: 'image/png', url: `data:image/png;base64,${png.toString('base64')}` });
        return Response.json({ info: {}, parts: [{ type: 'text', text: '{"companies":["宁德时代"],"uncertain":[]}' }] });
      }
      return Response.json({ id: 'session-1' });
    });
    const extractor = createCompanyListExtractor({ baseUrl: new URL('http://127.0.0.1:4173/'), directory: '/runtime', model: { providerId: 'openai', modelId: 'luna' }, fetcher });
    expect(await extractor.extract({ image: png })).toEqual({ companies: ['宁德时代'], uncertain: [] });
  });
});

describe('durable company batches', () => {
  it('acknowledges once, limits concurrency, starts one research per company and summarizes links', async () => {
    const temp = tempDir();
    try {
      const { options, sendText } = fixture(temp.path);
      let active = 0; let max = 0;
      options.platform.companyQuickCard = vi.fn(async () => {
        active++; max = Math.max(max, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--; return companyQuickCard();
      });
      const batch = new WechatKfCompanyBatch(options);
      await batch.handle(input); await batch.handle(input); await batch.waitForIdle();
      const restarted = new WechatKfCompanyBatch(options);
      await restarted.handle(input); await restarted.waitForIdle();
      expect(options.extractor.extract).toHaveBeenCalledOnce();
      expect(options.platform.startCompanyResearch).toHaveBeenCalledTimes(2);
      expect(max).toBe(2);
      expect(sendText).toHaveBeenCalledTimes(2);
      const final = sendText.mock.calls[1]![0].content;
      expect(final).toContain('宁德时代'); expect(final).toContain('比亚迪');
      expect(final).toContain('/workbench/conversations/'); expect(final).toContain('名称不清晰');
    } finally { temp.cleanup(); }
  });
  it('resumes failed delivery after restart without rerunning research or repeating the processing message', async () => {
    const temp = tempDir();
    try {
      const { options, sendText } = fixture(temp.path);
      sendText.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('wechat_kf_api_95001')).mockResolvedValue(undefined);
      const batch = new WechatKfCompanyBatch(options);
      await batch.handle(input); await batch.waitForIdle();
      const restarted = new WechatKfCompanyBatch(options);
      restarted.resumePending(); await restarted.waitForIdle();
      expect(options.platform.startCompanyResearch).toHaveBeenCalledTimes(2);
      expect(sendText).toHaveBeenCalledTimes(3);
      expect(sendText.mock.calls[1]).toEqual(sendText.mock.calls[2]);
      const state = JSON.parse(readFileSync(options.statePath, 'utf8'));
      expect(Object.values(state.jobs).every((job: any) => job.done)).toBe(true);
    } finally { temp.cleanup(); }
  });
  it.each(['empty', 'overflow', 'error'])('returns an actionable %s result without starting research', async (kind) => {
    const temp = tempDir();
    try {
      const { options, sendText } = fixture(temp.path);
      options.extractor.extract = vi.fn(async () => {
        if (kind === 'error') throw new Error('model_failed');
        return { companies: kind === 'overflow' ? Array.from({ length: 21 }, (_, i) => `公司${i}`) : [], uncertain: [] };
      });
      const batch = new WechatKfCompanyBatch(options);
      await batch.handle(input); await batch.waitForIdle();
      expect(options.platform.startCompanyResearch).not.toHaveBeenCalled();
      expect(sendText).toHaveBeenCalledTimes(2);
      expect(sendText.mock.calls[1]![0].content).toContain('未启动分析');
    } finally { temp.cleanup(); }
  });
  it('continues after one company fails and includes its existing deep research link', async () => {
    const temp = tempDir();
    try {
      const { options, sendText } = fixture(temp.path);
      options.platform.companyQuickCard = vi.fn().mockRejectedValueOnce(new Error('quick_failed')).mockResolvedValue(companyQuickCard());
      const batch = new WechatKfCompanyBatch(options);
      await batch.handle(input); await batch.waitForIdle();
      expect(sendText.mock.calls[1]![0].content).toContain('快速分析完成 1 家');
      expect(sendText.mock.calls[1]![0].content).toContain('深度研究已启动');
    } finally { temp.cleanup(); }
  });
  it('keeps a worst-case 20-company summary inside four 2048-byte replies', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ name: '公司'.repeat(40), summary: '产品'.repeat(80), risk: '风险'.repeat(80), conversationId: `12345678-1234-1234-1234-${String(i).padStart(12, '0')}`, done: true }));
    const pages = renderBatch(items, ['文字'.repeat(80)], 'https://restaurant-west-enter-far.trycloudflare.com');
    expect(pages.length).toBeLessThanOrEqual(4);
    expect(pages.every((page) => Buffer.byteLength(page) <= 2048)).toBe(true);
    expect(pages.join('\n').match(/\/workbench\/conversations\//gu)).toHaveLength(20);
  });
  it('pulls images from sync, filters recalled images, and dispatches only the active image', async () => {
    const temp = tempDir();
    try {
      const { options } = fixture(temp.path);
      const batch = new WechatKfCompanyBatch(options);
      const client = new WechatKfClient({ corpId: 'ww1234567890abcdef', secret: 'secret' }, vi.fn(async (url) => {
        if (String(url).includes('gettoken')) return Response.json({ errcode: 0, access_token: 'token', expires_in: 7200 });
        const wire = (id: string) => ({ msgid: id, open_kfid: 'wk-account', external_userid: 'customer', origin: 3, msgtype: 'image', send_time: 1788900000, image: { media_id: `media-${id}` } });
        return Response.json({ errcode: 0, has_more: 0, next_cursor: 'after', msg_list: [wire('recalled'), wire('image'), { origin: 4, msgtype: 'event', event: { event_type: 'user_recall_msg', recall_msgid: 'recalled' } }] });
      }));
      const pump = new WechatKfMessagePump({ client, cursorStore: new MemoryWechatKfCursorStore(), ingress: { handle: (m) => 'imageMediaId' in m ? batch.handle(m) : Promise.reject(new Error('unexpected')) } });
      await pump.handleEvent({ openKfid: 'wk-account', token: 'token' }); await batch.waitForIdle();
      expect(options.client.downloadMedia).toHaveBeenCalledExactlyOnceWith('media-image');
      expect(options.extractor.extract).toHaveBeenCalledWith({ image: png });
    } finally { temp.cleanup(); }
  });
});
