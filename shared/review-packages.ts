import type {
  ReviewPackageV1,
  ReviewQueueItem,
} from "./research-platform-v1.js";

export interface BuildReviewPackagesOptions {
  includeCandidates?: boolean;
  sectionTitle?: (sectionKey: string) => string;
}

type ReviewRiskCandidate = Pick<
  ReviewQueueItem,
  | "highImpact"
  | "sensitive"
  | "status"
  | "evidence"
  | "unsupportedEvidence"
  | "conflictingKnowledge"
>;

export function buildReviewPackages(
  items: ReviewQueueItem[],
  options: BuildReviewPackagesOptions = {},
): ReviewPackageV1[] {
  const byCompany = new Map<string, ReviewQueueItem[]>();
  for (const item of items) {
    const bucket = byCompany.get(item.companyId) ?? [];
    bucket.push(item);
    byCompany.set(item.companyId, bucket);
  }

  return [...byCompany.values()]
    .map((companyItems) => {
      const company = companyItems[0].company;
      const byGroup = new Map<string, ReviewQueueItem[]>();
      for (const item of companyItems) {
        const key = `${item.sectionKey}\u0000${item.knowledgeType}`;
        const bucket = byGroup.get(key) ?? [];
        bucket.push(item);
        byGroup.set(key, bucket);
      }

      const groups = [...byGroup.values()].map((groupItems) => {
        const first = groupItems[0];
        const byFingerprint = new Map<string, ReviewQueueItem[]>();
        for (const item of groupItems) {
          const fingerprint = reviewCandidateFingerprint(item);
          const bucket = byFingerprint.get(fingerprint) ?? [];
          bucket.push(item);
          byFingerprint.set(fingerprint, bucket);
        }

        return {
          groupId: stableReviewId(
            "group",
            company.companyId,
            first.sectionKey,
            first.knowledgeType,
          ),
          sectionKey: first.sectionKey,
          sectionTitle: options.sectionTitle?.(first.sectionKey) ?? first.sectionKey,
          knowledgeType: first.knowledgeType,
          candidateCount: groupItems.length,
          clusters: [...byFingerprint.entries()].map(
            ([fingerprint, candidates]) => {
              const riskReasons = uniqueStrings(
                candidates.flatMap(reviewCandidateRiskReasons),
              );
              return {
                clusterId: stableReviewId(
                  "cluster",
                  company.companyId,
                  first.sectionKey,
                  first.knowledgeType,
                  fingerprint,
                ),
                fingerprint,
                candidateIds: candidates.map((candidate) => candidate.candidateId),
                ...(options.includeCandidates ? { candidates } : {}),
                candidateCount: candidates.length,
                safeToConfirm: riskReasons.length === 0,
                riskReasons,
              };
            },
          ),
        };
      });
      const safeCandidateCount = groups.reduce(
        (total, group) =>
          total
          + group.clusters
            .filter((cluster) => cluster.safeToConfirm)
            .reduce((count, cluster) => count + cluster.candidateCount, 0),
        0,
      );

      return {
        packageId: stableReviewId("package", company.companyId),
        company,
        candidateCount: companyItems.length,
        groupCount: groups.length,
        safeCandidateCount,
        riskCandidateCount: companyItems.length - safeCandidateCount,
        groups,
      };
    })
    .sort(
      (left, right) =>
        right.candidateCount - left.candidateCount
        || left.company.canonicalName.localeCompare(
          right.company.canonicalName,
          "zh-CN",
        ),
    );
}

export function reviewCandidateFingerprint(item: ReviewQueueItem): string {
  return [item.statement, item.value ?? "", item.effectiveAt ?? ""]
    .map(normalizeReviewText)
    .join("\u0000");
}

export function reviewCandidateRiskReasons(item: ReviewRiskCandidate): string[] {
  return [
    ...(item.highImpact ? ["高影响"] : []),
    ...(item.sensitive ? ["敏感信息"] : []),
    ...(item.status === "conflicted" ? ["存在冲突"] : []),
    ...(item.evidence.length === 0 ? ["缺少支持证据"] : []),
    ...((item.unsupportedEvidence?.length ?? 0) > 0
      ? ["存在不支持证据"]
      : []),
    ...((item.conflictingKnowledge?.length ?? 0) > 0
      ? ["与正式知识冲突"]
      : []),
  ];
}

function normalizeReviewText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function stableReviewId(prefix: string, ...parts: string[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of parts.join("\u0000")) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `${prefix}-${hash.toString(16).padStart(16, "0")}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
