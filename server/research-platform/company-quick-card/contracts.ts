import type { WebSearchResultItem } from '../search/contracts.js';
import type { FundMatchSummary } from '../../../shared/fund-matching.js';
import {
  COMPANY_QUICK_CARD_COMMON_LIST_FIELDS,
  COMPANY_QUICK_CARD_COMMON_NUMBER_FIELDS,
  COMPANY_QUICK_CARD_CORE_TEXT_FIELDS,
  type CompanyQuickCardCoreFields,
} from '../../../shared/company-quick-card.js';

export type CompanyIdentityState = 'existing' | 'provisional' | 'ambiguous';

export interface CompanyQuickCardKnowledge {
  knowledgeType: string;
  statement: string;
  value?: string;
}

export interface CompanyQuickCardAnalysisInput {
  conversationId: string;
  companyName: string;
  identityState: Exclude<CompanyIdentityState, 'ambiguous'>;
  existingKnowledge: CompanyQuickCardKnowledge[];
  materialSummaries: string[];
  webResults: WebSearchResultItem[];
}

export const COMPANY_QUICK_CARD_TEXT_FIELDS = [
  ...COMPANY_QUICK_CARD_CORE_TEXT_FIELDS,
] as const;

export const COMPANY_QUICK_CARD_LIST_FIELDS = [
  ...COMPANY_QUICK_CARD_COMMON_LIST_FIELDS,
  { name: 'recentSignals', prompt: '公开来源中的近期业务、产品或融资信号', maximum: 3 },
  { name: 'competitorNames', prompt: '现有知识、材料或公开来源明确提到的同业或替代产品公司名称', maximum: 20 },
  { name: 'upstreamNames', prompt: '现有知识、材料或公开来源明确提到的上游公司名称', maximum: 20 },
  { name: 'downstreamNames', prompt: '现有知识、材料或公开来源明确提到的客户或下游公司名称', maximum: 20 },
] as const;

export const COMPANY_QUICK_CARD_NUMBER_FIELDS = [
  ...COMPANY_QUICK_CARD_COMMON_NUMBER_FIELDS,
] as const;

export type CompanyQuickCardTextFieldName = typeof COMPANY_QUICK_CARD_TEXT_FIELDS[number]['name'];
export type CompanyQuickCardListFieldName = typeof COMPANY_QUICK_CARD_LIST_FIELDS[number]['name'];
export type CompanyQuickCardFields = CompanyQuickCardCoreFields & {
  recentSignals: string[];
  competitorNames: string[];
  upstreamNames: string[];
  downstreamNames: string[];
};

export type CompanyQuickCardExtractionResult = CompanyQuickCardFields & {
  providerId: string;
  modelId: string;
  variant: string;
  sessionId: string;
};

export type CompanyQuickCardResult = CompanyQuickCardExtractionResult & {
  kind: 'company_research';
  status: 'completed' | 'pending_confirmation';
  companyName: string;
  identityState: CompanyIdentityState;
  confidence: number;
  confidenceLevel: '低' | '中' | '高';
  sourceCount: number;
  materialCount: number;
  formalKnowledgeCount: number;
  pendingCandidateCount: number;
  navigation: {
    companyId?: string;
    industryId?: string;
  };
  fundMatch: FundMatchSummary;
};

export interface CompanyQuickCardAnalysisPort {
  analyze(input: CompanyQuickCardAnalysisInput): Promise<CompanyQuickCardExtractionResult>;
}

export class CompanyQuickCardAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CompanyQuickCardAdapterError';
    this.code = code;
  }
}
