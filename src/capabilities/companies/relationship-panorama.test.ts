import { describe, expect, it } from "vitest";
import type { CompanyRelationshipPanoramaItemV1 } from "../../../shared/research-platform-v1";
import { buildRelationshipPanorama } from "./relationship-panorama";

describe("公司关联性全景前端投影", () => {
  it("只合并同来源的重复关系，并保留跨来源的同一关系", () => {
    const result = buildRelationshipPanorama([
      relationship({
        relationshipId: "bp-1",
        sourceKind: "bp_self_report",
        evidence: [evidence("bp-evidence-1", "BP 第 8 页")],
      }),
      relationship({
        relationshipId: "bp-2",
        sourceKind: "bp_self_report",
        evidence: [evidence("bp-evidence-2", "BP 第 12 页")],
      }),
      relationship({
        relationshipId: "library-1",
        sourceKind: "project_library",
        verificationStatus: "confirmed",
        evidence: [evidence("library-evidence-1", "已确认公司关系")],
      }),
    ]);

    expect(result.allItems).toHaveLength(2);
    expect(result.allItems.map((item) => item.sourceKind)).toEqual([
      "project_library",
      "bp_self_report",
    ]);
    expect(
      result.allItems.find((item) => item.sourceKind === "bp_self_report")
        ?.evidence,
    ).toHaveLength(2);
    expect(result.sourceCounts).toEqual({
      bp_self_report: 1,
      project_library: 1,
      external: 0,
    });
  });

  it("按来源筛选但保留全量来源计数，并按关系类型分组", () => {
    const items = [
      relationship({ relationshipId: "bp", sourceKind: "bp_self_report" }),
      relationship({
        relationshipId: "external",
        sourceKind: "external",
        category: "customer",
        targetName: "星河制造",
      }),
      relationship({
        relationshipId: "library",
        sourceKind: "project_library",
        category: "competitor",
        targetName: "南山科技",
      }),
    ];

    const result = buildRelationshipPanorama(items, "external");

    expect(result.visibleItems.map((item) => item.relationshipId)).toEqual([
      "external",
    ]);
    expect(result.byCategory.customer).toHaveLength(1);
    expect(result.byCategory.upstream).toHaveLength(0);
    expect(result.sourceCounts).toEqual({
      bp_self_report: 1,
      project_library: 1,
      external: 1,
    });
  });

  it("同来源重复项优先保留冲突状态，同时累积证据", () => {
    const result = buildRelationshipPanorama([
      relationship({
        relationshipId: "candidate",
        sourceKind: "project_library",
        verificationStatus: "candidate",
        evidence: [evidence("candidate-evidence", "待确认关系")],
      }),
      relationship({
        relationshipId: "conflicted",
        sourceKind: "project_library",
        verificationStatus: "conflicted",
        description: "正式知识之间存在冲突。",
        evidence: [evidence("conflict-evidence", "冲突关系")],
      }),
    ]);

    expect(result.allItems[0]).toMatchObject({
      relationshipId: "conflicted",
      verificationStatus: "conflicted",
      description: "正式知识之间存在冲突。",
    });
    expect(result.allItems[0]?.evidence).toHaveLength(2);
  });

  it("同来源同名但公司实体不同的关系不会被合并", () => {
    const result = buildRelationshipPanorama([
      relationship({ relationshipId: "one", targetCompanyId: "company-1" }),
      relationship({ relationshipId: "two", targetCompanyId: "company-2" }),
    ]);

    expect(result.allItems).toHaveLength(2);
  });
});

function relationship(
  overrides: Partial<CompanyRelationshipPanoramaItemV1> = {},
): CompanyRelationshipPanoramaItemV1 {
  return {
    relationshipId: "relationship-1",
    targetName: "北斗云",
    category: "upstream",
    relationType: "云算力供应商",
    description: "为公司提供训练云算力。",
    sourceKind: "bp_self_report",
    sourceLabel: "BP 自陈",
    verificationStatus: "unverified",
    evidence: [],
    updatedAt: "2026-09-03T00:00:00.000Z",
    ...overrides,
  };
}

function evidence(evidenceId: string, quote: string) {
  return {
    evidenceId,
    sourceType: "material" as const,
    quote,
    fileName: "云杉智能 BP.pdf",
  };
}
