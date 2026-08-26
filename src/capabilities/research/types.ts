import type { IndustryDirectoryItemV1 } from "../../../shared/research-platform-v1";

export type ConversationStatus =
  "processing" | "waiting" | "pending_confirmation" | "completed" | "failed";

export type TaskStepStatus =
  | "blocked"
  | "queued"
  | "running"
  | "completed"
  | "skipped"
  | "pending_confirmation"
  | "failed";

export interface PlatformDocument {
  documentId: string;
  fileName: string;
  mimeType?: string;
  bytes: number;
  sha256: string;
  parseStatus: "queued" | "processing" | "parsed" | "failed";
  archiveStatus: "stored" | "archived" | "pending_company";
  materialType?: string;
  createdAt: string;
}

export interface TaskStep {
  stepId: string;
  name: string;
  position: number;
  status: TaskStepStatus;
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
}

export interface AnalysisTask {
  taskId: string;
  type:
    | "material_analysis"
    | "company_list_processing"
    | "company_research"
    | "industry_research";
  status:
    | "queued"
    | "running"
    | "waiting"
    | "pending_confirmation"
    | "completed"
    | "failed";
  currentStep: string;
  createdAt: string;
  updatedAt: string;
  providerId?: string;
  modelId?: string;
  variant?: string;
  resultStatus?: string;
  steps?: TaskStep[];
}

export interface ConversationSummary {
  conversationId: string;
  title: string;
  type: "material" | "company" | "industry";
  sourceChannel: "web" | "feishu";
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  receiptCount: number;
  document: PlatformDocument;
  task: AnalysisTask;
}

export interface PlatformCompany {
  companyId: string;
  canonicalName: string;
  aliases: Array<{ alias: string; type: string }>;
  status: "active" | "provisional" | "merged";
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformEvidence {
  evidenceId: string;
  sourceType: "material" | "web";
  quote: string;
  fileName?: string;
  documentId?: string;
  page?: number;
  paragraph?: number;
  sheet?: string;
  row?: number;
  cellRange?: string;
  title?: string;
  site?: string;
  url?: string;
  publishedAt?: string;
  retrievedAt?: string;
}

export interface ExternalResearchSource extends PlatformEvidence {
  sourceType: "web";
  accessStatus: "accessible" | "metadata_only";
}

export interface CompanyResearch {
  runId: string;
  companyId?: string;
  intent: string;
  explicitWebSearch: boolean;
  triggerReason?:
    | "user_requested"
    | "information_missing"
    | "possibly_outdated"
    | "internal_conflict"
    | "not_needed";
  publicQuery?: string;
  summary?: string;
  sources: ExternalResearchSource[];
  workflowSkill?: "diagnose-bp" | "screen-deal" | "extract-risk-flags";
  workflowScope?: {
    asOfDate: string;
    transactionSide: string;
    stage: string;
    audience: string;
    confidentiality: "public" | "internal" | "restricted";
    decisionOwner: string;
    mode?: "one-minute" | "preliminary" | "re-screen" | "gp-fit";
    mandate?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface IndustryResearch {
  runId: string;
  industryId: string;
  intent: string;
  explicitWebSearch: boolean;
  triggerReason: "user_requested" | "not_needed";
  publicQuery?: string;
  summary?: string;
  sources: ExternalResearchSource[];
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisSection {
  key: string;
  title: string;
  summary: string;
  evidence: PlatformEvidence[];
}

export interface KnowledgeCandidate {
  candidateId: string;
  sectionKey: string;
  knowledgeType: string;
  statement: string;
  status:
    "pending" | "confirmed" | "modified_confirmed" | "rejected" | "conflicted";
  version: number;
  evidence: PlatformEvidence[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  task: AnalysisTask & { steps: TaskStep[] };
  company?: PlatformCompany;
  industry?: IndustryDirectoryItemV1;
  analysisSections: AnalysisSection[];
  candidates: KnowledgeCandidate[];
  companyList?: import("../../../shared/research-platform-v1").CompanyListRecordV1;
  companyResearch?: CompanyResearch;
  industryResearch?: IndustryResearch;
}

export interface UploadResult {
  conversation: ConversationDetail;
  reusedDocument: boolean;
}
