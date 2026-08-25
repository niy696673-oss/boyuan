import type { QuickCardAnalysisResult } from './quick-card/contracts.js';

export type SourceChannel = 'web' | 'feishu';
export type ConversationType = 'material' | 'company' | 'industry';
export type ConversationStatus = 'processing' | 'waiting' | 'pending_confirmation' | 'completed' | 'failed';
export type TaskStatus = 'queued' | 'running' | 'waiting' | 'pending_confirmation' | 'completed' | 'failed';
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
  companyMatch?: CompanyMatchCase;
  analysisSections: AnalysisSectionRecord[];
  candidates: KnowledgeCandidateRecord[];
  companyList?: CompanyListRecord;
  companyResearch?: CompanyResearchRecord;
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

export interface CompanyRecord {
  companyId: string;
  canonicalName: string;
  status: 'active' | 'provisional' | 'merged';
  aliases: Array<{ alias: string; type: string }>;
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
  pendingCandidateCount: number;
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
  industryPlacements: CompanyIndustryPlacementRecord[];
}

export interface IndustryRecord {
  industryId: string;
  name: string;
  summary: string;
  status: 'draft' | 'active';
  materialCount: number;
  companyCount: number;
  updatedAt: string;
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
  companies: Array<{
    company: CompanyRecord;
    nodeId?: string;
    nodeName?: string;
    positionLabel: string;
    status: 'candidate' | 'confirmed' | 'conflicted';
    evidence?: EvidenceRecord;
  }>;
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
  content: AsyncIterable<Uint8Array | string>;
}

export interface IngestDocumentResult {
  conversation: ConversationDetail;
  reusedDocument: boolean;
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
}

export interface PlatformModule {
  ingestDocument(input: IngestDocumentInput): Promise<IngestDocumentResult>;
  ingestCompanyNames(input: IngestCompanyNamesInput): Promise<IngestDocumentResult>;
  quickAnalyzeConversation(conversationId: string): Promise<QuickCardAnalysisResult>;
  listConversations(): Promise<ConversationSummary[]>;
  getConversation(conversationId: string): Promise<ConversationDetail>;
  resolveCompanyMatch(input: ResolveCompanyMatchInput): Promise<ConversationDetail>;
  resolveConversationReuse(input: ResolveConversationReuseInput): Promise<ConversationDetail>;
  listCandidates(status?: KnowledgeCandidateRecord['status']): Promise<KnowledgeCandidateRecord[]>;
  decideCandidate(input: DecideCandidateInput): Promise<KnowledgeCandidateRecord>;
  reviewCandidateEvidence(input: ReviewCandidateEvidenceInput): Promise<KnowledgeCandidateRecord>;
  restoreKnowledge(knowledgeId: string, expectedCompanyVersion: number): Promise<CompanyDetail>;
  listCompanies(): Promise<CompanyCardRecord[]>;
  getCompany(companyId: string): Promise<CompanyDetail>;
  setCompanyWatched(companyId: string, watched: boolean, expectedVersion: number): Promise<CompanyDetail>;
  listIndustries(): Promise<IndustryRecord[]>;
  getIndustry(industryId: string): Promise<IndustryDetail>;
  search(query: string): Promise<GlobalSearchResults>;
  getCompanyList(listId: string): Promise<CompanyListRecord>;
  confirmCompanyListRows(input: ConfirmCompanyListRowsInput): Promise<CompanyListRecord>;
  startCompanyListResearch(input: StartCompanyListResearchInput): Promise<CompanyListRecord>;
  startCompanyResearch(input: StartCompanyResearchInput): Promise<ConversationDetail>;
  listAdminOverview(): Promise<AdminOverview>;
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
