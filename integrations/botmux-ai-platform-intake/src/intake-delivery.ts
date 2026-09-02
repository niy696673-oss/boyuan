import {
  companyResearchFailureCard,
  companyResearchCompletionCard,
  completionCard,
  failureCard,
} from './cards.js';
import type {
  CompletionDeliveryInput,
  FailureDeliveryInput,
  IntakeDelivery,
  Messenger,
} from './types.js';

export class FeishuIntakeDelivery implements IntakeDelivery {
  readonly #messenger: Messenger;

  constructor(messenger: Messenger) {
    this.#messenger = messenger;
  }

  async complete(input: CompletionDeliveryInput): Promise<void> {
    const card = input.kind === 'company_research'
      ? companyResearchCompletionCard(input.result, input.links)
      : completionCard(input.result, input.links);
    if (input.statusReceipt && this.#messenger.updateCard) {
      await this.#messenger.updateCard({
        cardMessageId: input.statusReceipt,
        card,
      });
      return;
    }
    await this.#messenger.sendCard({
      chatId: input.chatId,
      sessionId: input.sessionId,
      messageId: input.messageId,
      fileKey: input.fileKey,
      responseKind: 'final',
      cardKind: 'completion',
      card,
    });
  }

  async fail(input: FailureDeliveryInput): Promise<void> {
    const card = input.kind === 'company_research'
      ? companyResearchFailureCard(input.subject)
      : failureCard(input.subject);
    if (input.statusReceipt && this.#messenger.updateCard) {
      await this.#messenger.updateCard({ cardMessageId: input.statusReceipt, card });
      return;
    }
    await this.#messenger.sendCard({
      chatId: input.chatId,
      sessionId: input.sessionId,
      messageId: input.messageId,
      fileKey: input.fileKey,
      responseKind: 'final',
      cardKind: 'failure',
      card,
    });
  }
}
