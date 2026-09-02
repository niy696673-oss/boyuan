import {
  createDecipheriv,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';

export interface WechatKfCallbackEvent {
  token: string;
  openKfid?: string;
}

export interface WechatKfCallbackOptions {
  token: string;
  encodingAESKey: string;
  corpId: string;
  onEvent(event: WechatKfCallbackEvent): Promise<void>;
  onError?(error: unknown): void;
}

export function createWechatKfCallbackHandler(options: WechatKfCallbackOptions): RequestListener {
  const cryptor = new WechatKfCryptor(options);
  return (request, response) => {
    void handleRequest(request, response, cryptor, options).catch(() => {
      respond(response, 400, 'invalid_callback');
    });
  };
}

class WechatKfCryptor {
  readonly #token: string;
  readonly #key: Buffer;
  readonly #corpId: Buffer;

  constructor(options: Pick<WechatKfCallbackOptions, 'token' | 'encodingAESKey' | 'corpId'>) {
    if (!/^[A-Za-z0-9]{1,32}$/u.test(options.token)) throw new Error('invalid_wechat_kf_callback_token');
    if (!/^[A-Za-z0-9]{43}$/u.test(options.encodingAESKey)) {
      throw new Error('invalid_wechat_kf_encoding_aes_key');
    }
    if (!/^ww[A-Za-z0-9]{1,62}$/u.test(options.corpId)) throw new Error('invalid_wechat_kf_corp_id');
    this.#token = options.token;
    this.#key = Buffer.from(`${options.encodingAESKey}=`, 'base64');
    if (this.#key.length !== 32) throw new Error('invalid_wechat_kf_encoding_aes_key');
    this.#corpId = Buffer.from(options.corpId, 'utf8');
  }

  verifyAndDecrypt(signature: string, timestamp: string, nonce: string, encrypted: string): string {
    const expected = createHash('sha1')
      .update([this.#token, timestamp, nonce, encrypted].sort().join(''))
      .digest();
    const supplied = /^[a-f0-9]{40}$/u.test(signature)
      ? Buffer.from(signature, 'hex')
      : Buffer.alloc(0);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new Error('wechat_kf_signature_invalid');
    }
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    const decipher = createDecipheriv('aes-256-cbc', this.#key, this.#key.subarray(0, 16));
    decipher.setAutoPadding(false);
    const padded = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
    const plain = removePkcs7Padding(padded);
    if (plain.length < 20) throw new Error('wechat_kf_message_invalid');
    const messageLength = plain.readUInt32BE(16);
    const messageEnd = 20 + messageLength;
    if (messageEnd > plain.length) throw new Error('wechat_kf_message_invalid');
    const corpId = plain.subarray(messageEnd);
    if (corpId.length !== this.#corpId.length || !timingSafeEqual(corpId, this.#corpId)) {
      throw new Error('wechat_kf_corp_id_mismatch');
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(plain.subarray(20, messageEnd));
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  cryptor: WechatKfCryptor,
  options: WechatKfCallbackOptions,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/callback') {
    respond(response, 404, 'not_found');
    return;
  }
  const signature = requiredQuery(url, 'msg_signature', 40);
  const timestamp = requiredQuery(url, 'timestamp', 20);
  const nonce = requiredQuery(url, 'nonce', 200);
  if (request.method === 'GET') {
    const echostr = requiredQuery(url, 'echostr', 16_384);
    const value = cryptor.verifyAndDecrypt(signature, timestamp, nonce, echostr);
    respond(response, 200, value);
    return;
  }
  if (request.method !== 'POST') {
    respond(response, 404, 'not_found');
    return;
  }
  const envelope = await readBody(request, 128 * 1_024);
  const encrypted = xmlElement(envelope, 'Encrypt', 96 * 1_024);
  const eventXml = cryptor.verifyAndDecrypt(signature, timestamp, nonce, encrypted);
  const event = parseEvent(eventXml);
  respond(response, 200, 'success');
  setImmediate(() => {
    void options.onEvent(event).catch((error) => options.onError?.(error));
  });
}

function requiredQuery(url: URL, name: string, maxLength: number): string {
  const value = url.searchParams.get(name)?.trim();
  if (!value || value.length > maxLength || /[\r\n\0]/u.test(value)) {
    throw new Error(`invalid_${name}`);
  }
  return value;
}

function removePkcs7Padding(value: Buffer): Buffer {
  const padding = value.at(-1) ?? 0;
  if (padding < 1 || padding > 32 || value.length < padding) {
    throw new Error('wechat_kf_padding_invalid');
  }
  for (let index = value.length - padding; index < value.length; index += 1) {
    if (value[index] !== padding) throw new Error('wechat_kf_padding_invalid');
  }
  return value.subarray(0, value.length - padding);
}

async function readBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error('wechat_kf_callback_too_large');
    chunks.push(buffer);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

function parseEvent(xml: string): WechatKfCallbackEvent {
  if (Buffer.byteLength(xml, 'utf8') > 64 * 1_024) throw new Error('wechat_kf_event_too_large');
  const msgType = xmlElement(xml, 'MsgType', 32);
  const eventName = xmlElement(xml, 'Event', 64);
  if (msgType !== 'event' || eventName !== 'kf_msg_or_event') {
    throw new Error('wechat_kf_event_invalid');
  }
  const token = xmlElement(xml, 'Token', 4_096);
  const openKfid = optionalXmlElement(xml, 'OpenKfId', 256);
  return { token, ...(openKfid ? { openKfid } : {}) };
}

function optionalXmlElement(xml: string, name: string, maxLength: number): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pattern = new RegExp(`<${escapedName}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${escapedName}>`, 'u');
  const match = pattern.exec(xml);
  if (!match) return undefined;
  const value = decodeXmlEntities(match[1] ?? match[2] ?? '').trim();
  if (!value || value.length > maxLength || /[\0]/u.test(value)) {
    throw new Error(`wechat_kf_${name}_invalid`);
  }
  return value;
}

function xmlElement(xml: string, name: string, maxLength: number): string {
  const value = optionalXmlElement(xml, name, maxLength);
  if (!value) throw new Error(`wechat_kf_${name}_missing`);
  return value;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function respond(response: ServerResponse, status: number, body: string): void {
  if (response.headersSent) return;
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(body);
}
