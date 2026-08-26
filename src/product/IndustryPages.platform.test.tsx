// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "../api";
import type { IndustryDirectoryClient } from "../capabilities/industries/client";
import { ResearchPlatformApiError } from "../capabilities/platform-http";
import type { IndustryDetailResponseV1 } from "../../shared/research-platform-v1";
import { IndustriesPage, IndustryDetailPage } from "./IndustryPages";

describe("持久行业目录页面", () => {
  it("列表只展示 SQLite 行业及其真实计数", async () => {
    const client = fakeClient();
    render(
      <MemoryRouter>
        <IndustriesPage
          data={bootstrap()}
          reload={vi.fn()}
          industryClient={client}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "人工智能" })).toBeTruthy();
    expect(screen.getAllByText("2", { selector: "dd" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1", { selector: "dd" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("旧行业数据")).toBeNull();
    expect(client.list).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledWith("industry-1", expect.any(AbortSignal));
  });

  it("详情展示持久节点、材料和公司，不对未知 ID 回退", async () => {
    const client = fakeClient();
    render(
      <MemoryRouter initialEntries={["/industry/industry-1"]}>
        <Routes>
          <Route path="/industry/:id" element={<IndustryDetailPage data={bootstrap()} industryClient={client} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "人工智能" })).toBeTruthy();
    expect(screen.getByText("行业补充材料.pdf")).toBeTruthy();
    expect(screen.getByText("行业访谈纪要.docx")).toBeTruthy();
    expect(screen.getByText("云杉智能")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^材料/ }));
    expect(screen.getByText("未关联公司")).toBeTruthy();

    vi.mocked(client.get).mockRejectedValue(
      new ResearchPlatformApiError("industry not found", 404, "not_found"),
    );
    render(
      <MemoryRouter initialEntries={["/industry/missing"]}>
        <Routes>
          <Route path="/industry/:id" element={<IndustryDetailPage data={bootstrap()} industryClient={client} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "找不到这个行业" })).toBeTruthy();
  });

  it("没有公司位置证据时不把行业材料自动归给唯一公司", async () => {
    const client = fakeClient();
    const detail = industryDetail();
    const { evidence: _evidence, ...placementWithoutEvidence } = detail.companies[0];
    detail.companies = [placementWithoutEvidence];
    vi.mocked(client.get).mockResolvedValue(detail);

    render(
      <MemoryRouter initialEntries={["/industry/industry-1"]}>
        <Routes>
          <Route path="/industry/:id" element={<IndustryDetailPage data={bootstrap()} industryClient={client} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "人工智能" })).toBeTruthy();
    expect(screen.getByText("0 份材料")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^材料/ }));
    expect(screen.getAllByText("未关联公司")).toHaveLength(2);
  });
});

function fakeClient(): IndustryDirectoryClient {
  const detail = industryDetail();
  return {
    list: vi.fn().mockResolvedValue({
      items: [{
        industryId: detail.industryId,
        name: detail.name,
        summary: detail.summary,
        status: detail.status,
        materialCount: detail.materialCount,
        companyCount: detail.companyCount,
        updatedAt: detail.updatedAt,
      }],
      total: 1,
    }),
    get: vi.fn().mockResolvedValue(detail),
  };
}

function industryDetail(): IndustryDetailResponseV1 {
  return {
    industryId: "industry-1",
    name: "人工智能",
    summary: "人工智能产业链",
    status: "active" as const,
    materialCount: 2,
    companyCount: 1,
    updatedAt: "2026-08-26T00:00:00.000Z",
    nodes: [
      {
        nodeId: "node-1",
        stage: "midstream" as const,
        name: "工业软件",
        description: "产品与解决方案",
        position: 1,
      },
    ],
    materials: [
      {
        conversationId: "conversation-1",
        documentId: "document-1",
        fileName: "行业补充材料.pdf",
        status: "completed" as const,
        sourceChannel: "web" as const,
        updatedAt: "2026-08-26T00:00:00.000Z",
        evidence: {
          evidenceId: "evidence-1",
          sourceType: "material" as const,
          quote: "公司处于人工智能产业中游。",
        },
      },
      {
        conversationId: "conversation-2",
        documentId: "document-2",
        fileName: "行业访谈纪要.docx",
        status: "completed" as const,
        sourceChannel: "web" as const,
        updatedAt: "2026-08-25T00:00:00.000Z",
      },
    ],
    companies: [
      {
        company: {
          companyId: "company-1",
          canonicalName: "云杉智能有限公司",
          status: "active" as const,
          aliases: [{ alias: "云杉智能", type: "short_name" }],
          version: 1,
          createdAt: "2026-08-26T00:00:00.000Z",
          updatedAt: "2026-08-26T00:00:00.000Z",
        },
        nodeId: "node-1",
        nodeName: "工业软件",
        positionLabel: "智能制造平台",
        status: "confirmed" as const,
        evidence: {
          evidenceId: "evidence-1",
          sourceType: "material" as const,
          quote: "公司处于人工智能产业中游。",
        },
      },
    ],
  };
}

function bootstrap(): Bootstrap {
  const user = {
    id: "u-1",
    name: "投资经理",
    role: "investor" as const,
    projectIds: [],
  };
  return {
    user,
    users: [user],
    companies: [],
    industryNodes: [
      {
        id: "legacy-industry",
        name: "旧行业数据",
        parentId: null,
        level: 0,
        source: "legacy",
      },
    ],
    industryEdges: [],
    tasks: [],
    settings: { externalModelsEnabled: false, knowledgeSource: "" },
  };
}
