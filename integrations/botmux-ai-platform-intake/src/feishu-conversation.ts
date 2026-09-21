import { ChannelConversation, type ChannelConversationOptions } from './channel-conversation.js';
import {
  parseFeishuFileMessage,
  parseFeishuTextMessage,
  parseFeishuImageMessage,
  type FeishuImageMessage,
} from './direct-feishu-intake.js';
import type { CompanyListExtractor } from './company-list-extractor.js';
export { companyResearchKey } from './channel-conversation.js';

export interface FeishuConversationOptions extends ChannelConversationOptions {
  botOpenId: string;
  downloadImage?: (messageId: string, imageKey: string) => Promise<Buffer>;
  extractor?: CompanyListExtractor;
}

/** Feishu envelope/mention rules only; dialogue, durable state and FIFO live in ChannelConversation. */
export class FeishuConversationIngress {
  readonly #core: ChannelConversation;
  constructor(private readonly options: FeishuConversationOptions) { this.#core = new ChannelConversation(options); }

  async handle(event: unknown): Promise<{ handled: boolean }> {
    const image = (this.options.downloadImage && this.options.extractor)
      ? parseFeishuImageMessage(event, new Date(), this.options.botOpenId)
      : null;
    if (image) {
      await this.#handleImage(image);
      return { handled: true };
    }

    const file = this.options.file ? parseFeishuFileMessage(event) : null;
    const message = file && file.senderId && /^ou_[A-Za-z0-9_-]{1,500}$/u.test(file.senderId)
      ? { chatId: file.chatId, senderId: file.senderId, messageId: file.messageId,
        receivedAt: file.receivedAt, text: `[上传文件] ${file.fileName}` }
      : parseFeishuTextMessage(event, new Date(), this.options.botOpenId);
    if (!message) return { handled: false };
    await this.#core.accept(message, file ?? undefined);
    return { handled: true };
  }

  async #handleImage(image: FeishuImageMessage): Promise<void> {
    try {
      const buffer = await this.options.downloadImage!(image.messageId, image.imageKey);
      const extraction = await this.options.extractor!.extract({ image: buffer });
      if (extraction.isCompanyList !== false && extraction.companies.length > 0) {
        if (extraction.companies.length > 20) {
          await this.#core.accept(
            { chatId: image.chatId, senderId: image.senderId, messageId: image.messageId, receivedAt: image.receivedAt, text: '[图片名单]' },
            undefined,
            { kind: 'reply', text: `识别到超过 20 家公司（共 ${extraction.companies.length} 家），本次未启动分析。请按每批不超过 20 家拆分发送。` },
          );
        } else {
          if (extraction.uncertain.length > 0) {
            void this.options.reply(
              { chatId: image.chatId, senderId: image.senderId, messageId: image.messageId, receivedAt: image.receivedAt, text: '' },
              `已从图片中识别到 ${extraction.companies.length} 家公司并开始分析。以下片段较模糊暂未纳入：${extraction.uncertain.join('、')}`,
              `${image.messageId}-ocr-uncertain`,
            ).catch((err) => this.options.onError?.(err));
          }
          await this.#core.accept(
            { chatId: image.chatId, senderId: image.senderId, messageId: image.messageId, receivedAt: image.receivedAt, text: `[图片名单] 分析 ${extraction.companies.join('、')}` },
            {
              chatId: image.chatId, senderId: image.senderId, messageId: image.messageId, receivedAt: image.receivedAt,
              fileKey: `image:${image.imageKey}`, fileName: '公司名单图片.png',
              initialResponse: extraction.transcription ?? extraction.companies.join('\n'),
            },
            { kind: 'research', companies: extraction.companies, focus: '' },
          );
        }
        return;
      }

      if (extraction.isCompanyList === true && extraction.companies.length === 0) {
        await this.#core.accept(
          { chatId: image.chatId, senderId: image.senderId, messageId: image.messageId, receivedAt: image.receivedAt, text: '[图片名单]' },
          undefined,
          { kind: 'reply', text: '未能从图片中清晰识别出公司名称。你可以直接发送公司名称文字，或发送更清晰的名单图片。' },
        );
        return;
      }

      const summary = extraction.summary || '已接收并解析图片内容。';
      const transcription = extraction.transcription || summary;
      const content = `【图片内容解析】\n概述：${summary}\n\n详细转录与图表描述：\n${transcription}`;
      const replyText = `已接收并解析图片内容：\n\n${summary}\n\n你可以就图片中的业务、数据、架构或风险继续提问。`;

      await this.#core.accept(
        {
          chatId: image.chatId,
          senderId: image.senderId,
          messageId: image.messageId,
          receivedAt: image.receivedAt,
          text: `[上传图片] ${summary}`,
        },
        {
          chatId: image.chatId,
          senderId: image.senderId,
          messageId: image.messageId,
          receivedAt: image.receivedAt,
          fileKey: `image:${image.imageKey}`,
          fileName: '图片资料.png',
          initialResponse: content,
        },
        { kind: 'reply', text: replyText },
      );
    } catch (error) {
      this.options.onError?.(error);
      await this.#core.accept(
        { chatId: image.chatId, senderId: image.senderId, messageId: image.messageId, receivedAt: image.receivedAt, text: '[图片]' },
        undefined,
        { kind: 'reply', text: '图片解析遇到异常，请确认图片清晰度（支持不超过 20MB 的 PNG/JPEG/WebP 等格式），或直接发送文字说明。' },
      );
    }
  }

  has(messageId: string): boolean { return this.#core.has(messageId); }
  resumePending(): void { this.#core.resumePending(); }
  waitForIdle(): Promise<void> { return this.#core.waitForIdle(); }
}
