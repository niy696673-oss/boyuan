import type { WebSearchResultItem } from '../search/contracts.js';

export interface CompanyResearchCandidateDraft {
  knowledgeType: string;
  statement: string;
  value?: string;
  effectiveAt?: string;
  evidenceUrls: string[];
  highImpact: boolean;
  sensitive: boolean;
}

export interface CompanyResearchInput {
  taskId: string;
  conversationId: string;
  companyId: string;
  companyName: string;
  intent: string;
  triggerReason?: string;
  existingKnowledge: Array<{ knowledgeType: string; statement: string; value?: string; status: string; createdAt: string }>;
  pendingCandidates: Array<{ knowledgeType: string; statement: string }>;
  webResults: WebSearchResultItem[];
  sessionId?: string;
}

export interface CompanyResearchResult {
  providerId: string;
  modelId: string;
  sessionId: string;
  summary: string;
  candidates: CompanyResearchCandidateDraft[];
  rawText: string;
}

export interface CompanyResearchPort {
  analyze(input: CompanyResearchInput): Promise<CompanyResearchResult>;
}
