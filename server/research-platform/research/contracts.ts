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

export type CompanyResearchWorkflowSkill =
  | 'diagnose-bp'
  | 'screen-deal'
  | 'extract-risk-flags';

export type ResearchEvidenceState =
  | 'source-confirmed'
  | 'user-provided'
  | 'calculated'
  | 'inferred'
  | 'assumption'
  | 'unknown'
  | 'conflicting';

export interface CompanyResearchWorkflowContext {
  scope: {
    asOfDate: string;
    transactionSide: string;
    stage: string;
    audience: string;
    confidentiality: 'public' | 'internal' | 'restricted';
    decisionOwner: string;
    mode?: 'one-minute' | 'preliminary' | 're-screen' | 'gp-fit';
    mandate?: string;
  };
  gates: {
    inputScopeApproval: {
      approved: boolean;
      approvedBy: string;
      approvedAt: string;
      sourceIds: string[];
    };
    methodAssumptionApproval?: {
      approved: boolean;
      approvedBy?: string;
      approvedAt?: string;
    };
    externalReleaseApproval?: {
      approved: boolean;
      approvedBy?: string;
      approvedAt?: string;
    };
  };
  materials: Array<{
    sourceId: string;
    title: string;
    excerpt: string;
    locator?: string;
    evidenceState: ResearchEvidenceState;
  }>;
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
  workflowSkill?: CompanyResearchWorkflowSkill;
  workflowContext?: CompanyResearchWorkflowContext;
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
