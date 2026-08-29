import type { ParsedBlock } from '../parsers/contracts.js';
import {
  COMPANY_QUICK_CARD_COMMON_LIST_FIELDS,
  COMPANY_QUICK_CARD_VIEW_TEXT_FIELDS,
  type CompanyQuickCardViewFields,
} from '../../../shared/company-quick-card.js';

export interface QuickCardAnalysisInput {
  conversationId: string;
  documentId: string;
  fileName: string;
  blocks: ParsedBlock[];
}

export const QUICK_CARD_TEXT_FIELDS = [
  ...COMPANY_QUICK_CARD_VIEW_TEXT_FIELDS,
] as const;

export const QUICK_CARD_LIST_FIELDS = [
  ...COMPANY_QUICK_CARD_COMMON_LIST_FIELDS,
  { name: 'competitorNames', prompt: '材料明确提到的竞品公司名称', maximum: 20 },
  { name: 'upstreamNames', prompt: '材料明确提到的上游公司名称', maximum: 20 },
  { name: 'downstreamNames', prompt: '材料明确提到的下游公司名称', maximum: 20 },
] as const;

export type QuickCardTextFieldName = typeof QUICK_CARD_TEXT_FIELDS[number]['name'];
export type QuickCardListFieldName = typeof QUICK_CARD_LIST_FIELDS[number]['name'];
export type QuickCardFields = CompanyQuickCardViewFields
  & Record<'competitorNames' | 'upstreamNames' | 'downstreamNames', string[]>;

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
