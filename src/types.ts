export type Visibility = "organization" | "project" | "private";
export type ClaimStatus =
  | "candidate"
  | "confirmed"
  | "disputed"
  | "superseded"
  | "expired"
  | "rejected";
export type ClaimType =
  | "verified_fact"
  | "company_statement"
  | "user_view"
  | "external_view"
  | "ai_inference";

export interface User {
  id: string;
  name: string;
  role: "investor" | "partner" | "knowledge_admin" | "system_admin";
  projectIds: string[];
}

export interface Evidence {
  id: string;
  documentId: string;
  fileName: string;
  excerpt: string;
  page?: number;
  sourceDate: string;
  visibility: Visibility;
  ownerId?: string;
  projectId?: string;
}

export interface Claim {
  id: string;
  category: string;
  text: string;
  type: ClaimType;
  status: ClaimStatus;
  confidence: number;
  version: number;
  eventTime?: string;
  evidenceIds: string[];
  visibility: Visibility;
  ownerId?: string;
  projectId?: string;
  history?: Array<{
    text: string;
    status: ClaimStatus;
    version: number;
    changedAt: string;
    changedBy: string;
    reason: string;
  }>;
}

export interface DocumentRecord {
  id: string;
  fileName: string;
  fileType: string;
  fileHash: string;
  size: number;
  status: "待解析" | "解析中" | "已解析" | "已索引" | "重复文件" | "解析失败";
  failureReason?: string;
  detectedCompanies: string[];
  visibility: Visibility;
  ownerId?: string;
  projectId?: string;
  uploadedBy: string;
  uploadedAt: string;
  objectKey?: string;
  statusTrace?: Array<{ status: string; at: string }>;
  knowledgeChanges?: Array<{
    action: "support" | "update" | "conflict" | "new";
    claimId: string;
    detail: string;
  }>;
}

export interface EntityCandidate {
  id: string;
  rawName: string;
  candidateCompanyIds: string[];
  reason: string;
  status: "pending" | "confirmed" | "rejected";
  createdAt: string;
}

export interface CompanyPosition {
  nodeId: string;
  positionType: "primary" | "secondary" | "historical" | "planned";
  status: "candidate" | "confirmed" | "rejected";
  confidence: number;
  source: "source_map" | "internal_evidence" | "ai_recommendation" | "manual";
  sourceDate: string;
  reason?: string;
  changedAt?: string;
}

export interface Company {
  id: string;
  standardName: string;
  aliases: string[];
  englishName?: string;
  legalEntity?: string;
  description: string;
  cognitionStatus: string;
  attentionStatus: string;
  positions: CompanyPosition[];
  claims: Claim[];
  evidence: Evidence[];
  updatedAt: string;
}

export interface IndustryNode {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  source: string;
  status?: "candidate" | "confirmed";
  confidence?: number;
  description?: string;
  updatedAt?: string;
}

export interface IndustryEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: "upstream_of" | "supports" | "serves";
  label: string;
  source: string;
}

export interface ResearchTask {
  id: string;
  query: string;
  companyId?: string;
  industryId?: string;
  contextType?: "材料" | "公司" | "行业";
  status: "识别中" | "检索中" | "生成中" | "待用户确认" | "已完成" | "执行失败";
  createdBy: string;
  createdAt: string;
  steps: Array<{
    name: string;
    status: "pending" | "running" | "done" | "needs-review";
    detail: string;
  }>;
  retrieval?: { hitCount: number; topEvidenceIds: string[]; latencyMs: number };
  answer?: {
    text: string;
    provider: string;
    model: string;
    citationCount: number;
  };
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
  detail: string;
}
