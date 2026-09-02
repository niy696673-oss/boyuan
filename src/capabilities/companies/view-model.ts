import type {
  CompanyDetailResponse,
  CompanyDirectoryItem,
  CompanyIndustryPlacementV1,
  CompanyMaterialV1,
  CompanyRelationV1,
  CompanyResearchRecordV1,
  LatestMaterialAnalysisV1,
  ReviewCandidate,
  ReviewEvidence,
  ReviewKnowledge,
  SubjectKindStatusV1,
  SubjectKindV1,
  SubjectCompanyLinkV1,
} from "../../../shared/research-platform-v1";
import type { Claim, Company, Evidence } from "../../types";

type CompanyMaterialAnalysisView = LatestMaterialAnalysisV1 & {
  sections?: NonNullable<
    CompanyDetailResponse["latestMaterialAnalysis"]
  >["sections"];
};

export interface CompanyAnalysisStatus {
  state: LatestMaterialAnalysisV1["taskStatus"] | "confirmed" | "not_started";
  label: string;
  tone: "success" | "warning" | "neutral";
}

export interface CompanyView extends Company {
  version: number;
  subjectKind: SubjectKindV1;
  subjectKindStatus: SubjectKindStatusV1;
  suggestedSubjectKind?: SubjectKindV1;
  subjectKindReason?: string;
  parentCompany?: SubjectCompanyLinkV1;
  materialCount: number;
  knowledgeCount: number;
  pendingCandidateCount: number;
  hasConflict: boolean;
  industryTags: string[];
  location?: string;
  foundedAt?: string;
  latestFunding?: string;
  materials: CompanyMaterialV1[];
  researchRecords: CompanyResearchRecordV1[];
  relations: CompanyRelationV1[];
  industryPlacements: CompanyIndustryPlacementV1[];
  latestMaterialAnalysis?: CompanyMaterialAnalysisView;
  analysisStatus: CompanyAnalysisStatus;
}

export function companyDirectoryView(item: CompanyDirectoryItem): CompanyView {
  return {
    ...baseView(item),
    claims: [],
    evidence: [],
    materialCount: item.materialCount,
    knowledgeCount: item.knowledgeCount,
    pendingCandidateCount: item.pendingCandidateCount,
    hasConflict: Object.values(item.profile).some(
      (field) => typeof field === "object" && field.state === "conflicted",
    ),
    industryTags: [
      item.profile.primaryIndustry.value,
      item.profile.industryPosition.value,
    ].filter((value): value is string => Boolean(value)),
    ...(item.profile.location.value ? { location: item.profile.location.value } : {}),
    ...(item.profile.foundedAt.value ? { foundedAt: item.profile.foundedAt.value } : {}),
    ...(item.profile.latestFunding.value ? { latestFunding: item.profile.latestFunding.value } : {}),
    materials: [],
    researchRecords: [],
    relations: [],
    industryPlacements: [],
    ...(item.latestMaterialAnalysis
      ? { latestMaterialAnalysis: item.latestMaterialAnalysis }
      : {}),
    analysisStatus: analysisStatus(
      item.latestMaterialAnalysis,
      item.knowledgeCount,
      item.pendingCandidateCount,
      item.materialCount,
    ),
  };
}

export function companyDetailView(detail: CompanyDetailResponse): CompanyView {
  const confirmed = detail.knowledge.map(knowledgeClaim);
  const pending = detail.pendingCandidates.map(candidateClaim);
  const evidence = uniqueEvidence([
    ...detail.knowledge.flatMap((item) => item.evidence),
    ...detail.pendingCandidates.flatMap((item) => item.evidence),
  ]);
  return {
    ...baseView(detail),
    claims: [...confirmed, ...pending],
    evidence,
    materialCount: detail.materialCount,
    knowledgeCount: detail.knowledge.filter(
      (item) => item.status !== "superseded",
    ).length,
    pendingCandidateCount: detail.pendingCandidateCount,
    hasConflict:
      detail.knowledge.some((item) => item.status === "disputed") ||
      detail.pendingCandidates.some((item) => item.status === "conflicted"),
    industryTags: detail.industryPlacements
      .filter((item) => item.status !== "conflicted")
      .flatMap((item) => [item.industryName, item.nodeName, item.positionLabel])
      .filter(
        (value, index, values): value is string =>
          Boolean(value) && values.indexOf(value) === index,
      ),
    ...(detail.profile.location.value ? { location: detail.profile.location.value } : {}),
    ...(detail.profile.foundedAt.value ? { foundedAt: detail.profile.foundedAt.value } : {}),
    ...(detail.profile.latestFunding.value ? { latestFunding: detail.profile.latestFunding.value } : {}),
    materials: detail.materials,
    researchRecords: detail.researchRecords,
    relations: detail.relations,
    industryPlacements: detail.industryPlacements,
    ...(detail.latestMaterialAnalysis
      ? { latestMaterialAnalysis: detail.latestMaterialAnalysis }
      : {}),
    analysisStatus: analysisStatus(
      detail.latestMaterialAnalysis,
      detail.knowledge.filter((item) => item.status !== "superseded").length,
      detail.pendingCandidateCount,
      detail.materialCount,
    ),
  };
}

function baseView(
  item: Omit<CompanyDirectoryItem, "knowledgeCount"> &
    Partial<Pick<CompanyDirectoryItem, "knowledgeCount">>,
) {
  return {
    id: item.companyId,
    version: item.version,
    subjectKind: item.subjectKind || "unknown",
    subjectKindStatus: item.subjectKindStatus || "pending",
    ...(item.suggestedSubjectKind
      ? { suggestedSubjectKind: item.suggestedSubjectKind }
      : {}),
    ...(item.subjectKindReason
      ? { subjectKindReason: item.subjectKindReason }
      : {}),
    ...(item.parentCompany ? { parentCompany: item.parentCompany } : {}),
    standardName: item.canonicalName,
    aliases: item.aliases.map((alias) => alias.alias),
    description: materialAnalysisDescription(item),
    cognitionStatus: item.status === "provisional" ? "待完善" : "已建档",
    attentionStatus: item.profile.watched ? "持续跟踪" : "未关注",
    positions: [],
    updatedAt: item.updatedAt,
  };
}

function materialAnalysisDescription(
  item: Omit<CompanyDirectoryItem, "knowledgeCount"> &
    Partial<Pick<CompanyDirectoryItem, "knowledgeCount">>,
): string {
  const summary = item.latestMaterialAnalysis?.summary?.trim();
  if (summary) return summary;
  if (item.profile.summary.value?.trim()) return item.profile.summary.value;
  switch (item.latestMaterialAnalysis?.taskStatus) {
    case "queued":
      return "材料已归档，等待开始分析。";
    case "running":
      return "最近材料正在分析，完成后将在此展示摘要。";
    case "waiting":
      return "最近材料分析正在等待后续处理。";
    case "pending_confirmation":
      return "材料分析已完成，结论等待人工确认。";
    case "completed":
      return "最近材料分析已完成，暂无可展示摘要。";
    case "failed":
      return "最近材料分析失败，可在材料页查看处理状态。";
    case "cancelled":
      return "最近材料分析已取消。";
    default:
      return item.materialCount > 0
        ? "材料已归档，尚未生成分析摘要。"
        : "尚无材料分析。";
  }
}

function analysisStatus(
  latest: LatestMaterialAnalysisV1 | undefined,
  knowledgeCount: number,
  pendingCandidateCount: number,
  materialCount: number,
): CompanyAnalysisStatus {
  const taskStatus = latest?.taskStatus;
  if (taskStatus === "queued")
    return { state: taskStatus, label: "分析排队中", tone: "warning" };
  if (taskStatus === "running")
    return { state: taskStatus, label: "分析进行中", tone: "warning" };
  if (taskStatus === "waiting")
    return { state: taskStatus, label: "等待继续处理", tone: "warning" };
  if (taskStatus === "failed")
    return { state: taskStatus, label: "分析失败", tone: "warning" };
  if (taskStatus === "cancelled")
    return { state: taskStatus, label: "分析已取消", tone: "warning" };
  if (taskStatus === "pending_confirmation" || pendingCandidateCount > 0) {
    return {
      state: "pending_confirmation",
      label: pendingCandidateCount
        ? `待确认 ${pendingCandidateCount}`
        : "分析结果待确认",
      tone: "warning",
    };
  }
  if (knowledgeCount > 0) {
    return {
      state: "confirmed",
      label: `已确认知识 ${knowledgeCount}`,
      tone: "success",
    };
  }
  if (taskStatus === "completed") {
    return { state: taskStatus, label: "分析已完成", tone: "success" };
  }
  return {
    state: "not_started",
    label: materialCount > 0 ? "等待分析" : "尚无分析",
    tone: "neutral",
  };
}

function knowledgeClaim(item: ReviewKnowledge): Claim {
  return {
    id: item.knowledgeId,
    category: item.knowledgeType,
    text: item.statement,
    type: "verified_fact",
    status:
      item.status === "current"
        ? "confirmed"
        : item.status === "disputed"
          ? "disputed"
          : "superseded",
    confidence: 1,
    version: item.version,
    eventTime: item.effectiveAt || item.createdAt,
    evidenceIds: item.evidence.map((evidence) => evidence.evidenceId),
    visibility: "organization",
  };
}

function candidateClaim(item: ReviewCandidate): Claim {
  return {
    id: item.candidateId,
    category: item.knowledgeType,
    text: item.statement,
    type: "ai_inference",
    status: item.status === "conflicted" ? "disputed" : "candidate",
    confidence: 0,
    version: item.version,
    eventTime: item.effectiveAt || item.updatedAt,
    evidenceIds: item.evidence.map((evidence) => evidence.evidenceId),
    visibility: "organization",
  };
}

function uniqueEvidence(items: ReviewEvidence[]): Evidence[] {
  return [
    ...new Map(items.map((item) => [item.evidenceId, item])).values(),
  ].map((item) => ({
    id: item.evidenceId,
    documentId: item.documentId || "",
    fileName: item.fileName || item.title || item.site || "外部证据",
    excerpt: item.quote,
    ...(item.page === undefined ? {} : { page: item.page }),
    sourceDate: item.publishedAt || item.retrievedAt || "日期待补充",
    visibility: "organization",
  }));
}
