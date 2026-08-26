import { createHash } from 'node:crypto';
import { failureCard, processingCard } from './cards.js';
import type { IntakeAttachment, IntakeOutcome, IntakeTurn, Messenger, SendCardInput, UpdateCardInput } from './types.js';

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
  releaseAttachment?: (attachment: IntakeAttachment) => Promise<void> | void;
  ingestTurn(
    turn: IntakeTurn,
    options?: { releaseAttachment?: (attachment: IntakeAttachment) => Promise<void> },
  ): Promise<IntakeOutcome[]>;
  messenger?: Messenger;
  statusCardId?: (message: FeishuFileMessage) => string | undefined;
  rememberStatusCard?: (
    message: FeishuFileMessage,
    cardMessageId: string,
  ) => void;
  markStatusCardTerminal?: (message: FeishuFileMessage) => void;
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
  readonly #releaseAttachment: DirectFeishuFileIngressOptions['releaseAttachment'];
  readonly #ingestTurn: DirectFeishuFileIngressOptions['ingestTurn'];
  readonly #messenger: Messenger | undefined;
  readonly #statusCardId: DirectFeishuFileIngressOptions['statusCardId'];
  readonly #rememberStatusCard: DirectFeishuFileIngressOptions['rememberStatusCard'];
  readonly #markStatusCardTerminal: DirectFeishuFileIngressOptions['markStatusCardTerminal'];
  readonly #active = new Map<string, Promise<void>>();

  constructor(options: DirectFeishuFileIngressOptions) {
    this.#materialize = options.materialize;
    this.#releaseAttachment = options.releaseAttachment;
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
    let active = this.#active.get(message.messageId);
    if (!active) {
      active = this.#ingest(message);
      this.#active.set(message.messageId, active);
      void active.finally(() => this.#active.delete(message.messageId)).catch(() => undefined);
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
        responseKind: 'loading',
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
      }, {
        ...(this.#releaseAttachment
          ? { releaseAttachment: async (file: IntakeAttachment) => this.#releaseAttachment!(file) }
          : {}),
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

export class FeishuCardMessenger implements Messenger {
  readonly #transport: FeishuCardReplyPort;

  constructor(transport: FeishuCardReplyPort) {
    this.#transport = transport;
  }

  async sendCard(input: SendCardInput): Promise<{ messageId: string }> {
    const uuid = createHash('sha256').update('boyuan-luna-card\0').update(input.messageId).digest('hex').slice(0, 50);
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
