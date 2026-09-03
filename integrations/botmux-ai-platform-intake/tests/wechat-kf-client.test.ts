import { describe, expect, it, vi } from 'vitest';
import { WechatKfClient } from '../src/wechat-kf-client.js';

describe('WechatKfClient', () => {
  it('uses the callback token and persisted cursor to pull an inbound PDF message', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/cgi-bin/gettoken') {
        return Response.json({ errcode: 0, errmsg: 'ok', access_token: 'access-token', expires_in: 7200 });
      }
      if (url.pathname === '/cgi-bin/kf/sync_msg') {
        expect(url.searchParams.get('access_token')).toBe('access-token');
        expect(JSON.parse(String(init?.body))).toEqual({
          cursor: 'cursor-before',
          token: 'callback-sync-token',
          limit: 1000,
          open_kfid: 'wkAJ2GCAAAexample',
        });
        return Response.json({
          errcode: 0,
          errmsg: 'ok',
          next_cursor: 'cursor-after',
          has_more: 0,
          msg_list: [{
            msgid: 'message-1',
            open_kfid: 'wkAJ2GCAAAexample',
            external_userid: 'wmAJ2GCAAAcustomer',
            send_time: 1_788_000_000,
            origin: 3,
            msgtype: 'file',
            file: { media_id: 'media-1' },
          }],
        });
      }
      throw new Error(`unexpected_url:${url.pathname}`);
    });
    const client = new WechatKfClient({
      corpId: 'ww1234567890abcdef',
      secret: 'application-secret',
    }, fetcher);

    await expect(client.syncMessages({
      callbackToken: 'callback-sync-token',
      openKfid: 'wkAJ2GCAAAexample',
      cursor: 'cursor-before',
    })).resolves.toEqual({
      nextCursor: 'cursor-after',
      hasMore: false,
      recalledMessageIds: [],
      messages: [{
        messageId: 'message-1',
        openKfid: 'wkAJ2GCAAAexample',
        externalUserId: 'wmAJ2GCAAAcustomer',
        receivedAt: new Date(1_788_000_000_000).toISOString(),
        mediaId: 'media-1',
      }],
    });
  });

  it('supports cursor recovery without a callback token and reports recalled messages', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/cgi-bin/gettoken') {
        return Response.json({ errcode: 0, errmsg: 'ok', access_token: 'access-token', expires_in: 7200 });
      }
      if (url.pathname === '/cgi-bin/kf/sync_msg') {
        expect(JSON.parse(String(init?.body))).toEqual({
          cursor: 'cursor-before',
          limit: 1000,
          open_kfid: 'wkAJ2GCAAAexample',
        });
        return Response.json({
          errcode: 0,
          errmsg: 'ok',
          next_cursor: 'cursor-after',
          has_more: 0,
          msg_list: [
            {
              msgid: 'message-1',
              open_kfid: 'wkAJ2GCAAAexample',
              external_userid: 'wmAJ2GCAAAcustomer',
              send_time: 1_788_000_000,
              origin: 3,
              msgtype: 'file',
              file: { media_id: 'media-1' },
            },
            {
              msgid: 'recall-event-1',
              send_time: 1_788_000_001,
              origin: 4,
              msgtype: 'event',
              event: { event_type: 'user_recall_msg', recall_msgid: 'message-1' },
            },
          ],
        });
      }
      throw new Error(`unexpected_url:${url.pathname}`);
    });
    const client = new WechatKfClient({
      corpId: 'ww1234567890abcdef',
      secret: 'application-secret',
    }, fetcher);

    await expect(client.syncMessages({
      openKfid: 'wkAJ2GCAAAexample',
      cursor: 'cursor-before',
    })).resolves.toEqual({
      nextCursor: 'cursor-after',
      hasMore: false,
      messages: [{
        messageId: 'message-1',
        openKfid: 'wkAJ2GCAAAexample',
        externalUserId: 'wmAJ2GCAAAcustomer',
        receivedAt: new Date(1_788_000_000_000).toISOString(),
        mediaId: 'media-1',
      }],
      recalledMessageIds: ['message-1'],
    });
  });

  it('downloads the official temporary media and sends ordinary text to the same customer account', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/cgi-bin/gettoken') {
        return Response.json({ errcode: 0, errmsg: 'ok', access_token: 'access-token', expires_in: 7200 });
      }
      if (url.pathname === '/cgi-bin/media/get') {
        expect(url.searchParams.get('media_id')).toBe('media-1');
        return new Response(Buffer.from('%PDF-1.7\nfixture'), {
          headers: {
            'content-type': 'application/octet-stream',
            'content-disposition': "attachment; filename*=UTF-8''%E9%A1%B9%E7%9B%AE%20BP.pdf",
          },
        });
      }
      if (url.pathname === '/cgi-bin/kf/send_msg') {
        expect(JSON.parse(String(init?.body))).toEqual({
          touser: 'wmAJ2GCAAAcustomer',
          open_kfid: 'wkAJ2GCAAAexample',
          msgtype: 'text',
          text: { content: '正在分析项目材料…' },
        });
        return Response.json({ errcode: 0, errmsg: 'ok', msgid: 'reply-1' });
      }
      throw new Error(`unexpected_url:${url.pathname}`);
    });
    const client = new WechatKfClient({
      corpId: 'ww1234567890abcdef',
      secret: 'application-secret',
    }, fetcher);

    await expect(client.downloadMedia('media-1')).resolves.toEqual({
      buffer: Buffer.from('%PDF-1.7\nfixture'),
      filename: '项目 BP.pdf',
    });
    await expect(client.sendText({
      externalUserId: 'wmAJ2GCAAAcustomer',
      openKfid: 'wkAJ2GCAAAexample',
      content: '正在分析项目材料…',
    })).resolves.toBeUndefined();
    expect(fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname === '/cgi-bin/gettoken'))
      .toHaveLength(1);
  });
});
