export interface RelatedConversationCandidate {
  conversationId: string;
  title: string;
  companyName?: string;
  content: string;
}

export interface ConversationRelatednessInput {
  conversationId: string;
  title: string;
  companyName?: string;
  content: string;
  candidates: RelatedConversationCandidate[];
}

export interface ConversationRelatednessOutput {
  providerId: string;
  modelId: string;
  targetConversationId?: string;
  score: number;
  reason: string;
}

export interface ConversationRelatednessPort {
  suggest(input: ConversationRelatednessInput): Promise<ConversationRelatednessOutput>;
}

export class ConversationRelatednessError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConversationRelatednessError';
    this.code = code;
  }
}
