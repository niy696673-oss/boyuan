import type { ParsedBlock } from '../parsers/contracts.js';

export interface QuickCardAnalysisInput {
  conversationId: string;
  documentId: string;
  fileName: string;
  blocks: ParsedBlock[];
}

export const QUICK_CARD_FIELDS = [
  { name: 'subject', prompt: '公司/项目主体' },
  { name: 'direction', prompt: '业务方向' },
  { name: 'financing', prompt: '融资轮次/金额/估值' },
  { name: 'founders', prompt: '创始人/核心团队' },
  { name: 'benchmarks', prompt: '对标/竞品公司' },
  { name: 'highlights', prompt: '最值得关注的亮点' },
] as const;

export type QuickCardFieldName = typeof QUICK_CARD_FIELDS[number]['name'];
export type QuickCardFields = Record<QuickCardFieldName, string>;

export type QuickCardAnalysisResult = QuickCardFields & {
  providerId: string;
  modelId: string;
  variant: string;
  sessionId: string;
};

export interface QuickCardAnalysisPort {
  analyze(input: QuickCardAnalysisInput): Promise<QuickCardAnalysisResult>;
}

export class QuickCardAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'QuickCardAdapterError';
    this.code = code;
  }
}
