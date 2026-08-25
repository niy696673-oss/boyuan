import type {
  CompanyDetailResponse,
  CompanyDirectoryItem,
  CompanyIndustryPlacementV1,
  CompanyMaterialV1,
  CompanyRelationV1,
  CompanyResearchRecordV1,
  ReviewCandidate,
  ReviewEvidence,
  ReviewKnowledge,
} from "../../../shared/research-platform-v1";
import type { Claim, Company, Evidence } from "../../types";

export interface CompanyView extends Company {
  version: number;
  materialCount: number;
  knowledgeCount: number;
  pendingCandidateCount: number;
  hasConflict: boolean;
  industryTags: string[];
  materials: CompanyMaterialV1[];
  researchRecords: CompanyResearchRecordV1[];
  relations: CompanyRelationV1[];
  industryPlacements: CompanyIndustryPlacementV1[];
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
    materials: [],
    researchRecords: [],
    relations: [],
    industryPlacements: [],
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
    materials: detail.materials,
    researchRecords: detail.researchRecords,
    relations: detail.relations,
    industryPlacements: detail.industryPlacements,
  };
}

function baseView(
  item: Omit<CompanyDirectoryItem, "knowledgeCount"> &
    Partial<Pick<CompanyDirectoryItem, "knowledgeCount">>,
): Omit<Company, "claims" | "evidence"> & { version: number } {
  return {
    id: item.companyId,
    version: item.version,
    standardName: item.canonicalName,
    aliases: item.aliases.map((alias) => alias.alias),
    description: item.profile.summary.value || "基础档案，等待补充已确认认知。",
    cognitionStatus: item.status === "provisional" ? "待完善" : "已建档",
    attentionStatus: item.profile.watched ? "持续跟踪" : "未关注",
    positions: [],
    updatedAt: item.updatedAt,
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
