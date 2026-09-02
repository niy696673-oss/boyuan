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
  subjectKind?: SubjectKindV1;
  subjectKindStatus?: SubjectKindStatusV1;
  suggestedSubjectKind?: SubjectKindV1;
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
  packages: ReviewPackageV1[];
  packageTotal: number;
  groupTotal: number;
}

export interface ReviewCandidateClusterV1 {
  clusterId: string;
  fingerprint: string;
  candidateIds: string[];
  candidates?: ReviewQueueItem[];
  candidateCount: number;
  safeToConfirm: boolean;
  riskReasons: string[];
}

export interface ReviewKnowledgeGroupV1 {
  groupId: string;
  sectionKey: string;
  sectionTitle: string;
  knowledgeType: string;
  candidateCount: number;
  clusters: ReviewCandidateClusterV1[];
}

export interface ReviewPackageV1 {
  packageId: string;
  company: ReviewCompany;
  candidateCount: number;
  groupCount: number;
  safeCandidateCount: number;
  riskCandidateCount: number;
  groups: ReviewKnowledgeGroupV1[];
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

export interface ReviewBatchDecisionItemV1 {
  candidateId: string;
  expectedVersion: number;
  action: "confirm" | "reject";
}

export interface ReviewBatchDecisionInputV1 {
  decisions: ReviewBatchDecisionItemV1[];
}

export interface ReviewBatchDecisionResponseV1 {
  candidates: ReviewCandidate[];
  remainingCount: number;
}

export type SubjectKindV1 =
  | "legal_company"
  | "project"
  | "institution"
  | "team"
  | "unknown";

export type SubjectKindStatusV1 = "pending" | "confirmed";

export interface SubjectCompanyLinkV1 {
  companyId: string;
  canonicalName: string;
}

export interface SubjectResolutionInputV1 {
  expectedVersion: number;
  action: "confirm" | "link" | "merge";
  subjectKind?: Exclude<SubjectKindV1, "unknown">;
  targetCompanyId?: string;
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
  subjectKind?: SubjectKindV1;
  subjectKindStatus?: SubjectKindStatusV1;
  suggestedSubjectKind?: SubjectKindV1;
  subjectKindReason?: string;
  parentCompany?: SubjectCompanyLinkV1;
  version: number;
  createdAt: string;
  updatedAt: string;
  profile: CompanyProfileV1;
  materialCount: number;
  knowledgeCount: number;
  pendingCandidateCount: number;
  latestMaterialAnalysis?: LatestMaterialAnalysisV1;
}

export interface LatestMaterialAnalysisV1 {
  taskId: string;
  conversationId: string;
  documentId: string;
  fileName: string;
  taskStatus:
    | "queued"
    | "running"
    | "waiting"
    | "pending_confirmation"
    | "completed"
    | "failed"
    | "cancelled";
  resultStatus?: string;
  summary?: string;
  sectionCount: number;
  updatedAt: string;
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
  | "failed"
  | "cancelled";

export type CompanySourceChannelV1 = "web" | "feishu" | "wecom";

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

export interface IndustryResearchRecordV1 {
  conversationId: string;
  runId: string;
  intent: string;
  status: CompanyConversationStatusV1;
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

export interface CompanyPersonV1 {
  personId: string;
  name: string;
  role: string;
  summary: string;
  sourceLabel: string;
  evidence: ReviewEvidence[];
}

export interface CompanyRelationInsightV1 {
  insightId: string;
  targetName: string;
  category: "upstream" | "downstream" | "customer" | "competitor";
  relationType: string;
  description: string;
  sourceLabel: string;
  evidence: ReviewEvidence[];
}

export type CompanyRelationshipCategoryV1 =
  | "upstream"
  | "downstream"
  | "customer"
  | "competitor";

export type CompanyRelationshipSourceKindV1 =
  | "bp_self_report"
  | "project_library"
  | "external";

export type CompanyRelationshipVerificationStatusV1 =
  | "unverified"
  | "candidate"
  | "confirmed"
  | "conflicted";

export interface CompanyRelationshipPanoramaItemV1 {
  relationshipId: string;
  targetName: string;
  targetCompanyId?: string;
  category: CompanyRelationshipCategoryV1;
  relationType: string;
  description: string;
  sourceKind: CompanyRelationshipSourceKindV1;
  sourceLabel: string;
  verificationStatus: CompanyRelationshipVerificationStatusV1;
  evidence: ReviewEvidence[];
  updatedAt: string;
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
  people?: CompanyPersonV1[];
  relationInsights?: CompanyRelationInsightV1[];
  relationshipPanorama?: CompanyRelationshipPanoramaItemV1[];
  industryPlacements: CompanyIndustryPlacementV1[];
  latestMaterialAnalysis?: LatestMaterialAnalysisV1 & {
    sections: Array<{
      key: string;
      title: string;
      summary: string;
      evidence: ReviewEvidence[];
    }>;
  };
}

export interface IndustryReclassificationResponseV1 {
  companies: number;
  industries: number;
  mergedIndustries: number;
  unclassifiedMaterials: number;
}

export interface IndustryDirectoryItemV1 {
  industryId: string;
  name: string;
  summary: string;
  status: "draft" | "active";
  watched: boolean;
  version: number;
  materialCount: number;
  companyCount: number;
  updatedAt: string;
}

export interface PlatformNotificationV1 {
  notificationId: string;
  kind: "candidate" | "task_failed" | "research_completed";
  title: string;
  description: string;
  targetUrl: string;
  createdAt: string;
  readAt?: string;
}

export interface PlatformNotificationListV1 {
  items: PlatformNotificationV1[];
  unreadCount: number;
}

export interface IndustryDirectoryResponseV1 {
  items: IndustryDirectoryItemV1[];
  total: number;
  unclassifiedMaterialCount: number;
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
  researchRecords: IndustryResearchRecordV1[];
  companies: IndustryCompanyPlacementV1[];
}

export interface CompanyListCompanyV1 {
  companyId: string;
  canonicalName: string;
  status: "active" | "provisional" | "merged";
  aliases: Array<{ alias: string; type: string }>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyListRowV1 {
  rowId: string;
  rowOrder: number;
  originalValue: string;
  normalizedName?: string;
  matchStatus: "existing" | "new" | "ambiguous" | "failed";
  confirmationStatus: "pending" | "confirmed";
  options: CompanyListCompanyV1[];
  company?: CompanyListCompanyV1;
  evidence: ReviewEvidence;
  errorCode?: string;
  version: number;
}

export interface CompanyListRecordV1 {
  listId: string;
  conversationId: string;
  documentId: string;
  status:
    | "processing"
    | "pending_confirmation"
    | "completed"
    | "completed_with_errors";
  rows: CompanyListRowV1[];
  researchRequests: Array<{
    requestId: string;
    companyId: string;
    status: "queued" | "running" | "completed" | "failed";
    conversationId?: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}
