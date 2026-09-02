export interface WechatKfCredentials {
  corpId: string;
  secret: string;
}

export interface WechatKfFileMessage {
  messageId: string;
  openKfid: string;
  externalUserId: string;
  receivedAt: string;
  mediaId: string;
}

export interface WechatKfSyncPage {
  nextCursor: string;
  hasMore: boolean;
  messages: WechatKfFileMessage[];
}

interface AccessToken {
  value: string;
  expiresAt: number;
}

const API_ORIGIN = 'https://qyapi.weixin.qq.com';

export class WechatKfClient {
  readonly #credentials: WechatKfCredentials;
  readonly #fetch: typeof fetch;
  readonly #nowMs: () => number;
  #accessToken?: AccessToken;

  constructor(
    credentials: WechatKfCredentials,
    fetcher: typeof fetch = fetch,
    nowMs: () => number = Date.now,
  ) {
    this.#credentials = validateCredentials(credentials);
    this.#fetch = fetcher;
    this.#nowMs = nowMs;
  }

  async syncMessages(input: {
    callbackToken: string;
    openKfid: string;
    cursor?: string;
  }): Promise<WechatKfSyncPage> {
    const callbackToken = requiredString(input.callbackToken, 128, 'wechat_kf_callback_sync_token_invalid');
    const openKfid = requiredString(input.openKfid, 256, 'wechat_kf_open_kfid_invalid');
    const cursor = input.cursor
      ? requiredString(input.cursor, 64, 'wechat_kf_cursor_invalid')
      : undefined;
    const payload = await this.#requestJson('/cgi-bin/kf/sync_msg', {
      ...(cursor ? { cursor } : {}),
      token: callbackToken,
      limit: 1_000,
      open_kfid: openKfid,
    });
    const nextCursor = requiredString(payload.next_cursor, 64, 'wechat_kf_next_cursor_invalid');
    if (payload.has_more !== 0 && payload.has_more !== 1) throw new Error('wechat_kf_has_more_invalid');
    if (!Array.isArray(payload.msg_list)) throw new Error('wechat_kf_message_list_invalid');
    return {
      nextCursor,
      hasMore: payload.has_more === 1,
      messages: payload.msg_list.flatMap((value) => {
        const message = record(value);
        const file = record(message?.file);
        if (message?.origin !== 3 || message?.msgtype !== 'file' || !file) return [];
        const messageId = optionalString(message.msgid, 512);
        const messageOpenKfid = optionalString(message.open_kfid, 256);
        const externalUserId = optionalString(message.external_userid, 256);
        const mediaId = optionalString(file.media_id, 2_048);
        const timestamp = typeof message.send_time === 'number' || typeof message.send_time === 'string'
          ? Number(message.send_time)
          : Number.NaN;
        if (!messageId || !messageOpenKfid || !externalUserId || !mediaId || !Number.isFinite(timestamp) || timestamp <= 0) {
          return [];
        }
        return [{
          messageId,
          openKfid: messageOpenKfid,
          externalUserId,
          mediaId,
          receivedAt: new Date(timestamp < 10_000_000_000 ? timestamp * 1_000 : timestamp).toISOString(),
        }];
      }),
    };
  }

  async downloadMedia(mediaIdValue: string): Promise<{ buffer: Buffer; filename?: string }> {
    const mediaId = requiredString(mediaIdValue, 2_048, 'wechat_kf_media_id_invalid');
    const url = new URL('/cgi-bin/media/get', API_ORIGIN);
    url.searchParams.set('access_token', await this.#getAccessToken());
    url.searchParams.set('media_id', mediaId);
    const response = await this.#fetch(url);
    if (!response.ok) throw new Error(`wechat_kf_media_http_${response.status}`);
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('application/json')) {
      const payload = record(await response.json());
      const errcode = Number(payload?.errcode);
      throw new Error(`wechat_kf_media_api_${Number.isInteger(errcode) ? errcode : 'invalid'}`);
    }
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > 20 * 1_024 * 1_024) {
      throw new Error('wechat_kf_media_too_large');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 20 * 1_024 * 1_024) throw new Error('wechat_kf_media_size_invalid');
    const filename = contentDispositionFilename(response.headers.get('content-disposition'));
    return { buffer, ...(filename ? { filename } : {}) };
  }

  async sendText(input: {
    externalUserId: string;
    openKfid: string;
    content: string;
  }): Promise<void> {
    const externalUserId = requiredString(input.externalUserId, 256, 'wechat_kf_external_userid_invalid');
    const openKfid = requiredString(input.openKfid, 256, 'wechat_kf_open_kfid_invalid');
    const content = boundedMultilineText(input.content, 2_048, 'wechat_kf_text_invalid');
    await this.#requestJson('/cgi-bin/kf/send_msg', {
      touser: externalUserId,
      open_kfid: openKfid,
      msgtype: 'text',
      text: { content },
    });
  }

  async #requestJson(pathname: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const token = await this.#getAccessToken();
    const url = new URL(pathname, API_ORIGIN);
    url.searchParams.set('access_token', token);
    const response = await this.#fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`wechat_kf_http_${response.status}`);
    const payload = record(await response.json());
    if (!payload) throw new Error('wechat_kf_response_invalid');
    const errcode = Number(payload.errcode);
    if (!Number.isInteger(errcode) || errcode !== 0) throw new Error(`wechat_kf_api_${Number.isInteger(errcode) ? errcode : 'invalid'}`);
    return payload;
  }

  async #getAccessToken(): Promise<string> {
    if (this.#accessToken && this.#accessToken.expiresAt > this.#nowMs()) return this.#accessToken.value;
    const url = new URL('/cgi-bin/gettoken', API_ORIGIN);
    url.searchParams.set('corpid', this.#credentials.corpId);
    url.searchParams.set('corpsecret', this.#credentials.secret);
    const response = await this.#fetch(url);
    if (!response.ok) throw new Error(`wechat_kf_token_http_${response.status}`);
    const payload = record(await response.json());
    const errcode = Number(payload?.errcode);
    if (!payload || !Number.isInteger(errcode) || errcode !== 0) {
      throw new Error(`wechat_kf_token_api_${Number.isInteger(errcode) ? errcode : 'invalid'}`);
    }
    const value = requiredString(payload.access_token, 2_048, 'wechat_kf_access_token_invalid');
    const expiresIn = Number(payload.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn < 60) throw new Error('wechat_kf_access_token_expiry_invalid');
    this.#accessToken = {
      value,
      expiresAt: this.#nowMs() + Math.max(30, expiresIn - 300) * 1_000,
    };
    return value;
  }
}

function validateCredentials(value: WechatKfCredentials): WechatKfCredentials {
  const corpId = requiredString(value.corpId, 64, 'wechat_kf_corp_id_invalid');
  if (!/^ww[A-Za-z0-9]{1,62}$/u.test(corpId)) throw new Error('wechat_kf_corp_id_invalid');
  const secret = requiredString(value.secret, 1_024, 'wechat_kf_secret_invalid');
  return { corpId, secret };
}

function requiredString(value: unknown, maxLength: number, code: string): string {
  const parsed = optionalString(value, maxLength);
  if (!parsed) throw new Error(code);
  return parsed;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = value.trim();
  return parsed && parsed.length <= maxLength && !/[\r\n\0]/u.test(parsed) ? parsed : undefined;
}

function boundedMultilineText(value: unknown, maxLength: number, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const parsed = value.trim();
  if (!parsed || Buffer.byteLength(parsed, 'utf8') > maxLength || /\0/u.test(parsed)) throw new Error(code);
  return parsed;
}

function contentDispositionFilename(header: string | null): string | undefined {
  if (!header || header.length > 4_096) return undefined;
  const encoded = /(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]+)/iu.exec(header)?.[1];
  if (encoded) {
    try {
      return safeFilename(decodeURIComponent(encoded.trim().replace(/^"|"$/gu, '')));
    } catch {
      return undefined;
    }
  }
  const plain = /(?:^|;)\s*filename\s*=\s*(?:"([^"]+)"|([^;]+))/iu.exec(header);
  return safeFilename((plain?.[1] ?? plain?.[2] ?? '').trim());
}

function safeFilename(value: string): string | undefined {
  const normalized = value.replace(/\\/gu, '/').split('/').at(-1)?.trim() ?? '';
  return normalized && normalized.length <= 500 && !/[\r\n\0]/u.test(normalized)
    ? normalized
    : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
