import { createHash } from 'node:crypto';
import type { WechatKfFileMessage } from './wechat-kf-client.js';
import type {
  FailureDeliveryInput,
  IntakeAttachment,
  IntakeDelivery,
  IntakeOutcome,
  IntakeTurn,
} from './types.js';
import {
  renderWeComCompletion,
  wecomFailureText,
  wecomProcessingText,
} from './wecom-text.js';

export interface WechatKfTextPort {
  sendText(input: {
    externalUserId: string;
    openKfid: string;
    content: string;
  }): Promise<void>;
}

interface WechatKfIngressStore {
  statusReceiptId(messageId: string, fileKey: string): string | undefined;
  statusReceiptTerminal(messageId: string, fileKey: string): boolean;
  rememberStatusReceipt(input: {
    chatId: string;
    messageId: string;
    fileKey: string;
    fileName: string;
    receipt: string;
    createdAt: string;
    senderId: string;
    metadata?: Record<string, string>;
  }): void;
  markStatusReceiptTerminal(messageId: string, fileKey: string): void;
}

export interface DirectWechatKfFileIngressOptions extends WechatKfIngressStore {
  materialize(message: WechatKfFileMessage, fileKey: string): Promise<IntakeAttachment>;
  ingestTurn(turn: IntakeTurn): Promise<IntakeOutcome[]>;
  delivery: WechatKfTextDelivery;
}

interface WechatKfReceipt {
  externalUserId: string;
  openKfid: string;
}

const RECEIPT_PREFIX = 'wechat-kf:v1:';
const MAX_TEXT_BYTES = 2_048;
const MAX_FINAL_MESSAGES = 3;

export class WechatKfTextDelivery implements IntakeDelivery {
  readonly #port: WechatKfTextPort;

  constructor(port: WechatKfTextPort) {
    this.#port = port;
  }

  async openProcessing(input: WechatKfFileMessage & { fileKey: string }): Promise<string> {
    const receipt = encodeReceipt({
      externalUserId: input.externalUserId,
      openKfid: input.openKfid,
    });
    await this.#port.sendText({
      externalUserId: input.externalUserId,
      openKfid: input.openKfid,
      content: wecomProcessingText('bp'),
    });
    return receipt;
  }

  async complete(input: Parameters<IntakeDelivery['complete']>[0]): Promise<void> {
    const receipt = requiredReceipt(input.statusReceipt);
    for (const content of splitText(renderWeComCompletion(input))) {
      await this.#port.sendText({ ...receipt, content });
    }
  }

  async fail(input: FailureDeliveryInput): Promise<void> {
    const receipt = requiredReceipt(input.statusReceipt);
    await this.#port.sendText({
      ...receipt,
      content: input.kind === 'bp'
        ? `【博源AI】“${input.subject}”接入失败，请确认文件可正常打开且为不超过 20MB 的 PDF 后重试。`
        : wecomFailureText(input.kind, input.subject),
    });
  }
}

export class DirectWechatKfFileIngress {
  readonly #options: DirectWechatKfFileIngressOptions;
  readonly #active = new Map<string, Promise<void>>();

  constructor(options: DirectWechatKfFileIngressOptions) {
    this.#options = options;
  }

  async handle(message: WechatKfFileMessage): Promise<void> {
    let active = this.#active.get(message.messageId);
    if (!active) {
      active = this.#ingest(message);
      this.#active.set(message.messageId, active);
      void active.finally(() => this.#active.delete(message.messageId)).catch(() => undefined);
    }
    await active;
  }

  async #ingest(message: WechatKfFileMessage): Promise<void> {
    const fileKey = createHash('sha256')
      .update('wechat-kf-file\0')
      .update(message.messageId)
      .digest('hex')
      .slice(0, 48);
    if (this.#options.statusReceiptTerminal(message.messageId, fileKey)) return;
    let receipt = this.#options.statusReceiptId(message.messageId, fileKey);
    if (!receipt) {
      receipt = await this.#options.delivery.openProcessing({ ...message, fileKey });
      this.#options.rememberStatusReceipt({
        chatId: message.externalUserId,
        messageId: message.messageId,
        fileKey,
        fileName: '微信客服项目材料',
        receipt,
        createdAt: message.receivedAt,
        senderId: message.externalUserId,
        metadata: {
          openKfid: message.openKfid,
          mediaId: message.mediaId,
        },
      });
    }
    try {
      const attachment = await this.#options.materialize(message, fileKey);
      const outcomes = await this.#options.ingestTurn({
        chatId: message.externalUserId,
        sessionId: `wechat-kf:${message.messageId}`,
        messageId: message.messageId,
        receivedAt: message.receivedAt,
        senderId: message.externalUserId,
        statusCardMessageId: receipt,
        attachments: [attachment],
      });
      if (outcomes.some((outcome) => outcome.status === 'failed')) {
        this.#options.markStatusReceiptTerminal(message.messageId, fileKey);
      }
    } catch (error) {
      await this.#options.delivery.fail({
        kind: 'bp',
        chatId: message.externalUserId,
        sessionId: `wechat-kf:${message.messageId}`,
        messageId: message.messageId,
        fileKey,
        statusReceipt: receipt,
        subject: '微信客服项目材料',
      });
      this.#options.markStatusReceiptTerminal(message.messageId, fileKey);
      return;
    }
  }
}

function encodeReceipt(receipt: WechatKfReceipt): string {
  return `${RECEIPT_PREFIX}${Buffer.from(JSON.stringify(receipt), 'utf8').toString('base64url')}`;
}

function requiredReceipt(value: string | undefined): WechatKfReceipt {
  if (!value?.startsWith(RECEIPT_PREFIX) || value.length > 4_096) throw new Error('wechat_kf_receipt_invalid');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value.slice(RECEIPT_PREFIX.length), 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new Error('wechat_kf_receipt_invalid');
  }
  const record = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : undefined;
  const externalUserId = boundedText(record?.externalUserId, 256);
  const openKfid = boundedText(record?.openKfid, 256);
  if (!externalUserId || !openKfid) throw new Error('wechat_kf_receipt_invalid');
  return { externalUserId, openKfid };
}

function splitText(value: string): string[] {
  if (Buffer.byteLength(value, 'utf8') <= MAX_TEXT_BYTES) return [value];
  if (Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES * MAX_FINAL_MESSAGES) {
    throw new Error('wechat_kf_text_too_large');
  }
  const chunks: string[] = [];
  let rest = value;
  while (rest) {
    const remainingSlots = MAX_FINAL_MESSAGES - chunks.length;
    if (remainingSlots <= 0) throw new Error('wechat_kf_text_too_large');
    const totalBytes = Buffer.byteLength(rest, 'utf8');
    if (totalBytes <= MAX_TEXT_BYTES) {
      chunks.push(rest);
      break;
    }
    const minimumBytes = Math.max(0, totalBytes - (remainingSlots - 1) * MAX_TEXT_BYTES);
    let bytes = 0;
    let index = 0;
    let preferred = 0;
    for (const character of rest) {
      const next = Buffer.byteLength(character, 'utf8');
      if (bytes + next > MAX_TEXT_BYTES) break;
      bytes += next;
      index += character.length;
      if (character === '\n' && bytes >= minimumBytes) preferred = index;
    }
    const end = preferred || index;
    if (end <= 0) throw new Error('wechat_kf_text_split_failed');
    chunks.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  return chunks;
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength && !/[\r\n\0]/u.test(normalized)
    ? normalized
    : undefined;
}
