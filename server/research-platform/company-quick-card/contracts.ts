import type { WebSearchResultItem } from '../search/contracts.js';

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
  { name: 'companyIdentity', prompt: '公司主体、所在地与成立时间' },
  { name: 'industryTrack', prompt: '行业与细分赛道' },
  { name: 'financing', prompt: '融资轮次、金额与估值' },
  { name: 'keyPeople', prompt: '团队关键人、职位与团队规模' },
] as const;

export const COMPANY_QUICK_CARD_LIST_FIELDS = [
  { name: 'highlights', prompt: '公司核心亮点', maximum: 3 },
  { name: 'recentSignals', prompt: '公开来源中的近期业务、产品或融资信号', maximum: 3 },
] as const;

export type CompanyQuickCardTextFieldName = typeof COMPANY_QUICK_CARD_TEXT_FIELDS[number]['name'];
export type CompanyQuickCardListFieldName = typeof COMPANY_QUICK_CARD_LIST_FIELDS[number]['name'];
export type CompanyQuickCardFields = Record<CompanyQuickCardTextFieldName, string>
  & Record<CompanyQuickCardListFieldName, string[]>;

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
