import { describe, expect, it, vi } from 'vitest';
import { WechatKfClient } from '../src/wechat-kf-client.js';

describe('WechatKfClient', () => {
  it('passes stable outgoing message IDs and rejects malformed IDs before network calls', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).includes('gettoken')) return Response.json({ errcode: 0, access_token: 'token', expires_in: 7200 });
      expect(JSON.parse(String(init?.body))).toMatchObject({ msgid: 'stable_123', text: { content: 'reply' } });
      return Response.json({ errcode: 0, msgid: 'stable_123' });
    });
    const client = new WechatKfClient({ corpId: 'ww1234567890abcdef', secret: 'secret' }, fetcher);
    const message = { openKfid: 'kf-account', externalUserId: 'customer', content: 'reply' };
    await expect(client.sendText({ ...message, msgid: '../invalid' })).rejects.toThrow('wechat_kf_msgid_invalid');
    expect(fetcher).not.toHaveBeenCalled();
    await client.sendText({ ...message, msgid: 'stable_123' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
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

  it('syncs enter_session events and extracts welcome_code', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/cgi-bin/gettoken') {
        return Response.json({ errcode: 0, errmsg: 'ok', access_token: 'access-token', expires_in: 7200 });
      }
      if (url.pathname === '/cgi-bin/kf/sync_msg') {
        return Response.json({
          errcode: 0,
          errmsg: 'ok',
          next_cursor: 'cursor-2',
          has_more: 0,
          msg_list: [
            {
              msgid: 'event-msg-1',
              open_kfid: 'wkAJ2GCAAAexample',
              external_userid: 'wmAJ2GCAAAsomeone',
              send_time: 1_788_000_000,
              origin: 4,
              msgtype: 'event',
              event: {
                event_type: 'enter_session',
                open_kfid: 'wkAJ2GCAAAexample',
                external_userid: 'wmAJ2GCAAAsomeone',
                welcome_code: 'code_welcome_123',
                scene: '1',
              },
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

    const page = await client.syncMessages({
      openKfid: 'wkAJ2GCAAAexample',
      cursor: 'cursor-1',
    });
    expect(page.enterSessionEvents).toEqual([
      {
        openKfid: 'wkAJ2GCAAAexample',
        externalUserId: 'wmAJ2GCAAAsomeone',
        welcomeCode: 'code_welcome_123',
        scene: '1',
      },
    ]);
  });

  it('sends event response message using sendMsgOnEvent', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/cgi-bin/gettoken') {
        return Response.json({ errcode: 0, errmsg: 'ok', access_token: 'access-token', expires_in: 7200 });
      }
      if (url.pathname === '/cgi-bin/kf/send_msg_on_event') {
        expect(JSON.parse(String(init?.body))).toEqual({
          code: 'code_welcome_123',
          msgtype: 'text',
          text: { content: '欢迎使用博源 AI 平台！' },
        });
        return Response.json({ errcode: 0, errmsg: 'ok', msgid: 'event-reply-1' });
      }
      throw new Error(`unexpected_url:${url.pathname}`);
    });
    const client = new WechatKfClient({
      corpId: 'ww1234567890abcdef',
      secret: 'application-secret',
    }, fetcher);

    await expect(client.sendMsgOnEvent({
      code: 'code_welcome_123',
      content: '欢迎使用博源 AI 平台！',
    })).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
