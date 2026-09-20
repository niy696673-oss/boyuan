import { ChannelConversation, type ChannelConversationOptions } from './channel-conversation.js';
import { parseFeishuFileMessage, parseFeishuTextMessage } from './direct-feishu-intake.js';
export { companyResearchKey } from './channel-conversation.js';
export interface FeishuConversationOptions extends ChannelConversationOptions { botOpenId: string }

/** Feishu envelope/mention rules only; dialogue, durable state and FIFO live in ChannelConversation. */
export class FeishuConversationIngress {
  readonly #core: ChannelConversation;
  constructor(private readonly options: FeishuConversationOptions) { this.#core = new ChannelConversation(options); }
  async handle(event: unknown): Promise<{ handled: boolean }> {
    const file = this.options.file ? parseFeishuFileMessage(event) : null;
    const message = file && file.senderId && /^ou_[A-Za-z0-9_-]{1,500}$/u.test(file.senderId)
      ? { chatId: file.chatId, senderId: file.senderId, messageId: file.messageId,
        receivedAt: file.receivedAt, text: `[上传文件] ${file.fileName}` }
      : parseFeishuTextMessage(event, new Date(), this.options.botOpenId);
    if (!message) return { handled: false };
    await this.#core.accept(message, file ?? undefined);
    return { handled: true };
  }
  has(messageId: string): boolean { return this.#core.has(messageId); }
  resumePending(): void { this.#core.resumePending(); }
  waitForIdle(): Promise<void> { return this.#core.waitForIdle(); }
}
