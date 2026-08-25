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

export type CompanyProfileFieldState =
  | "confirmed"
  | "pending"
  | "conflicted"
  | "missing";

export interface CompanyProfileFieldV1 {
  value?: string;
  state: CompanyProfileFieldState;
}

export interface CompanyProfileV1 {
  summary: CompanyProfileFieldV1;
  primaryIndustry: CompanyProfileFieldV1;
  industryPosition: CompanyProfileFieldV1;
  location: CompanyProfileFieldV1;
  foundedAt: CompanyProfileFieldV1;
  latestFunding: CompanyProfileFieldV1;
  watched: boolean;
}

export interface CompanyDirectoryItem {
  companyId: string;
  canonicalName: string;
  status: "active" | "provisional" | "merged";
  aliases: Array<{ alias: string; type: string }>;
  version: number;
  createdAt: string;
  updatedAt: string;
  profile: CompanyProfileV1;
  materialCount: number;
  knowledgeCount: number;
  pendingCandidateCount: number;
}

export interface CompanyDirectoryResponse {
  items: CompanyDirectoryItem[];
  total: number;
}

export type CompanyConversationStatusV1 =
  | "processing"
  | "waiting"
  | "pending_confirmation"
  | "completed"
  | "failed";

export type CompanySourceChannelV1 = "web" | "feishu";

export interface CompanyMaterialV1 {
  conversationId: string;
  documentId: string;
  fileName: string;
  materialType?: string;
  status: CompanyConversationStatusV1;
  sourceChannel: CompanySourceChannelV1;
  updatedAt: string;
}

export interface CompanyResearchRecordV1 {
  conversationId: string;
  runId: string;
  intent: string;
  status: CompanyConversationStatusV1;
  triggerReason?:
    | "user_requested"
    | "information_missing"
    | "possibly_outdated"
    | "internal_conflict"
    | "not_needed";
  summary?: string;
  updatedAt: string;
}

export interface CompanyRelationV1 {
  relationId: string;
  direction: "outgoing" | "incoming";
  relationType: string;
  status: "candidate" | "confirmed" | "conflicted";
  company: Omit<
    CompanyDirectoryItem,
    "profile" | "materialCount" | "knowledgeCount" | "pendingCandidateCount"
  >;
  evidence?: ReviewEvidence;
}

export interface CompanyIndustryPlacementV1 {
  industryId: string;
  industryName: string;
  nodeId?: string;
  nodeName?: string;
  positionLabel: string;
  status: "candidate" | "confirmed" | "conflicted";
  evidence?: ReviewEvidence;
}

export interface CompanyDetailResponse
  extends Omit<CompanyDirectoryItem, "knowledgeCount"> {
  knowledge: ReviewKnowledge[];
  materials: CompanyMaterialV1[];
  pendingCandidates: ReviewCandidate[];
  researchRecords: CompanyResearchRecordV1[];
  relations: CompanyRelationV1[];
  industryPlacements: CompanyIndustryPlacementV1[];
}

export interface IndustryDirectoryItemV1 {
  industryId: string;
  name: string;
  summary: string;
  status: "draft" | "active";
  materialCount: number;
  companyCount: number;
  updatedAt: string;
}

export interface IndustryDirectoryResponseV1 {
  items: IndustryDirectoryItemV1[];
  total: number;
}

export interface IndustryNodeV1 {
  nodeId: string;
  stage: "upstream" | "midstream" | "downstream";
  name: string;
  description?: string;
  position: number;
}

export interface IndustryMaterialV1 extends CompanyMaterialV1 {
  evidence?: ReviewEvidence;
}

export interface IndustryCompanyPlacementV1 {
  company: {
    companyId: string;
    canonicalName: string;
    status: "active" | "provisional" | "merged";
    aliases: Array<{ alias: string; type: string }>;
    version: number;
    createdAt: string;
    updatedAt: string;
  };
  nodeId?: string;
  nodeName?: string;
  positionLabel: string;
  status: "candidate" | "confirmed" | "conflicted";
  evidence?: ReviewEvidence;
}

export interface IndustryDetailResponseV1 extends IndustryDirectoryItemV1 {
  nodes: IndustryNodeV1[];
  materials: IndustryMaterialV1[];
  companies: IndustryCompanyPlacementV1[];
}
