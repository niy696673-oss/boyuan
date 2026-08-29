import { createHash } from 'node:crypto';
import {
  companyResearchFailureCard,
  companyResearchProcessingCard,
  failureCard,
  processingCard,
} from './cards.js';
import type {
  CompanyResearchTurn,
  IntakeAttachment,
  IntakeOutcome,
  IntakeTurn,
  Messenger,
  SendCardInput,
  UpdateCardInput,
} from './types.js';
import { COMPANY_RESEARCH_FILE_KEY } from './types.js';

export interface FeishuFileMessage {
  chatId: string;
  messageId: string;
  fileKey: string;
  fileName: string;
  receivedAt: string;
  senderId?: string;
}

export interface DirectFeishuFileIngressOptions {
  materialize(message: FeishuFileMessage): Promise<IntakeAttachment>;
  ingestTurn(turn: IntakeTurn): Promise<IntakeOutcome[]>;
  messenger?: Messenger;
  statusCardId?: (message: FeishuFileMessage) => string | undefined;
  rememberStatusCard?: (
    message: FeishuFileMessage,
    cardMessageId: string,
  ) => void;
  markStatusCardTerminal?: (message: FeishuFileMessage) => void;
}

export interface FeishuCompanyResearchMessage {
  chatId: string;
  messageId: string;
  companyName: string;
  receivedAt: string;
  senderId?: string;
}

export interface DirectFeishuCompanyResearchIngressOptions {
  botOpenId: string;
  researchCompany(turn: CompanyResearchTurn): Promise<IntakeOutcome>;
  messenger: Messenger;
  statusCardId(message: FeishuCompanyResearchMessage): string | undefined;
  rememberStatusCard(message: FeishuCompanyResearchMessage, cardMessageId: string): void;
  markStatusCardTerminal(message: FeishuCompanyResearchMessage): void;
}

export interface FeishuCardReplyPort {
  reply(input: {
    messageId: string;
    messageType: 'interactive';
    content: string;
    uuid: string;
  }): Promise<{ messageId: string }>;
  update(input: {
    cardMessageId: string;
    content: string;
  }): Promise<void>;
}

export class DirectFeishuFileIngress {
  readonly #materialize: DirectFeishuFileIngressOptions['materialize'];
  readonly #ingestTurn: DirectFeishuFileIngressOptions['ingestTurn'];
  readonly #messenger: Messenger | undefined;
  readonly #statusCardId: DirectFeishuFileIngressOptions['statusCardId'];
  readonly #rememberStatusCard: DirectFeishuFileIngressOptions['rememberStatusCard'];
  readonly #markStatusCardTerminal: DirectFeishuFileIngressOptions['markStatusCardTerminal'];
  readonly #active = new Map<string, Promise<void>>();

  constructor(options: DirectFeishuFileIngressOptions) {
    this.#materialize = options.materialize;
    this.#ingestTurn = options.ingestTurn;
    this.#messenger = options.messenger;
    this.#statusCardId = options.statusCardId;
    this.#rememberStatusCard = options.rememberStatusCard;
    this.#markStatusCardTerminal = options.markStatusCardTerminal;
    if (this.#messenger && (
      !this.#statusCardId
      || !this.#rememberStatusCard
      || !this.#markStatusCardTerminal
    )) {
      throw new Error('status_card_store_required');
    }
  }

  async handle(data: unknown): Promise<{ handled: boolean }> {
    const message = parseFeishuFileMessage(data);
    if (!message) return { handled: false };
    await this.#enqueue(message);
    return { handled: true };
  }

  async resume(message: FeishuFileMessage): Promise<void> {
    await this.#enqueue(message);
  }

  async #enqueue(message: FeishuFileMessage): Promise<void> {
    const key = `${message.messageId}\0${message.fileKey}`;
    let active = this.#active.get(key);
    if (!active) {
      active = this.#ingest(message);
      this.#active.set(key, active);
      void active.finally(() => this.#active.delete(key)).catch(() => undefined);
    }
    await active;
  }

  async #ingest(message: FeishuFileMessage): Promise<void> {
    const sessionId = `feishu:${message.messageId}`;
    let statusCardMessageId = this.#statusCardId?.(message);
    if (this.#messenger && !statusCardMessageId) {
      const status = await this.#messenger.sendCard({
        chatId: message.chatId,
        sessionId,
        messageId: message.messageId,
        fileKey: message.fileKey,
        responseKind: 'loading',
        cardKind: 'loading',
        card: processingCard(message.fileName),
      });
      if (!status?.messageId) throw new Error('status_card_message_id_missing');
      statusCardMessageId = status.messageId;
      this.#rememberStatusCard!(message, statusCardMessageId);
    }
    let attachment: IntakeAttachment | undefined;
    try {
      attachment = await this.#materialize(message);
      await this.#ingestTurn({
        chatId: message.chatId,
        sessionId,
        messageId: message.messageId,
        receivedAt: message.receivedAt,
        ...(message.senderId ? { senderId: message.senderId } : {}),
        ...(statusCardMessageId ? { statusCardMessageId } : {}),
        attachments: [attachment],
      });
    } catch (error) {
      if (statusCardMessageId && this.#messenger?.updateCard) {
        await this.#messenger.updateCard({
          cardMessageId: statusCardMessageId,
          card: failureCard(message.fileName),
        }).catch(() => undefined);
      }
      if (terminalIntakeError(error)) this.#markStatusCardTerminal?.(message);
      throw error;
    }
  }
}

export class DirectFeishuCompanyResearchIngress {
  readonly #botOpenId: string;
  readonly #researchCompany: DirectFeishuCompanyResearchIngressOptions['researchCompany'];
  readonly #messenger: Messenger;
  readonly #statusCardId: DirectFeishuCompanyResearchIngressOptions['statusCardId'];
  readonly #rememberStatusCard: DirectFeishuCompanyResearchIngressOptions['rememberStatusCard'];
  readonly #markStatusCardTerminal: DirectFeishuCompanyResearchIngressOptions['markStatusCardTerminal'];
  readonly #active = new Map<string, Promise<void>>();

  constructor(options: DirectFeishuCompanyResearchIngressOptions) {
    if (!/^ou_[A-Za-z0-9_-]{1,500}$/u.test(options.botOpenId)) {
      throw new Error('lark_bot_open_id_invalid');
    }
    this.#botOpenId = options.botOpenId;
    this.#researchCompany = options.researchCompany;
    this.#messenger = options.messenger;
    this.#statusCardId = options.statusCardId;
    this.#rememberStatusCard = options.rememberStatusCard;
    this.#markStatusCardTerminal = options.markStatusCardTerminal;
  }

  async handle(data: unknown): Promise<{ handled: boolean }> {
    const message = parseFeishuCompanyResearchMessage(data, new Date(), this.#botOpenId);
    if (!message) return { handled: false };
    await this.#enqueue(message);
    return { handled: true };
  }

  async resume(message: FeishuCompanyResearchMessage): Promise<void> {
    await this.#enqueue(message);
  }

  async #enqueue(message: FeishuCompanyResearchMessage): Promise<void> {
    let active = this.#active.get(message.messageId);
    if (!active) {
      active = this.#research(message);
      this.#active.set(message.messageId, active);
      void active.finally(() => this.#active.delete(message.messageId)).catch(() => undefined);
    }
    await active;
  }

  async #research(message: FeishuCompanyResearchMessage): Promise<void> {
    const sessionId = `feishu:${message.messageId}`;
    let statusCardMessageId = this.#statusCardId(message);
    if (!statusCardMessageId) {
      const status = await this.#messenger.sendCard({
        chatId: message.chatId,
        sessionId,
        messageId: message.messageId,
        fileKey: COMPANY_RESEARCH_FILE_KEY,
        responseKind: 'loading',
        cardKind: 'loading',
        card: companyResearchProcessingCard(message.companyName),
      });
      if (!status?.messageId) throw new Error('status_card_message_id_missing');
      statusCardMessageId = status.messageId;
      this.#rememberStatusCard(message, statusCardMessageId);
    }
    try {
      await this.#researchCompany({
        chatId: message.chatId,
        sessionId,
        messageId: message.messageId,
        companyName: message.companyName,
        receivedAt: message.receivedAt,
        ...(message.senderId ? { senderId: message.senderId } : {}),
        statusCardMessageId,
      });
    } catch (error) {
      if (this.#messenger.updateCard) {
        await this.#messenger.updateCard({
          cardMessageId: statusCardMessageId,
          card: companyResearchFailureCard(message.companyName),
        }).catch(() => undefined);
      }
      if (terminalCompanyResearchError(error)) this.#markStatusCardTerminal(message);
      throw error;
    }
  }
}

export class FeishuCardMessenger implements Messenger {
  readonly #transport: FeishuCardReplyPort;

  constructor(transport: FeishuCardReplyPort) {
    this.#transport = transport;
  }

  async sendCard(input: SendCardInput): Promise<{ messageId: string }> {
    const uuid = createHash('sha256')
      .update('boyuan-luna-card\0')
      .update(input.messageId)
      .update('\0')
      .update(input.fileKey)
      .update('\0')
      .update(input.responseKind)
      .update('\0')
      .update(input.cardKind)
      .digest('hex')
      .slice(0, 50);
    return this.#transport.reply({
      messageId: input.messageId,
      messageType: 'interactive',
      content: JSON.stringify(input.card),
      uuid,
    });
  }

  async updateCard(input: UpdateCardInput): Promise<void> {
    await this.#transport.update({
      cardMessageId: input.cardMessageId,
      content: JSON.stringify(input.card),
    });
  }
}

export function parseFeishuFileMessage(data: unknown, now = new Date()): FeishuFileMessage | null {
  const event = record(data);
  const sender = record(event?.sender);
  if (sender?.sender_type === 'app' || sender?.sender_type === 'bot') return null;
  const message = record(event?.message);
  if (!message || message.message_type !== 'file') return null;
  const messageId = text(message.message_id);
  const chatId = text(message.chat_id);
  const rawContent = text(message.content);
  if (!messageId || !/^om_[A-Za-z0-9_-]{1,500}$/u.test(messageId)
    || !chatId || !/^oc_[A-Za-z0-9_-]{1,500}$/u.test(chatId) || !rawContent) return null;
  let content: Record<string, unknown> | null;
  try { content = record(JSON.parse(rawContent) as unknown); } catch { return null; }
  const fileKey = text(content?.file_key);
  const fileName = text(content?.file_name);
  if (!fileKey || fileKey.length > 500 || !fileName || fileName.length > 500 || /[\r\n]/u.test(fileName)) return null;
  const senderId = text(record(sender?.sender_id)?.open_id);
  return {
    chatId,
    messageId,
    fileKey,
    fileName,
    receivedAt: feishuTimestamp(message.create_time, now),
    ...(senderId ? { senderId } : {}),
  };
}

export function parseFeishuCompanyResearchMessage(
  data: unknown,
  now = new Date(),
  botOpenId?: string,
): FeishuCompanyResearchMessage | null {
  const event = record(data);
  const sender = record(event?.sender);
  if (sender?.sender_type === 'app' || sender?.sender_type === 'bot') return null;
  const message = record(event?.message);
  if (!message || message.message_type !== 'text') return null;
  const messageId = text(message.message_id);
  const chatId = text(message.chat_id);
  const rawContent = text(message.content);
  if (!messageId || !/^om_[A-Za-z0-9_-]{1,500}$/u.test(messageId)
    || !chatId || !/^oc_[A-Za-z0-9_-]{1,500}$/u.test(chatId) || !rawContent) return null;
  let content: Record<string, unknown> | null;
  try { content = record(JSON.parse(rawContent) as unknown); } catch { return null; }
  let command = text(content?.text);
  if (!command || /[\r\n]/u.test(command)) return null;
  const chatType = text(message.chat_type);
  const mentions = Array.isArray(message.mentions)
    ? message.mentions.flatMap((value) => {
        const mention = record(value);
        const key = text(mention?.key);
        const openId = text(record(mention?.id)?.open_id);
        return key ? [{ key, openId }] : [];
      })
    : [];
  if (chatType === 'group' && (
    !botOpenId || !mentions.some((mention) => mention.openId === botOpenId)
  )) return null;
  for (const mention of mentions) command = command.split(mention.key).join(' ');
  command = command.replace(/\s+/gu, ' ').trim();
  const match = /^(?:分析|研究)(?:一下|下)?\s*[：:]?\s*(.{2,80})$/u.exec(command);
  const companyName = match?.[1]?.trim();
  if (!companyName || /[\r\n]/u.test(companyName)) return null;
  const senderId = text(record(sender?.sender_id)?.open_id);
  return {
    chatId,
    messageId,
    companyName,
    receivedAt: feishuTimestamp(message.create_time, now),
    ...(senderId ? { senderId } : {}),
  };
}

function feishuTimestamp(value: unknown, fallback: Date): string {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback.toISOString();
  const timestamp = parsed < 10_000_000_000 ? parsed * 1_000 : parsed;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback.toISOString();
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function terminalIntakeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return message === 'attachment_type_unsupported'
    || message.startsWith('attachment_symlink_')
    || message.startsWith('attachment_path_');
}

function terminalCompanyResearchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return message === 'platform_http_400';
}
