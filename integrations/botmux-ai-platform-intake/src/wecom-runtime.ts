import { WSClient, type WsFrame } from '@wecom/aibot-node-sdk';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { WeComFileMessage } from './direct-wecom-intake.js';
import { validateAttachmentPath } from './file-security.js';
import type { IntakeAttachment, WeComBotPort, WeComIntakeConfig } from './types.js';
export type { WeComBotPort } from './types.js';

export interface WeComBotCredentials {
  botId: string;
  secret: string;
}

export interface WeComEventRuntime extends WeComBotPort {
  start(onMessage: (frame: unknown) => Promise<unknown>, onError: (error: unknown) => void): void;
  connectionState(): string;
  close(): void;
}

const SUPPORTED_EXTENSIONS = new Set(['.csv', '.docx', '.pdf', '.xlsx']);

export function loadWeComCredentials(
  env: NodeJS.ProcessEnv = process.env,
): WeComBotCredentials {
  const botId = secretValue(env.WECOM_BOT_ID, 'wecom_bot_id_missing', 1);
  const secret = secretValue(env.WECOM_BOT_SECRET, 'wecom_bot_secret_missing', 8);
  return { botId, secret };
}

export class OfficialWeComTransport implements WeComEventRuntime {
  readonly #client: WSClient;
  #state = 'idle';
  #started = false;

  constructor(config: WeComIntakeConfig, credentials: WeComBotCredentials) {
    this.#client = new WSClient({
      botId: credentials.botId,
      secret: credentials.secret,
      ...(config.wsUrl ? { wsUrl: config.wsUrl } : {}),
      reconnectInterval: 1_000,
      maxReconnectAttempts: -1,
      maxAuthFailureAttempts: 5,
      heartbeatInterval: 30_000,
      requestTimeout: Math.min(config.timeoutMs, 30_000),
      logger: quietLogger([credentials.botId, credentials.secret]),
    });
  }

  start(onMessage: (frame: unknown) => Promise<unknown>, onError: (error: unknown) => void): void {
    if (this.#started) throw new Error('wecom_runtime_already_started');
    this.#started = true;
    this.#state = 'connecting';
    const dispatch = (frame: unknown) => { void onMessage(frame).catch(onError); };
    this.#client.on('message.text', dispatch);
    this.#client.on('message.file', dispatch);
    this.#client.on('connected', () => { this.#state = 'connected'; });
    this.#client.on('authenticated', () => { this.#state = 'authenticated'; });
    this.#client.on('reconnecting', (attempt) => { this.#state = `reconnecting:${attempt}`; });
    this.#client.on('disconnected', () => { this.#state = 'disconnected'; });
    this.#client.on('error', onError);
    this.#client.connect();
  }

  async replyStream(
    reqId: string,
    streamId: string,
    content: string,
    finish: boolean,
  ): Promise<void> {
    await this.#client.replyStream({ headers: { req_id: reqId } }, streamId, content, finish);
  }

  async sendMarkdown(chatId: string, content: string): Promise<void> {
    await this.#client.sendMessage(chatId, {
      msgtype: 'markdown',
      markdown: { content },
    });
  }

  downloadFile(url: string, aesKey?: string): Promise<{ buffer: Buffer; filename?: string }> {
    return this.#client.downloadFile(url, aesKey);
  }

  connectionState(): string {
    return this.#client.isConnected ? this.#state : this.#state === 'idle' ? 'idle' : 'disconnected';
  }

  close(): void {
    this.#client.disconnect();
    this.#started = false;
    this.#state = 'closed';
  }
}

export class WeComFileMaterializer {
  readonly #attachmentRoot: string;
  readonly #transport: Pick<WeComBotPort, 'downloadFile'>;

  constructor(
    config: Pick<WeComIntakeConfig, 'attachmentRoot'>,
    transport: Pick<WeComBotPort, 'downloadFile'>,
  ) {
    this.#attachmentRoot = realpathSync(config.attachmentRoot);
    this.#transport = transport;
  }

  async materialize(message: WeComFileMessage): Promise<IntakeAttachment> {
    const directory = join(
      this.#attachmentRoot,
      createHash('sha256').update(message.messageId).digest('hex'),
    );
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stem = createHash('sha256').update(message.fileKey).digest('hex');
    const cached = findCachedPath(directory, stem);
    if (cached) {
      return validateAttachmentPath({
        fileKey: message.fileKey,
        name: `企业微信项目材料${extname(cached).toLowerCase()}`,
        path: cached,
      }, this.#attachmentRoot);
    }

    const downloaded = await this.#transport.downloadFile(message.downloadUrl, message.aesKey);
    const fileName = safeDownloadedName(downloaded.filename, downloaded.buffer);
    const extension = extname(fileName).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error('attachment_type_unsupported');
    const path = join(directory, `${stem}${extension}`);
    const temporary = join(directory, `.${stem}.${randomUUID()}.part`);
    try {
      writeFileSync(temporary, downloaded.buffer, { mode: 0o600, flag: 'wx' });
      renameSync(temporary, path);
    } finally {
      rmSync(temporary, { force: true });
    }
    return validateAttachmentPath({ fileKey: message.fileKey, name: fileName, path }, this.#attachmentRoot);
  }

  async release(attachment: IntakeAttachment): Promise<void> {
    let lastError: unknown;
    for (const delayMs of [0, 100, 500]) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        const safe = validateAttachmentPath(attachment, this.#attachmentRoot);
        rmSync(safe.path, { force: true });
        try {
          rmSync(dirname(safe.path), { recursive: false });
        } catch (error) {
          const code = errorCode(error);
          if (code !== 'ENOENT' && code !== 'ENOTEMPTY') throw error;
        }
        return;
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return;
        lastError = error;
      }
    }
    throw new Error('attachment_cleanup_failed', { cause: lastError });
  }
}

function safeDownloadedName(filename: string | undefined, buffer: Buffer): string {
  const candidate = filename ? basename(filename.replace(/\\/gu, '/')).trim() : '';
  if (candidate && candidate.length <= 500 && !/[\r\n\0]/u.test(candidate)) return candidate;
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return '企业微信项目材料.pdf';
  throw new Error('attachment_name_missing');
}

function findCachedPath(directory: string, stem: string): string | undefined {
  for (const extension of SUPPORTED_EXTENSIONS) {
    const candidate = join(directory, `${stem}${extension}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function secretValue(value: string | undefined, code: string, minimumLength: number): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length < minimumLength || normalized.length > 1_024 || /[\r\n]/u.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}

function quietLogger(redactions: string[]) {
  const write = (level: 'warn' | 'error', message: string) => {
    const safe = redactions.reduce((current, secret) => current.split(secret).join('[redacted]'), message);
    process.stderr.write(`[wecom-sdk:${level}] ${safe.slice(0, 300)}\n`);
  };
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: (message: string) => write('warn', message),
    error: (message: string) => write('error', message),
  };
}

export type WeComSdkFrame = WsFrame;
