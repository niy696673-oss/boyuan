// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { CompanyRelationshipPanoramaItemV1 } from "../../shared/research-platform-v1";
import { CompanyRelationshipPanorama } from "./CompanyRelationshipPanorama";

describe("公司关联性全景", () => {
  it("展示三类来源并按来源筛选，跨来源同一关系不互相覆盖", () => {
    renderPanorama([
      relationship({
        relationshipId: "bp-upstream",
        sourceKind: "bp_self_report",
        evidence: [materialEvidence()],
      }),
      relationship({
        relationshipId: "library-upstream",
        sourceKind: "project_library",
        verificationStatus: "confirmed",
        targetCompanyId: "company-supplier",
        evidence: [materialEvidence("library-evidence")],
      }),
      relationship({
        relationshipId: "external-customer",
        sourceKind: "external",
        category: "customer",
        targetName: "星河制造",
        relationType: "标杆客户",
        evidence: [externalEvidence()],
      }),
    ]);

    expect(screen.getByLabelText("关联关系来源图例")).toBeTruthy();
    expect(screen.getAllByText("BP 自陈").length).toBeGreaterThan(0);
    expect(screen.getAllByText("企业项目库").length).toBeGreaterThan(0);
    expect(screen.getAllByText("外部来源").length).toBeGreaterThan(0);
    expect(screen.getAllByText("北斗云")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "外部来源 1" }));

    expect(
      screen
        .getByRole("button", { name: "外部来源 1" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("星河制造")).toBeTruthy();
    expect(screen.queryByText("北斗云")).toBeNull();
    expect(screen.getAllByText(/当前筛选下暂无/)).toHaveLength(2);
  });

  it("展开全部证据并显示可访问的完整外部 URL", () => {
    renderPanorama([
      relationship({
        relationshipId: "external-customer",
        sourceKind: "external",
        category: "customer",
        targetName: "星河制造",
        relationType: "标杆客户",
        evidence: [externalEvidence()],
      }),
    ]);
    const card = screen.getByRole("article", { name: "星河制造 · 外部来源" });

    fireEvent.click(within(card).getByText("查看 1 条证据"));

    expect(
      within(card).getByText("公开报道确认双方开展联合验证。"),
    ).toBeTruthy();
    const link = within(card).getByRole("link", {
      name: /https:\/\/example\.com\/research\/customer\?from=boyuan/,
    });
    expect(link.getAttribute("href")).toBe(
      "https://example.com/research/customer?from=boyuan",
    );
  });
});

function renderPanorama(items: CompanyRelationshipPanoramaItemV1[]) {
  return render(
    <MemoryRouter>
      <CompanyRelationshipPanorama
        companyId="company-1"
        companyName="云杉智能有限公司"
        items={items}
      />
    </MemoryRouter>,
  );
}

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

function materialEvidence(evidenceId = "material-evidence") {
  return {
    evidenceId,
    sourceType: "material" as const,
    quote: "BP 第 8 页披露北斗云为算力供应商。",
    fileName: "云杉智能 BP.pdf",
    page: 8,
  };
}

function externalEvidence() {
  return {
    evidenceId: "external-evidence",
    sourceType: "web" as const,
    quote: "公开报道确认双方开展联合验证。",
    title: "联合验证公告",
    site: "示例资讯",
    url: "https://example.com/research/customer?from=boyuan",
  };
}
