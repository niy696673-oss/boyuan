import { createCipheriv, createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWechatKfCallbackHandler } from '../src/wechat-kf-callback.js';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => (
    new Promise<void>((resolve) => server.close(() => resolve()))
  )));
});

describe('微信客服回调', () => {
  it('验证企业微信签名并返回解密后的 echostr', async () => {
    const token = 'callbackToken123';
    const corpId = 'ww567ed85eb0bcffde';
    const encodingAESKey = Buffer.from('0123456789abcdef0123456789abcdef')
      .toString('base64')
      .replace(/=$/u, '');
    const timestamp = '1788368400';
    const nonce = 'nonce-123';
    const echostr = encryptOfficialMessage('callback-ready', encodingAESKey, corpId);
    const signature = sign(token, timestamp, nonce, echostr);
    const handler = createWechatKfCallbackHandler({
      token,
      encodingAESKey,
      corpId,
      onEvent: async () => undefined,
    });
    const server = createServer(handler);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_missing');

    const url = new URL(`http://127.0.0.1:${address.port}/callback`);
    url.searchParams.set('msg_signature', signature);
    url.searchParams.set('timestamp', timestamp);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('echostr', echostr);
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('callback-ready');
  });

  it('确认事件后立即返回 success，并异步交给消息同步入口', async () => {
    const token = 'callbackToken123';
    const corpId = 'ww567ed85eb0bcffde';
    const encodingAESKey = Buffer.from('0123456789abcdef0123456789abcdef')
      .toString('base64')
      .replace(/=$/u, '');
    const timestamp = '1788368401';
    const nonce = 'nonce-456';
    const eventXml = [
      '<xml>',
      `<ToUserName><![CDATA[${corpId}]]></ToUserName>`,
      '<CreateTime>1788368401</CreateTime>',
      '<MsgType><![CDATA[event]]></MsgType>',
      '<Event><![CDATA[kf_msg_or_event]]></Event>',
      '<Token><![CDATA[sync-cursor-token]]></Token>',
      '<OpenKfId><![CDATA[wkAJ2GCAAAexample]]></OpenKfId>',
      '</xml>',
    ].join('');
    const encrypted = encryptOfficialMessage(eventXml, encodingAESKey, corpId);
    const signature = sign(token, timestamp, nonce, encrypted);
    const onEvent = vi.fn(async () => undefined);
    const handler = createWechatKfCallbackHandler({ token, encodingAESKey, corpId, onEvent });
    const server = createServer(handler);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_missing');

    const url = new URL(`http://127.0.0.1:${address.port}/callback`);
    url.searchParams.set('msg_signature', signature);
    url.searchParams.set('timestamp', timestamp);
    url.searchParams.set('nonce', nonce);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/xml' },
      body: `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('success');
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledOnce());
    expect(onEvent).toHaveBeenCalledWith({
      token: 'sync-cursor-token',
      openKfid: 'wkAJ2GCAAAexample',
    });
  });
});

function encryptOfficialMessage(message: string, encodingAESKey: string, corpId: string): string {
  const key = Buffer.from(`${encodingAESKey}=`, 'base64');
  const body = Buffer.from(message, 'utf8');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length);
  const unpadded = Buffer.concat([
    Buffer.from('0123456789abcdef', 'utf8'),
    size,
    body,
    Buffer.from(corpId, 'utf8'),
  ]);
  const padSize = 32 - (unpadded.length % 32);
  const padded = Buffer.concat([unpadded, Buffer.alloc(padSize, padSize)]);
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

function sign(token: string, timestamp: string, nonce: string, encrypted: string): string {
  return createHash('sha1')
    .update([token, timestamp, nonce, encrypted].sort().join(''))
    .digest('hex');
}
