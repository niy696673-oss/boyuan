// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    expect(screen.getByText("待分类材料").parentElement?.textContent).toContain("3");
    expect(client.list).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledWith("industry-1", expect.any(AbortSignal));
  });

  it("草稿行业显示待确认分类，并通过 v1 接缝重新分类", async () => {
    const detail = industryDetail();
    detail.status = "draft";
    const client = fakeClient(detail);
    vi.mocked(client.reclassify).mockResolvedValue({
      companies: 2,
      industries: 1,
      mergedIndustries: 1,
      unclassifiedMaterials: 3,
    });
    const data = bootstrap();
    data.user.role = "knowledge_admin";

    render(
      <MemoryRouter>
        <IndustriesPage data={data} reload={vi.fn()} industryClient={client} />
      </MemoryRouter>,
    );

    const heading = await screen.findByRole("heading", { name: "人工智能" });
    const card = heading.closest("article");
    if (!card) throw new Error("industry card missing");
    expect(within(card).getByText("待确认分类")).toBeTruthy();
    expect(within(card).queryByText("正式知识")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重新分类" }));
    await waitFor(() => expect(client.reclassify).toHaveBeenCalledOnce());
    expect(await screen.findByText(/2 家公司已重新分类.*3 份材料待分类/)).toBeTruthy();
  });

  it("行业详情不会把 draft 产业链标成正式知识", async () => {
    const detail = industryDetail();
    detail.status = "draft";
    const client = fakeClient(detail);

    render(
      <MemoryRouter initialEntries={["/industry/industry-1?tab=chain"]}>
        <Routes>
          <Route path="/industry/:id" element={<IndustryDetailPage data={bootstrap()} industryClient={client} />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "人工智能" });
    expect(screen.getAllByText("待确认分类").length).toBeGreaterThan(0);
    expect(screen.queryByText("BP 正式知识")).toBeNull();
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

  it("概览和材料表按 API 状态诚实展示处理进度", async () => {
    const client = fakeClient();
    const detail = industryDetail();
    const statuses = [
      ["processing", "处理中"],
      ["waiting", "待处理"],
      ["pending_confirmation", "待处理"],
      ["failed", "失败"],
      ["completed", "已完成"],
      ["cancelled", "已取消"],
    ] as const;
    detail.materials = statuses.map(([status], index) => ({
      conversationId: `conversation-status-${index}`,
      documentId: `document-status-${index}`,
      fileName: `${status}材料.pdf`,
      status,
      sourceChannel: "web",
      updatedAt: `2026-08-26T0${index}:00:00.000Z`,
    }));
    vi.mocked(client.get).mockResolvedValue(detail);

    render(
      <MemoryRouter initialEntries={["/industry/industry-1"]}>
        <Routes>
          <Route path="/industry/:id" element={<IndustryDetailPage data={bootstrap()} industryClient={client} />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "人工智能" });
    for (const [status, label] of statuses.slice(0, 5)) {
      expect(
        screen.getByRole("button", { name: new RegExp(`${status}材料.*${label}`) }),
      ).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: /^材料/ }));
    for (const [status, label] of statuses) {
      expect(
        screen.getByRole("button", { name: new RegExp(`${status}材料.*${label}`) }),
      ).toBeTruthy();
    }
    expect(screen.queryByText("已分析")).toBeNull();
  });

  it("上传后立即刷新时仍展示 API 返回的处理中状态", async () => {
    const client = fakeClient();
    const initial = industryDetail();
    const refreshed = industryDetail();
    refreshed.materials = [
      {
        conversationId: "conversation-uploading",
        documentId: "document-uploading",
        fileName: "新上传行业材料.pdf",
        status: "processing",
        sourceChannel: "web",
        updatedAt: "2026-08-26T03:00:00.000Z",
      },
      ...refreshed.materials,
    ];
    vi.mocked(client.get)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(refreshed);
    vi.mocked(client.uploadDocument).mockResolvedValue({
      reusedDocument: false,
      conversation: { conversationId: "conversation-uploading" },
    } as Awaited<ReturnType<IndustryDirectoryClient["uploadDocument"]>>);

    render(
      <MemoryRouter initialEntries={["/industry/industry-1"]}>
        <Routes>
          <Route path="/industry/:id" element={<IndustryDetailPage data={bootstrap()} industryClient={client} />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "人工智能" });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: {
        files: [
          new File(["fixture"], "新上传行业材料.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("button", {
        name: /新上传行业材料\.pdf.*处理中/,
      }),
    ).toBeTruthy();
    expect(screen.queryByText("已分析")).toBeNull();
  });
});

function fakeClient(detail = industryDetail()): IndustryDirectoryClient {
  return {
    list: vi.fn().mockResolvedValue({
      items: [{
        industryId: detail.industryId,
        name: detail.name,
        summary: detail.summary,
        status: detail.status,
        watched: detail.watched,
        version: detail.version,
        materialCount: detail.materialCount,
        companyCount: detail.companyCount,
        updatedAt: detail.updatedAt,
      }],
      total: 1,
      unclassifiedMaterialCount: 3,
    }),
    reclassify: vi.fn(),
    get: vi.fn().mockResolvedValue(detail),
    uploadDocument: vi.fn(),
    setWatched: vi.fn().mockResolvedValue(detail),
  };
}

function industryDetail(): IndustryDetailResponseV1 {
  return {
    industryId: "industry-1",
    name: "人工智能",
    summary: "人工智能产业链",
    status: "active" as const,
    watched: false,
    version: 1,
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
    researchRecords: [],
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
