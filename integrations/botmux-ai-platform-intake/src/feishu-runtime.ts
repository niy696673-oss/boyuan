import * as Lark from '@larksuiteoapi/node-sdk';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ProxyAgent } from 'proxy-agent';
import type { IntakeConfig } from './types.js';
import type { FeishuCardReplyPort, FeishuFileMessage } from './direct-feishu-intake.js';
import { validateAttachmentPath } from './file-security.js';

export interface BotmuxLarkCredentials {
  appId: string;
  appSecret: string;
  brand: 'feishu' | 'lark';
}

interface BotmuxBotConfig {
  larkAppId?: unknown;
  larkAppSecret?: unknown;
  brand?: unknown;
  apiOnly?: unknown;
}

interface LarkRequestClient {
  request(input: Record<string, unknown>): Promise<unknown>;
  im: {
    v1: {
      message: {
        reply(input: Record<string, unknown>): Promise<{ code?: number; msg?: string; data?: { message_id?: string } }>;
        patch(input: Record<string, unknown>): Promise<{ code?: number; msg?: string }>;
      };
    };
  };
}

const SUPPORTED_EXTENSIONS = new Set(['.csv', '.docx', '.pdf', '.xlsx']);

export function loadBotmuxLarkCredentials(config: IntakeConfig): BotmuxLarkCredentials {
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(config.botmuxConfigPath, 'utf8')) as unknown; }
  catch { throw new Error('botmux_config_unreadable'); }
  if (!Array.isArray(parsed)) throw new Error('botmux_config_invalid');
  const bot = parsed.find((candidate): candidate is BotmuxBotConfig => {
    return !!candidate && typeof candidate === 'object'
      && (candidate as BotmuxBotConfig).larkAppId === config.larkAppId;
  });
  if (!bot) throw new Error('lark_bot_not_found');
  if (bot.apiOnly !== true) throw new Error('lark_bot_must_be_api_only');
  if (typeof bot.larkAppSecret !== 'string' || bot.larkAppSecret.length < 8) throw new Error('lark_app_secret_missing');
  return {
    appId: config.larkAppId,
    appSecret: bot.larkAppSecret,
    brand: bot.brand === 'lark' ? 'lark' : 'feishu',
  };
}

export class LarkFeishuTransport implements FeishuCardReplyPort {
  readonly #config: IntakeConfig;
  readonly #credentials: BotmuxLarkCredentials;
  readonly #client: LarkRequestClient;
  #ws: Lark.WSClient | undefined;
  #reviveTimer: NodeJS.Timeout | undefined;

  constructor(config: IntakeConfig, credentials: BotmuxLarkCredentials) {
    this.#config = config;
    this.#credentials = credentials;
    this.#client = new Lark.Client({
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      domain: openApiDomain(credentials.brand),
      loggerLevel: Lark.LoggerLevel.warn,
    }) as unknown as LarkRequestClient;
  }

  async materialize(message: FeishuFileMessage) {
    const extension = extname(message.fileName).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error('attachment_type_unsupported');
    const directory = join(this.#config.attachmentRoot, message.messageId);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stem = createHash('sha256').update(message.fileKey).digest('hex');
    const path = join(directory, `${stem}${extension}`);
    if (!existsSync(path)) {
      const temporary = join(directory, `.${stem}.${randomUUID()}.part`);
      try {
        const response = await this.#client.request({
          method: 'GET',
          url: `/open-apis/im/v1/messages/${encodeURIComponent(message.messageId)}/resources/${encodeURIComponent(message.fileKey)}`,
          params: { type: 'file' },
          responseType: 'stream',
        });
        await writeDownload(response, temporary);
        renameSync(temporary, path);
      } finally {
        rmSync(temporary, { force: true });
      }
    }
    return validateAttachmentPath({ fileKey: message.fileKey, name: message.fileName, path }, this.#config.attachmentRoot);
  }

  async release(attachment: Awaited<ReturnType<LarkFeishuTransport['materialize']>>): Promise<void> {
    let lastError: unknown;
    for (const delayMs of [0, 100, 500]) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        const safe = validateAttachmentPath(attachment, this.#config.attachmentRoot);
        rmSync(safe.path, { force: true });
        try {
          rmSync(dirname(safe.path), { recursive: false });
        } catch (error) {
          const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
          if (code !== 'ENOENT' && code !== 'ENOTEMPTY') throw error;
        }
        return;
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        if (code === 'ENOENT') return;
        lastError = error;
      }
    }
    throw new Error('attachment_cleanup_failed', { cause: lastError });
  }

  async reply(input: Parameters<FeishuCardReplyPort['reply']>[0]): Promise<{ messageId: string }> {
    const response = await this.#client.im.v1.message.reply({
      path: { message_id: input.messageId },
      data: {
        msg_type: input.messageType,
        content: input.content,
        uuid: input.uuid,
      },
    });
    if (typeof response.code === 'number' && response.code !== 0) {
      throw new Error(`lark_reply_failed_${response.code}`);
    }
    const messageId = response.data?.message_id;
    if (!messageId) throw new Error('lark_reply_message_id_missing');
    return { messageId };
  }

  async update(input: Parameters<FeishuCardReplyPort['update']>[0]): Promise<void> {
    const response = await this.#client.im.v1.message.patch({
      path: { message_id: input.cardMessageId },
      data: { content: input.content },
    });
    if (typeof response.code === 'number' && response.code !== 0) {
      throw new Error(`lark_update_failed_${response.code}`);
    }
  }

  async botOpenId(): Promise<string> {
    const response = await this.#client.request({
      method: 'GET',
      url: '/open-apis/bot/v3/info',
    });
    const source = response && typeof response === 'object' && !Array.isArray(response)
      ? response as Record<string, unknown>
      : undefined;
    const bot = source?.bot && typeof source.bot === 'object' && !Array.isArray(source.bot)
      ? source.bot as Record<string, unknown>
      : undefined;
    const openId = typeof bot?.open_id === 'string' ? bot.open_id : '';
    if (!/^ou_[A-Za-z0-9_-]{1,500}$/u.test(openId)) {
      throw new Error('lark_bot_open_id_missing');
    }
    return openId;
  }

  start(onMessage: (data: unknown) => Promise<unknown>, onError: (error: unknown) => void): void {
    if (this.#ws) throw new Error('lark_runtime_already_started');
    const dispatcher = new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': (data) => {
        void onMessage(data).catch(onError);
      },
    });
    const ws = new Lark.WSClient({
      appId: this.#credentials.appId,
      appSecret: this.#credentials.appSecret,
      domain: openApiDomain(this.#credentials.brand),
      agent: createLarkWsAgent(),
      loggerLevel: Lark.LoggerLevel.warn,
      wsConfig: { pingTimeout: 30 },
      handshakeTimeoutMs: 15_000,
      onError: onError,
    });
    this.#ws = ws;
    void ws.start({ eventDispatcher: dispatcher }).catch(onError);
    this.#reviveTimer = setInterval(() => {
      if (ws.getConnectionStatus().state === 'failed') void ws.start({ eventDispatcher: dispatcher }).catch(onError);
    }, 60_000);
    this.#reviveTimer.unref();
  }

  connectionState(): string {
    return this.#ws?.getConnectionStatus().state ?? 'idle';
  }

  close(): void {
    if (this.#reviveTimer) clearInterval(this.#reviveTimer);
    this.#reviveTimer = undefined;
    this.#ws?.close({ force: true });
    this.#ws = undefined;
  }
}

async function writeDownload(response: unknown, path: string): Promise<void> {
  if (Buffer.isBuffer(response)) {
    writeFileSync(path, response, { mode: 0o600, flag: 'wx' });
    return;
  }
  if (response && typeof response === 'object' && 'writeFile' in response
    && typeof (response as { writeFile?: unknown }).writeFile === 'function') {
    await (response as { writeFile(path: string): Promise<void> }).writeFile(path);
    return;
  }
  if (!response || typeof response !== 'object' || !('pipe' in response)) throw new Error('lark_download_invalid_response');
  await pipeline(response as NodeJS.ReadableStream, createWriteStream(path, { flags: 'wx', mode: 0o600 }));
}

function openApiDomain(brand: 'feishu' | 'lark'): string {
  return brand === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn';
}

function createLarkWsAgent(): ProxyAgent | undefined {
  const proxyKeys = ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY'];
  if (!proxyKeys.some((key) => process.env[key]?.trim())) return undefined;
  const agent = new ProxyAgent();
  const resolveProxy = agent.getProxyForUrl;
  agent.getProxyForUrl = (url, request) => {
    const target = new URL(url);
    if (target.protocol === 'wss:') target.protocol = 'https:';
    if (target.protocol === 'ws:') target.protocol = 'http:';
    return resolveProxy(target.href, request);
  };
  return agent;
}
