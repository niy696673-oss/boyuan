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
import { validateAttachmentPath } from './file-security.js';
import type { IntakeAttachment, IntakeServiceConfig } from './types.js';
import type { WechatKfFileMessage } from './wechat-kf-client.js';

export interface WechatKfRuntimeCredentials {
  corpId: string;
  secret: string;
  callbackToken: string;
  encodingAESKey: string;
}

export function loadWechatKfCredentials(
  env: NodeJS.ProcessEnv = process.env,
): WechatKfRuntimeCredentials {
  const corpId = required(env.WECOM_CORP_ID, 'wechat_kf_corp_id_missing', 3, 64);
  if (!/^ww[A-Za-z0-9]{1,62}$/u.test(corpId)) throw new Error('wechat_kf_corp_id_invalid');
  const secret = required(env.WECHAT_KF_APP_SECRET, 'wechat_kf_app_secret_missing', 8, 1_024);
  const callbackToken = required(env.WECHAT_KF_CALLBACK_TOKEN, 'wechat_kf_callback_token_missing', 1, 32);
  if (!/^[A-Za-z0-9]+$/u.test(callbackToken)) throw new Error('wechat_kf_callback_token_invalid');
  const encodingAESKey = required(env.WECHAT_KF_ENCODING_AES_KEY, 'wechat_kf_encoding_aes_key_missing', 43, 43);
  if (!/^[A-Za-z0-9]{43}$/u.test(encodingAESKey)) throw new Error('wechat_kf_encoding_aes_key_invalid');
  return { corpId, secret, callbackToken, encodingAESKey };
}

export class WechatKfFileMaterializer {
  readonly #attachmentRoot: string;
  readonly #client: { downloadMedia(mediaId: string): Promise<{ buffer: Buffer; filename?: string }> };

  constructor(
    config: Pick<IntakeServiceConfig, 'attachmentRoot'>,
    client: { downloadMedia(mediaId: string): Promise<{ buffer: Buffer; filename?: string }> },
  ) {
    this.#attachmentRoot = realpathSync(config.attachmentRoot);
    this.#client = client;
  }

  async materialize(message: WechatKfFileMessage, fileKey: string): Promise<IntakeAttachment> {
    const directory = join(
      this.#attachmentRoot,
      createHash('sha256').update(message.messageId).digest('hex'),
    );
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stem = createHash('sha256').update(fileKey).digest('hex');
    const path = join(directory, `${stem}.pdf`);
    if (existsSync(path)) {
      return validateAttachmentPath({ fileKey, name: '微信客服项目材料.pdf', path }, this.#attachmentRoot);
    }
    const downloaded = await this.#client.downloadMedia(message.mediaId);
    if (downloaded.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('attachment_type_unsupported');
    }
    const fileName = safePdfName(downloaded.filename);
    const temporary = join(directory, `.${stem}.${randomUUID()}.part`);
    try {
      writeFileSync(temporary, downloaded.buffer, { mode: 0o600, flag: 'wx' });
      renameSync(temporary, path);
    } finally {
      rmSync(temporary, { force: true });
    }
    return validateAttachmentPath({ fileKey, name: fileName, path }, this.#attachmentRoot);
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

function safePdfName(value: string | undefined): string {
  const candidate = value ? basename(value.replace(/\\/gu, '/')).trim() : '';
  if (!candidate) return '微信客服项目材料.pdf';
  if (candidate.length > 500 || /[\r\n\0]/u.test(candidate) || extname(candidate).toLowerCase() !== '.pdf') {
    return '微信客服项目材料.pdf';
  }
  return candidate;
}

function required(
  value: string | undefined,
  code: string,
  minimumLength: number,
  maximumLength: number,
): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length < minimumLength || normalized.length > maximumLength || /[\r\n\0]/u.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}
