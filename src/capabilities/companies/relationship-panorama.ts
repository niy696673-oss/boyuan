import type {
  CompanyRelationshipPanoramaItemV1,
  ReviewEvidence,
} from "../../../shared/research-platform-v1";

export type RelationshipSourceKind =
  CompanyRelationshipPanoramaItemV1["sourceKind"];
export type RelationshipVerificationStatus =
  CompanyRelationshipPanoramaItemV1["verificationStatus"];
export type RelationshipCategory =
  CompanyRelationshipPanoramaItemV1["category"];
export type RelationshipSourceFilter = "all" | RelationshipSourceKind;

export const RELATIONSHIP_SOURCE_KINDS = [
  "bp_self_report",
  "project_library",
  "external",
] as const satisfies readonly RelationshipSourceKind[];

export const RELATIONSHIP_SOURCE_META: Record<
  RelationshipSourceKind,
  { label: string; description: string }
> = {
  bp_self_report: {
    label: "BP 自陈",
    description: "来自项目材料，AI 提取后默认未核验",
  },
  project_library: {
    label: "企业项目库",
    description: "来自平台公司、正式知识和公司关系",
  },
  external: {
    label: "外部来源",
    description: "来自本次外部研究，默认未核验",
  },
};

const verificationPriority: Record<RelationshipVerificationStatus, number> = {
  confirmed: 0,
  conflicted: 1,
  candidate: 2,
  unverified: 3,
};

const sourcePriority: Record<RelationshipSourceKind, number> = {
  project_library: 0,
  external: 1,
  bp_self_report: 2,
};

export interface RelationshipPanoramaProjection {
  allItems: CompanyRelationshipPanoramaItemV1[];
  visibleItems: CompanyRelationshipPanoramaItemV1[];
  byCategory: Record<RelationshipCategory, CompanyRelationshipPanoramaItemV1[]>;
  sourceCounts: Record<RelationshipSourceKind, number>;
}

/**
 * Provides the page with one stable relationship view. Duplicate rows from the
 * same source are merged defensively; equivalent rows from different sources
 * deliberately remain separate so provenance is never hidden.
 */
export function buildRelationshipPanorama(
  items: CompanyRelationshipPanoramaItemV1[],
  filter: RelationshipSourceFilter = "all",
): RelationshipPanoramaProjection {
  const allItems = deduplicateSameSource(items).sort(compareRelationshipItems);
  const visibleItems =
    filter === "all"
      ? allItems
      : allItems.filter((item) => item.sourceKind === filter);

  return {
    allItems,
    visibleItems,
    byCategory: {
      upstream: visibleItems.filter((item) => item.category === "upstream"),
      downstream: visibleItems.filter((item) => item.category === "downstream"),
      customer: visibleItems.filter((item) => item.category === "customer"),
      competitor: visibleItems.filter((item) => item.category === "competitor"),
    },
    sourceCounts: {
      bp_self_report: allItems.filter(
        (item) => item.sourceKind === "bp_self_report",
      ).length,
      project_library: allItems.filter(
        (item) => item.sourceKind === "project_library",
      ).length,
      external: allItems.filter((item) => item.sourceKind === "external")
        .length,
    },
  };
}

export function relationshipVerificationLabel(
  status: RelationshipVerificationStatus,
): string {
  switch (status) {
    case "confirmed":
      return "已确认";
    case "candidate":
      return "待确认";
    case "conflicted":
      return "有冲突";
    default:
      return "未核验";
  }
}

export function relationshipCategoryLabel(
  category: RelationshipCategory,
): string {
  switch (category) {
    case "upstream":
      return "上游";
    case "downstream":
      return "下游";
    case "customer":
      return "客户";
    default:
      return "竞对";
  }
}

function deduplicateSameSource(
  items: CompanyRelationshipPanoramaItemV1[],
): CompanyRelationshipPanoramaItemV1[] {
  const unique = new Map<string, CompanyRelationshipPanoramaItemV1>();

  for (const item of items) {
    const targetKey = item.targetCompanyId
      ? `company:${item.targetCompanyId}`
      : `name:${normalizeLabel(item.targetName)}`;
    const key = [
      item.sourceKind,
      item.category,
      targetKey,
      normalizeLabel(item.relationType),
    ].join("\u0000");
    const current = unique.get(key);
    if (!current) {
      unique.set(key, { ...item, evidence: uniqueEvidence(item.evidence) });
      continue;
    }

    const preferred =
      verificationPriority[item.verificationStatus] <
      verificationPriority[current.verificationStatus]
        ? item
        : current;
    unique.set(key, {
      ...preferred,
      targetCompanyId:
        preferred.targetCompanyId || current.targetCompanyId || item.targetCompanyId,
      evidence: uniqueEvidence([...current.evidence, ...item.evidence]),
    });
  }

  return [...unique.values()];
}

function uniqueEvidence(items: ReviewEvidence[]): ReviewEvidence[] {
  const unique = new Map<string, ReviewEvidence>();
  for (const item of items) {
    const key = item.evidenceId || `${item.url || ""}\u0000${item.quote}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function compareRelationshipItems(
  left: CompanyRelationshipPanoramaItemV1,
  right: CompanyRelationshipPanoramaItemV1,
): number {
  return (
    sourcePriority[left.sourceKind] - sourcePriority[right.sourceKind] ||
    verificationPriority[left.verificationStatus] -
      verificationPriority[right.verificationStatus] ||
    left.targetName.localeCompare(right.targetName, "zh-CN") ||
    left.relationType.localeCompare(right.relationType, "zh-CN") ||
    left.relationshipId.localeCompare(right.relationshipId)
  );
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s\u3000]+/gu, "")
    .toLocaleLowerCase("zh-CN");
}
