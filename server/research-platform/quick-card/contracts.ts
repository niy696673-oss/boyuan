import type { ParsedBlock } from '../parsers/contracts.js';

export interface QuickCardAnalysisInput {
  conversationId: string;
  documentId: string;
  fileName: string;
  blocks: ParsedBlock[];
}

export const QUICK_CARD_TEXT_FIELDS = [
  { name: 'companyName', prompt: '公司简称或主体名称' },
  { name: 'companyIdentity', prompt: '公司身份，包含名称、所在地和成立年份' },
  { name: 'industryTrack', prompt: '行业与细分赛道' },
  { name: 'financing', prompt: '融资轮次、金额与估值' },
  { name: 'keyPeople', prompt: '团队关键人、职位与团队规模' },
] as const;

export const QUICK_CARD_LIST_FIELDS = [
  { name: 'highlights', prompt: '公司亮点，最多 3 项', maximum: 3 },
  { name: 'competitorNames', prompt: '材料明确提到的竞品公司名称', maximum: 20 },
  { name: 'upstreamNames', prompt: '材料明确提到的上游公司名称', maximum: 20 },
  { name: 'downstreamNames', prompt: '材料明确提到的下游公司名称', maximum: 20 },
] as const;

export type QuickCardTextFieldName = typeof QUICK_CARD_TEXT_FIELDS[number]['name'];
export type QuickCardListFieldName = typeof QUICK_CARD_LIST_FIELDS[number]['name'];
export type QuickCardFields = Record<QuickCardTextFieldName, string> & Record<QuickCardListFieldName, string[]>;

export type QuickCardExtractionResult = QuickCardFields & {
  providerId: string;
  modelId: string;
  variant: string;
  sessionId: string;
};

export type QuickCardAnalysisResult = QuickCardExtractionResult & {
  confidence: number;
  confidenceLevel: '低' | '中' | '高';
  navigation: {
    companyId?: string;
    industryId?: string;
  };
};

export interface QuickCardAnalysisPort {
  analyze(input: QuickCardAnalysisInput): Promise<QuickCardExtractionResult>;
}

export class QuickCardAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'QuickCardAdapterError';
    this.code = code;
  }
}
