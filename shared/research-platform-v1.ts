export type ReviewCandidateStatus =
  "pending" | "confirmed" | "modified_confirmed" | "rejected" | "conflicted";

export interface ReviewEvidence {
  evidenceId: string;
  sourceType: "material" | "web";
  quote: string;
  fileName?: string;
  documentId?: string;
  blockId?: string;
  page?: number;
  paragraph?: number;
  headingPath?: string[];
  sheet?: string;
  row?: number;
  cellRange?: string;
  title?: string;
  site?: string;
  url?: string;
  publishedAt?: string;
  retrievedAt?: string;
}

export interface ReviewKnowledge {
  knowledgeId: string;
  companyId: string;
  knowledgeType: string;
  statement: string;
  value?: string;
  effectiveAt?: string;
  status: "current" | "superseded" | "disputed";
  version: number;
  supersedesId?: string;
  sourceCandidateId: string;
  evidence: ReviewEvidence[];
  createdAt: string;
}

export interface ReviewCompany {
  companyId: string;
  canonicalName: string;
  aliases: Array<{ alias: string; type: string }>;
  version: number;
}

export interface ReviewCandidate {
  candidateId: string;
  companyId: string;
  sectionKey: string;
  knowledgeType: string;
  statement: string;
  value?: string;
  effectiveAt?: string;
  status: ReviewCandidateStatus;
  version: number;
  highImpact: boolean;
  sensitive: boolean;
  evidence: ReviewEvidence[];
  unsupportedEvidence?: ReviewEvidence[];
  conflictingKnowledge?: ReviewKnowledge[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewQueueItem extends ReviewCandidate {
  company: ReviewCompany;
  currentKnowledge: ReviewKnowledge[];
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  total: number;
}

export type ReviewDecisionAction = "confirm" | "modify" | "reject";

export interface ReviewDecisionInput {
  expectedVersion: number;
  action: ReviewDecisionAction;
  statement?: string;
  value?: string;
  effectiveAt?: string;
}

export interface ReviewDecisionResponse {
  candidate: ReviewCandidate;
  company: ReviewCompany;
  currentKnowledge: ReviewKnowledge[];
  remainingCount: number;
}
