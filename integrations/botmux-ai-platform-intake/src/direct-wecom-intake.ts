import { createHash } from 'node:crypto';
import type {
  CompanyResearchTurn,
  FailureDeliveryInput,
  IntakeAttachment,
  IntakeDelivery,
  IntakeOutcome,
  IntakeTurn,
  WeComBotPort,
} from './types.js';
import { COMPANY_RESEARCH_FILE_KEY } from './types.js';
import {
  renderWeComCompletion,
  wecomFailureText,
  wecomProcessingText,
} from './wecom-text.js';

export interface WeComFileMessage {
  reqId: string;
  chatId: string;
  messageId: string;
  fileKey: string;
  receivedAt: string;
  senderId: string;
  downloadUrl: string;
  aesKey?: string;
}

export interface WeComCompanyResearchMessage {
  reqId: string;
  chatId: string;
  messageId: string;
  companyName: string;
  receivedAt: string;
  senderId: string;
}

interface WeComIngressStore {
  statusReceiptId(messageId: string, fileKey: string): string | undefined;
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

export interface DirectWeComFileIngressOptions extends WeComIngressStore {
  materialize(message: WeComFileMessage): Promise<IntakeAttachment>;
  ingestTurn(turn: IntakeTurn): Promise<IntakeOutcome[]>;
  delivery: WeComTextDelivery;
}

export interface DirectWeComCompanyResearchIngressOptions extends WeComIngressStore {
  researchCompany(turn: CompanyResearchTurn): Promise<IntakeOutcome>;
  delivery: WeComTextDelivery;
}

interface WeComReplyReceipt {
  reqId: string;
  streamId: string;
  chatId: string;
}

const RECEIPT_PREFIX = 'wecom:v1:';

export class WeComTextDelivery implements IntakeDelivery {
  readonly #transport: WeComBotPort;

  constructor(transport: WeComBotPort) {
    this.#transport = transport;
  }

  async openProcessing(input: {
    reqId: string;
    chatId: string;
    messageId: string;
    fileKey: string;
    kind: 'bp' | 'company_research';
    subject?: string;
  }): Promise<string> {
    const streamId = createHash('sha256')
      .update('boyuan-wecom-stream\0')
      .update(input.messageId)
      .update('\0')
      .update(input.fileKey)
      .digest('hex')
      .slice(0, 48);
    await this.#transport.replyStream(
      input.reqId,
      streamId,
      wecomProcessingText(input.kind, input.subject),
      false,
    );
    return encodeReceipt({ reqId: input.reqId, streamId, chatId: input.chatId });
  }

  async complete(input: Parameters<IntakeDelivery['complete']>[0]): Promise<void> {
    await this.#sendFinal(
      input.chatId,
      input.statusReceipt,
      renderWeComCompletion(input),
    );
  }

  async fail(input: FailureDeliveryInput): Promise<void> {
    await this.#sendFinal(
      input.chatId,
      input.statusReceipt,
      wecomFailureText(input.kind, input.subject),
    );
  }

  async #sendFinal(chatId: string, receiptValue: string | undefined, content: string): Promise<void> {
    if (!receiptValue) {
      await this.#transport.sendMarkdown(chatId, content);
      return;
    }
    const receipt = decodeReceipt(receiptValue);
    if (receipt.chatId !== chatId) throw new Error('wecom_receipt_chat_mismatch');
    await this.#transport.replyStream(receipt.reqId, receipt.streamId, content, true);
  }
}

export class DirectWeComFileIngress {
  readonly #options: DirectWeComFileIngressOptions;
  readonly #active = new Map<string, Promise<void>>();

  constructor(options: DirectWeComFileIngressOptions) {
    this.#options = options;
  }

  async handle(frame: unknown): Promise<{ handled: boolean }> {
    const message = parseWeComFileMessage(frame);
    if (!message) return { handled: false };
    await this.#enqueue(message);
    return { handled: true };
  }

  async resume(message: WeComFileMessage): Promise<void> {
    await this.#enqueue(message);
  }

  async #enqueue(message: WeComFileMessage): Promise<void> {
    const key = `${message.messageId}\0${message.fileKey}`;
    let active = this.#active.get(key);
    if (!active) {
      active = this.#ingest(message);
      this.#active.set(key, active);
      void active.finally(() => this.#active.delete(key)).catch(() => undefined);
    }
    await active;
  }

  async #ingest(message: WeComFileMessage): Promise<void> {
    const sessionId = `wecom:${message.messageId}`;
    let receipt = this.#options.statusReceiptId(message.messageId, message.fileKey);
    if (!receipt) {
      receipt = await this.#options.delivery.openProcessing({
        reqId: message.reqId,
        chatId: message.chatId,
        messageId: message.messageId,
        fileKey: message.fileKey,
        kind: 'bp',
      });
      this.#options.rememberStatusReceipt({
        chatId: message.chatId,
        messageId: message.messageId,
        fileKey: message.fileKey,
        fileName: '企业微信项目材料',
        receipt,
        createdAt: message.receivedAt,
        senderId: message.senderId,
        metadata: {
          reqId: message.reqId,
          downloadUrl: message.downloadUrl,
          ...(message.aesKey ? { aesKey: message.aesKey } : {}),
        },
      });
    }
    try {
      const attachment = await this.#options.materialize(message);
      const outcomes = await this.#options.ingestTurn({
        chatId: message.chatId,
        sessionId,
        messageId: message.messageId,
        receivedAt: message.receivedAt,
        senderId: message.senderId,
        statusCardMessageId: receipt,
        attachments: [attachment],
      });
      if (outcomes.some((outcome) => outcome.status === 'failed')) {
        this.#options.markStatusReceiptTerminal(message.messageId, message.fileKey);
      }
    } catch (error) {
      await this.#options.delivery.fail({
        kind: 'bp',
        chatId: message.chatId,
        sessionId,
        messageId: message.messageId,
        fileKey: message.fileKey,
        statusReceipt: receipt,
        subject: '企业微信项目材料',
      });
      this.#options.markStatusReceiptTerminal(message.messageId, message.fileKey);
      throw error;
    }
  }
}

export class DirectWeComCompanyResearchIngress {
  readonly #options: DirectWeComCompanyResearchIngressOptions;
  readonly #active = new Map<string, Promise<void>>();

  constructor(options: DirectWeComCompanyResearchIngressOptions) {
    this.#options = options;
  }

  async handle(frame: unknown): Promise<{ handled: boolean }> {
    const message = parseWeComCompanyResearchMessage(frame);
    if (!message) return { handled: false };
    await this.#enqueue(message);
    return { handled: true };
  }

  async resume(message: WeComCompanyResearchMessage): Promise<void> {
    await this.#enqueue(message);
  }

  async #enqueue(message: WeComCompanyResearchMessage): Promise<void> {
    let active = this.#active.get(message.messageId);
    if (!active) {
      active = this.#research(message);
      this.#active.set(message.messageId, active);
      void active.finally(() => this.#active.delete(message.messageId)).catch(() => undefined);
    }
    await active;
  }

  async #research(message: WeComCompanyResearchMessage): Promise<void> {
    const sessionId = `wecom:${message.messageId}`;
    let receipt = this.#options.statusReceiptId(message.messageId, COMPANY_RESEARCH_FILE_KEY);
    if (!receipt) {
      receipt = await this.#options.delivery.openProcessing({
        reqId: message.reqId,
        chatId: message.chatId,
        messageId: message.messageId,
        fileKey: COMPANY_RESEARCH_FILE_KEY,
        kind: 'company_research',
        subject: message.companyName,
      });
      this.#options.rememberStatusReceipt({
        chatId: message.chatId,
        messageId: message.messageId,
        fileKey: COMPANY_RESEARCH_FILE_KEY,
        fileName: message.companyName,
        receipt,
        createdAt: message.receivedAt,
        senderId: message.senderId,
        metadata: { reqId: message.reqId },
      });
    }
    try {
      await this.#options.researchCompany({
        chatId: message.chatId,
        sessionId,
        messageId: message.messageId,
        companyName: message.companyName,
        receivedAt: message.receivedAt,
        senderId: message.senderId,
        statusCardMessageId: receipt,
      });
    } catch (error) {
      await this.#options.delivery.fail({
        kind: 'company_research',
        chatId: message.chatId,
        sessionId,
        messageId: message.messageId,
        fileKey: COMPANY_RESEARCH_FILE_KEY,
        statusReceipt: receipt,
        subject: message.companyName,
      });
      this.#options.markStatusReceiptTerminal(message.messageId, COMPANY_RESEARCH_FILE_KEY);
      throw error;
    }
  }
}

export function parseWeComFileMessage(frame: unknown, now = new Date()): WeComFileMessage | null {
  const parsed = parseBaseFrame(frame, 'file', now);
  if (!parsed) return null;
  const file = record(parsed.body.file);
  const downloadUrl = secureDownloadUrl(file?.url);
  if (!downloadUrl) return null;
  const aesKey = boundedText(file?.aeskey, 1_024);
  return {
    ...parsed.message,
    fileKey: createHash('sha256')
      .update('wecom-file\0')
      .update(parsed.message.messageId)
      .digest('hex')
      .slice(0, 48),
    downloadUrl,
    ...(aesKey ? { aesKey } : {}),
  };
}

export function parseWeComCompanyResearchMessage(
  frame: unknown,
  now = new Date(),
): WeComCompanyResearchMessage | null {
  const parsed = parseBaseFrame(frame, 'text', now);
  if (!parsed) return null;
  const command = boundedText(record(parsed.body.text)?.content, 200)?.replace(/\s+/gu, ' ').trim();
  const match = command ? /^(?:分析|研究)(?:一下|下)?\s*[：:]?\s*(.{2,80})$/u.exec(command) : null;
  const companyName = match?.[1]?.trim();
  if (!companyName || /[\r\n]/u.test(companyName)) return null;
  return { ...parsed.message, companyName };
}

function parseBaseFrame(
  frame: unknown,
  messageType: 'file' | 'text',
  now: Date,
): { body: Record<string, unknown>; message: Omit<WeComFileMessage, 'fileKey' | 'downloadUrl' | 'aesKey'> } | null {
  const source = record(frame);
  const headers = record(source?.headers);
  const body = record(source?.body);
  const from = record(body?.from);
  const reqId = boundedText(headers?.req_id, 500);
  const messageId = boundedText(body?.msgid, 500);
  const senderId = boundedText(from?.userid, 500);
  const chatType = body?.chattype;
  if (!reqId || !messageId || !senderId || body?.msgtype !== messageType
    || (chatType !== 'single' && chatType !== 'group')) return null;
  const chatId = chatType === 'group' ? boundedText(body.chatid, 500) : senderId;
  if (!chatId) return null;
  return {
    body,
    message: {
      reqId,
      chatId,
      messageId,
      senderId,
      receivedAt: wecomTimestamp(body.create_time, now),
    },
  };
}

function encodeReceipt(receipt: WeComReplyReceipt): string {
  return `${RECEIPT_PREFIX}${Buffer.from(JSON.stringify(receipt), 'utf8').toString('base64url')}`;
}

function decodeReceipt(value: string): WeComReplyReceipt {
  if (!value.startsWith(RECEIPT_PREFIX) || value.length > 4_096) throw new Error('wecom_receipt_invalid');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value.slice(RECEIPT_PREFIX.length), 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new Error('wecom_receipt_invalid');
  }
  const source = record(parsed);
  const reqId = boundedText(source?.reqId, 500);
  const streamId = boundedText(source?.streamId, 100);
  const chatId = boundedText(source?.chatId, 500);
  if (!reqId || !streamId || !chatId) throw new Error('wecom_receipt_invalid');
  return { reqId, streamId, chatId };
}

function secureDownloadUrl(value: unknown): string | undefined {
  const raw = boundedText(value, 4_096);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength && !/[\r\n\0]/u.test(normalized)
    ? normalized
    : undefined;
}

function wecomTimestamp(value: unknown, fallback: Date): string {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback.toISOString();
  const timestamp = parsed < 10_000_000_000 ? parsed * 1_000 : parsed;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback.toISOString();
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
