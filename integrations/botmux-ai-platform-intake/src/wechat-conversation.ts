import { createHash } from 'node:crypto';
import { ChannelConversation, type ChannelConversationOptions, type ConversationMessage, type ConversationFile } from './channel-conversation.js';
import { wechatKfFileKey } from './direct-wechat-kf-intake.js';
import type { WechatKfFileMessage, WechatKfInboundMessage } from './wechat-kf-client.js';

export function wechatConversationMessage(input: WechatKfInboundMessage): ConversationMessage {
  const digest = (parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return {
    chatId: `wechat-kf:${digest([input.openKfid, input.externalUserId])}`,
    senderId: input.externalUserId,
    messageId: `wechat-kf:${digest([input.openKfid, input.externalUserId, input.messageId])}`,
    receivedAt: input.receivedAt,
    text: 'text' in input ? input.text : '[上传文件] 微信客服项目材料.pdf',
    context: { openKfid: input.openKfid, externalUserId: input.externalUserId, sourceMessageId: input.messageId,
      ...('mediaId' in input ? { mediaId: input.mediaId } : {}) },
  };
}

export function wechatFileInput(message: ConversationFile): WechatKfFileMessage {
  return { ...wechatRoute(message), conversationChatId: message.chatId, messageId: message.messageId, receivedAt: message.receivedAt,
    mediaId: required(message.context?.mediaId) };
}

export function wechatRoute(message: Pick<ConversationMessage, 'context'>): { openKfid: string; externalUserId: string } {
  return { openKfid: required(message.context?.openKfid), externalUserId: required(message.context?.externalUserId) };
}

/** Normalize Tencent envelopes, acknowledge only after durable enqueue, then let the shared engine work. */
export class WechatConversationIngress {
  readonly #core: ChannelConversation;
  constructor(private readonly options: ChannelConversationOptions) { this.#core = new ChannelConversation(options); }
  async handle(input: WechatKfInboundMessage): Promise<void> {
    if ('imageMediaId' in input) throw new Error('wechat_conversation_image_requires_image_adapter');
    const message = wechatConversationMessage(input);
    const file = 'mediaId' in input ? { ...message, fileKey: wechatKfFileKey(message.messageId),
      fileName: '微信客服项目材料.pdf' } : undefined;
    // accept() persists before it returns; processing errors cannot lose a pulled message.
    const processing = this.#core.accept(message, file);
    void processing.catch((error) => this.options.onError?.(error));
  }
  has(messageId: string): boolean { return this.#core.has(messageId); }
  resumePending(): void { this.#core.resumePending(); }
  waitForIdle(): Promise<void> { return this.#core.waitForIdle(); }
}

function required(value: string | undefined): string {
  if (!value || /[\r\n\0]/u.test(value)) throw new Error('wechat_conversation_route_invalid');
  return value;
}
