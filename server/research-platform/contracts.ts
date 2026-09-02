import type { QuickCardAnalysisResult } from './quick-card/contracts.js';
import type { CompanyQuickCardResult } from './company-quick-card/contracts.js';
import type { CompanyResearchWorkflowSkill } from './research/contracts.js';

export type SourceChannel = 'web' | 'feishu' | 'wecom';
export type BotSourceChannel = Exclude<SourceChannel, 'web'>;
export type ConversationType = 'material' | 'company' | 'industry';
export type ConversationStatus = 'processing' | 'waiting' | 'pending_confirmation' | 'completed' | 'failed' | 'cancelled';
export type TaskStatus = 'queued' | 'running' | 'waiting' | 'pending_confirmation' | 'completed' | 'failed' | 'cancelled';
export type TaskStepStatus = 'blocked' | 'queued' | 'running' | 'completed' | 'skipped' | 'pending_confirmation' | 'failed';

export interface DocumentRecord {
  documentId: string;
  fileName: string;
  mimeType?: string;
  bytes: number;
  sha256: string;
  parseStatus: 'queued' | 'processing' | 'parsed' | 'failed';
  archiveStatus: 'stored' | 'archived' | 'pending_company';
  materialType?: string;
  createdAt: string;
}

export interface TaskStepRecord {
  stepId: string;
  name: string;
  position: number;
  status: TaskStepStatus;
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
}

export interface AnalysisTaskRecord {
  taskId: string;
  type: 'material_analysis' | 'company_list_processing' | 'company_research' | 'industry_research';
  status: TaskStatus;
  currentStep: string;
  createdAt: string;
  updatedAt: string;
  providerId?: string;
  modelId?: string;
  variant?: string;
  sessionId?: string;
  toolUsage?: string[];
  resultStatus?: string;
  steps: TaskStepRecord[];
}

export interface ConversationSummary {
  conversationId: string;
  threadId?: string;
  title: string;
  type: ConversationType;
  sourceChannel: SourceChannel;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  receiptCount: number;
  document: DocumentRecord;
  task: Omit<AnalysisTaskRecord, 'steps'>;
}

export interface ConversationDetail extends ConversationSummary {
  task: AnalysisTaskRecord;
  company?: CompanyRecord;
  industry?: IndustryRecord;
  companyMatch?: CompanyMatchCase;
  analysisSections: AnalysisSectionRecord[];
  candidates: KnowledgeCandidateRecord[];
  companyList?: CompanyListRecord;
  companyResearch?: CompanyResearchRecord;
  industryResearch?: IndustryResearchRecord;
  conversationReuse?: ConversationReuseSuggestion;
  threadMaterials?: CompanyMaterialRecord[];
}

export interface ConversationReuseSuggestion {
  suggestionId: string;
  status: 'pending' | 'accepted' | 'rejected';
  score: number;
  reason: string;
  version: number;
  target: {
    conversationId: string;
    title: string;
    fileName: string;
    companyName?: string;
  };
}

export type SubjectKind = 'legal_company' | 'project' | 'institution' | 'team' | 'unknown';
export type SubjectKindStatus = 'pending' | 'confirmed';

export interface CompanyRecord {
  companyId: string;
  canonicalName: string;
  status: 'active' | 'provisional' | 'merged';
  aliases: Array<{ alias: string; type: string }>;
  subjectKind: SubjectKind;
  subjectKindStatus: SubjectKindStatus;
  suggestedSubjectKind?: SubjectKind;
  subjectKindReason?: string;
  parentCompany?: { companyId: string; canonicalName: string };
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type ProfileFieldState = 'confirmed' | 'pending' | 'conflicted' | 'missing';

export interface CompanyProfileField {
  value?: string;
  state: ProfileFieldState;
}

export interface CompanyProfile {
  summary: CompanyProfileField;
  primaryIndustry: CompanyProfileField;
  industryPosition: CompanyProfileField;
  location: CompanyProfileField;
  foundedAt: CompanyProfileField;
  latestFunding: CompanyProfileField;
  watched: boolean;
}

export interface CompanyCardRecord extends CompanyRecord {
  profile: CompanyProfile;
  materialCount: number;
  knowledgeCount: number;
  pendingCandidateCount: number;
  latestMaterialAnalysis?: LatestMaterialAnalysisSummary;
}

export interface LatestMaterialAnalysisSummary {
  taskId: string;
  conversationId: string;
  documentId: string;
  fileName: string;
  taskStatus: TaskStatus;
  resultStatus?: string;
  summary?: string;
  sectionCount: number;
  updatedAt: string;
}

export interface CompanyMaterialRecord {
  conversationId: string;
  documentId: string;
  fileName: string;
  materialType?: string;
  status: ConversationStatus;
  sourceChannel: SourceChannel;
  updatedAt: string;
}

export interface CompanyResearchSummary {
  conversationId: string;
  runId: string;
  intent: string;
  status: ConversationStatus;
  triggerReason?: CompanyResearchRecord['triggerReason'];
  summary?: string;
  updatedAt: string;
}

export interface CompanyRelationRecord {
  relationId: string;
  direction: 'outgoing' | 'incoming';
  relationType: string;
  status: 'candidate' | 'confirmed' | 'conflicted';
  company: CompanyRecord;
  evidence?: EvidenceRecord;
}

/** A material-derived natural-person entity linked to a company by role. */
export interface CompanyPersonRecord {
  personId: string;
  name: string;
  role: string;
  summary: string;
  sourceLabel: string;
  evidence: EvidenceRecord[];
}

/** An analysis-derived relationship lead, kept separate from confirmed company relations. */
export interface CompanyRelationInsightRecord {
  insightId: string;
  targetName: string;
  category: 'upstream' | 'downstream' | 'customer' | 'competitor';
  relationType: string;
  description: string;
  sourceLabel: string;
  evidence: EvidenceRecord[];
}

export interface CompanyCopilotMessageRecord {
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface CompanyCopilotThreadRecord {
  threadId: string;
  companyId: string;
  status: 'idle';
  messages: CompanyCopilotMessageRecord[];
}

export interface CompanyIndustryPlacementRecord {
  industryId: string;
  industryName: string;
  nodeId?: string;
  nodeName?: string;
  positionLabel: string;
  status: 'candidate' | 'confirmed' | 'conflicted';
  evidence?: EvidenceRecord;
}

export interface CompanyMatchCase {
  caseId: string;
  proposedName?: string;
  status: 'pending' | 'resolved';
  options: CompanyRecord[];
  version: number;
}

export interface AnalysisSectionRecord {
  key: string;
  title: string;
  summary: string;
  evidence: EvidenceRecord[];
}

export interface EvidenceRecord {
  evidenceId: string;
  sourceType: 'material' | 'web';
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

export interface KnowledgeCandidateRecord {
  candidateId: string;
  companyId: string;
  sectionKey: string;
  knowledgeType: string;
  statement: string;
  value?: string;
  effectiveAt?: string;
  status: 'pending' | 'confirmed' | 'modified_confirmed' | 'rejected' | 'conflicted';
  version: number;
  highImpact: boolean;
  sensitive: boolean;
  evidence: EvidenceRecord[];
  unsupportedEvidence?: EvidenceRecord[];
  conflictingKnowledge?: KnowledgeRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRecord {
  knowledgeId: string;
  companyId: string;
  knowledgeType: string;
  statement: string;
  value?: string;
  effectiveAt?: string;
  status: 'current' | 'superseded' | 'disputed';
  version: number;
  supersedesId?: string;
  sourceCandidateId: string;
  evidence: EvidenceRecord[];
  createdAt: string;
}

export interface CompanyDetail extends CompanyRecord {
  knowledge: KnowledgeRecord[];
  pendingCandidateCount: number;
  materialCount: number;
  profile: CompanyProfile;
  materials: CompanyMaterialRecord[];
  pendingCandidates: KnowledgeCandidateRecord[];
  researchRecords: CompanyResearchSummary[];
  relations: CompanyRelationRecord[];
  people: CompanyPersonRecord[];
  relationInsights: CompanyRelationInsightRecord[];
  industryPlacements: CompanyIndustryPlacementRecord[];
  latestMaterialAnalysis?: LatestMaterialAnalysisSummary & {
    sections: AnalysisSectionRecord[];
  };
}

export interface IndustryRecord {
  industryId: string;
  name: string;
  summary: string;
  status: 'draft' | 'active';
  watched: boolean;
  version: number;
  materialCount: number;
  companyCount: number;
  updatedAt: string;
}

export interface PlatformNotification {
  notificationId: string;
  kind: 'candidate' | 'task_failed' | 'research_completed';
  title: string;
  description: string;
  targetUrl: string;
  createdAt: string;
  readAt?: string;
}

export interface IndustryNodeRecord {
  nodeId: string;
  stage: 'upstream' | 'midstream' | 'downstream';
  name: string;
  description?: string;
  position: number;
}

export interface IndustryMaterialRecord extends CompanyMaterialRecord {
  evidence?: EvidenceRecord;
}

export interface IndustryDetail extends IndustryRecord {
  nodes: IndustryNodeRecord[];
  materials: IndustryMaterialRecord[];
  researchRecords: IndustryResearchSummary[];
  companies: Array<{
    company: CompanyRecord;
    nodeId?: string;
    nodeName?: string;
    positionLabel: string;
    status: 'candidate' | 'confirmed' | 'conflicted';
    evidence?: EvidenceRecord;
  }>;
}

export interface IndustryResearchSummary {
  conversationId: string;
  runId: string;
  intent: string;
  status: ConversationStatus;
  summary?: string;
  updatedAt: string;
}

export interface SemanticSearchMatch {
  score: number;
  reason: string;
  evidence: EvidenceRecord[];
}

export interface GlobalSearchResults {
  query: string;
  mode: 'semantic';
  providerId: string;
  modelId: string;
  companies: Array<CompanyCardRecord & { match: SemanticSearchMatch }>;
  materials: Array<CompanyMaterialRecord & { match: SemanticSearchMatch }>;
  conversations: Array<ConversationSummary & { match: SemanticSearchMatch }>;
  industries: Array<IndustryRecord & { match: SemanticSearchMatch }>;
}

export type CompanyListMatchStatus = 'existing' | 'new' | 'ambiguous' | 'failed';
export type CompanyListConfirmationStatus = 'pending' | 'confirmed';

export interface CompanyListRowRecord {
  rowId: string;
  rowOrder: number;
  originalValue: string;
  normalizedName?: string;
  matchStatus: CompanyListMatchStatus;
  confirmationStatus: CompanyListConfirmationStatus;
  options: CompanyRecord[];
  company?: CompanyRecord;
  evidence: EvidenceRecord;
  errorCode?: string;
  version: number;
}

export interface CompanyResearchRequestRecord {
  requestId: string;
  companyId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  conversationId?: string;
  createdAt: string;
}

export interface CompanyListRecord {
  listId: string;
  conversationId: string;
  documentId: string;
  status: 'processing' | 'pending_confirmation' | 'completed' | 'completed_with_errors';
  rows: CompanyListRowRecord[];
  researchRequests: CompanyResearchRequestRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface CompanyResearchRecord {
  runId: string;
  companyId?: string;
  intent: string;
  explicitWebSearch: boolean;
  triggerReason?: 'user_requested' | 'information_missing' | 'possibly_outdated' | 'internal_conflict' | 'not_needed';
  publicQuery?: string;
  summary?: string;
  sources: Array<EvidenceRecord & { accessStatus: 'accessible' | 'metadata_only' }>;
  workflowSkill?: CompanyResearchWorkflowSkill;
  workflowScope?: CompanyResearchWorkflowRequest['scope'];
  createdAt: string;
  updatedAt: string;
}

export interface IndustryResearchRecord {
  runId: string;
  industryId: string;
  intent: string;
  explicitWebSearch: boolean;
  triggerReason: 'user_requested' | 'not_needed';
  publicQuery?: string;
  summary?: string;
  sources: Array<EvidenceRecord & { accessStatus: 'accessible' | 'metadata_only' }>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminParseFailureRecord {
  taskId: string;
  conversationId: string;
  title: string;
  fileName: string;
  stepName: string;
  errorCode: string;
  attempts: number;
  failedAt: string;
}

export interface AdminIdentityExceptionRecord {
  caseId: string;
  conversationId: string;
  title: string;
  proposedName?: string;
  options: CompanyRecord[];
  version: number;
  updatedAt: string;
}

export interface AdminDuplicateMaterialRecord {
  documentId: string;
  fileName: string;
  sha256: string;
  receiptCount: number;
  conversationIds: string[];
  lastReceivedAt: string;
}

export interface AuditRecord {
  auditId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

export interface AdminOverview {
  parseFailures: AdminParseFailureRecord[];
  identityExceptions: AdminIdentityExceptionRecord[];
  duplicateMaterials: AdminDuplicateMaterialRecord[];
  audits: AuditRecord[];
}

export interface ResolveCompanyMatchInput {
  conversationId: string;
  expectedVersion: number;
  companyId?: string;
  createName?: string;
}

export interface ResolveConversationReuseInput {
  conversationId: string;
  expectedVersion: number;
  action: 'reuse' | 'new';
}

export interface DecideCandidateInput {
  candidateId: string;
  expectedVersion: number;
  action: 'confirm' | 'modify' | 'reject';
  statement?: string;
  value?: string;
  effectiveAt?: string;
}

export interface DecideCandidatesBatchInput {
  decisions: Array<{
    candidateId: string;
    expectedVersion: number;
    action: 'confirm' | 'reject';
  }>;
}

export interface ResolveSubjectInput {
  companyId: string;
  expectedVersion: number;
  action: 'confirm' | 'link' | 'merge';
  subjectKind?: Exclude<SubjectKind, 'unknown'>;
  targetCompanyId?: string;
}

export interface ReviewCandidateEvidenceInput {
  candidateId: string;
  evidenceId: string;
  expectedVersion: number;
  action: 'unsupported' | 'restore';
}

export interface IngestDocumentInput {
  fileName: string;
  mimeType?: string;
  sourceChannel: SourceChannel;
  purpose?: 'material' | 'company_list';
  senderId?: string;
  sourceMessageId?: string;
  sourceAttachmentKey?: string;
  content: AsyncIterable<Uint8Array | string>;
}

export interface IngestDocumentResult {
  conversation: ConversationDetail;
  reusedDocument: boolean;
}

export interface DocumentContentRecord {
  documentId: string;
  fileName: string;
  mimeType?: string;
  bytes: number;
  content: AsyncIterable<Uint8Array>;
}

export interface IngestCompanyNamesInput {
  namesText: string;
  sourceChannel: 'web';
}

export interface ConfirmCompanyListRowsInput {
  listId: string;
  rows: Array<{
    rowId: string;
    expectedVersion: number;
    companyId?: string;
    createName?: string;
  }>;
}

export interface StartCompanyListResearchInput {
  listId: string;
  companyIds: string[];
}

export interface StartCompanyResearchInput {
  companyId?: string;
  companyName?: string;
  intent: string;
  explicitWebSearch: boolean;
  workflow?: CompanyResearchWorkflowRequest;
}

export interface StartFeishuCompanyResearchInput {
  companyName: string;
  sourceMessageId: string;
  senderId?: string;
}

export interface StartChannelCompanyResearchInput extends StartFeishuCompanyResearchInput {
  sourceChannel: BotSourceChannel;
}

export interface StartChannelCompanyResearchResult {
  conversation: ConversationDetail;
  reusedResearch: boolean;
}

export type StartFeishuCompanyResearchResult = StartChannelCompanyResearchResult;

export interface CompanyResearchWorkflowRequest {
  skill: CompanyResearchWorkflowSkill;
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
  inputScopeApproval: {
    approved: true;
    approvedBy: string;
    approvedAt: string;
    sourceIds: string[];
  };
  methodAssumptionApproval?: {
    approved: true;
    approvedBy: string;
    approvedAt: string;
  };
}

export interface CompanyResearchWorkflowSourceRecord {
  sourceId: string;
  title: string;
  locator?: string;
}

export interface StartIndustryResearchInput {
  industryId: string;
  intent: string;
  explicitWebSearch: boolean;
}

export interface IndustryReclassificationResult {
  companies: number;
  industries: number;
  mergedIndustries: number;
  unclassifiedMaterials: number;
}

export interface PlatformModule {
  ingestDocument(input: IngestDocumentInput): Promise<IngestDocumentResult>;
  ingestCompanyDocument(companyId: string, input: IngestDocumentInput): Promise<IngestDocumentResult>;
  ingestIndustryDocument(industryId: string, input: IngestDocumentInput): Promise<IngestDocumentResult>;
  ingestCompanyNames(input: IngestCompanyNamesInput): Promise<IngestDocumentResult>;
  getDocumentContent(documentId: string): Promise<DocumentContentRecord>;
  quickAnalyzeConversation(conversationId: string): Promise<QuickCardAnalysisResult>;
  quickAnalyzeCompanyResearch(conversationId: string): Promise<CompanyQuickCardResult>;
  listConversations(): Promise<ConversationSummary[]>;
  getConversation(conversationId: string): Promise<ConversationDetail>;
  resolveCompanyMatch(input: ResolveCompanyMatchInput): Promise<ConversationDetail>;
  resolveConversationReuse(input: ResolveConversationReuseInput): Promise<ConversationDetail>;
  listCandidates(status?: KnowledgeCandidateRecord['status']): Promise<KnowledgeCandidateRecord[]>;
  decideCandidate(input: DecideCandidateInput): Promise<KnowledgeCandidateRecord>;
  decideCandidatesBatch(input: DecideCandidatesBatchInput): Promise<KnowledgeCandidateRecord[]>;
  reviewCandidateEvidence(input: ReviewCandidateEvidenceInput): Promise<KnowledgeCandidateRecord>;
  restoreKnowledge(knowledgeId: string, expectedCompanyVersion: number): Promise<CompanyDetail>;
  listCompanies(): Promise<CompanyCardRecord[]>;
  getCompany(companyId: string): Promise<CompanyDetail>;
  getCompanyCopilot(companyId: string): Promise<CompanyCopilotThreadRecord>;
  sendCompanyCopilotMessage(
    companyId: string,
    content: string,
  ): Promise<CompanyCopilotThreadRecord>;
  resolveSubject(input: ResolveSubjectInput): Promise<CompanyDetail>;
  getCompanyResearchWorkflowSources(
    companyId: string,
  ): Promise<CompanyResearchWorkflowSourceRecord[]>;
  setCompanyWatched(companyId: string, watched: boolean, expectedVersion: number): Promise<CompanyDetail>;
  listIndustries(): Promise<IndustryRecord[]>;
  reclassifyIndustries(): Promise<IndustryReclassificationResult>;
  countUnclassifiedIndustryMaterials(): Promise<number>;
  getIndustry(industryId: string): Promise<IndustryDetail>;
  confirmIndustryClassification(
    industryId: string,
    expectedVersion: number,
  ): Promise<IndustryDetail>;
  setIndustryWatched(industryId: string, watched: boolean, expectedVersion: number): Promise<IndustryDetail>;
  search(query: string): Promise<GlobalSearchResults>;
  listNotifications(): Promise<PlatformNotification[]>;
  markNotificationRead(notificationId: string): Promise<PlatformNotification>;
  getCompanyList(listId: string): Promise<CompanyListRecord>;
  confirmCompanyListRows(input: ConfirmCompanyListRowsInput): Promise<CompanyListRecord>;
  startCompanyListResearch(input: StartCompanyListResearchInput): Promise<CompanyListRecord>;
  startCompanyResearch(input: StartCompanyResearchInput): Promise<ConversationDetail>;
  startFeishuCompanyResearch(
    input: StartFeishuCompanyResearchInput,
  ): Promise<StartFeishuCompanyResearchResult>;
  startChannelCompanyResearch(
    input: StartChannelCompanyResearchInput,
  ): Promise<StartChannelCompanyResearchResult>;
  startIndustryResearch(input: StartIndustryResearchInput): Promise<ConversationDetail>;
  listAdminOverview(): Promise<AdminOverview>;
  cancelTask(taskId: string): Promise<ConversationDetail>;
  retryTask(taskId: string): Promise<ConversationDetail>;
  runPendingSteps(limit?: number): Promise<number>;
  close(): void;
}

export class PlatformInputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PlatformInputError';
    this.code = code;
  }
}

export class PlatformNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlatformNotFoundError';
  }
}

export class PlatformConflictError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PlatformConflictError';
    this.code = code;
  }
}
