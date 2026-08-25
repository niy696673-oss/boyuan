// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "../api";
import type { CompanyDirectoryClient } from "../capabilities/companies/client";
import { ResearchPlatformApiError } from "../capabilities/platform-http";
import type {
  CompanyDetailResponse,
  CompanyDirectoryItem,
} from "../../shared/research-platform-v1";
import { CompaniesPage, CompanyDetailPage } from "./CompanyPages";

vi.mock("@gsap/react", () => ({ useGSAP: () => undefined }));
vi.mock("gsap", () => ({
  default: { registerPlugin: vi.fn(), from: vi.fn() },
}));

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});

describe("持久公司目录页面", () => {
  it("列表只展示持久公司及其真实计数", async () => {
    const client = fakeClient();

    render(
      <MemoryRouter>
        <CompaniesPage data={bootstrap()} companyClient={client} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "云杉智能" }),
    ).toBeTruthy();
    expect(screen.getByText("2", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("3", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("待确认 1")).toBeTruthy();
    expect(screen.queryByText("错误回退公司")).toBeNull();
    expect(client.list).toHaveBeenCalledOnce();
  });

  it("详情展示正式知识、证据、材料和待确认数量", async () => {
    const client = fakeClient();

    render(
      <MemoryRouter initialEntries={["/companies/company-1"]}>
        <Routes>
          <Route
            path="/companies/:id"
            element={
              <CompanyDetailPage
                data={bootstrap()}
                reload={vi.fn()}
                companyClient={client}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "云杉智能" }),
    ).toBeTruthy();
    expect(
      screen.getAllByText("公司提供智能制造平台。", { exact: true }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("BP 第 3 页：平台已服务 20 家工厂。"))
      .toBeTruthy();
    expect(screen.getByText(/1 条待确认知识需要验证/)).toBeTruthy();
    expect(screen.getByText("云杉智能 BP.pdf")).toBeTruthy();
    expect(client.get).toHaveBeenCalledWith(
      "company-1",
      expect.any(AbortSignal),
    );
  });

  it("未知 ID 显示未找到，不回退到旧数据的第一家公司", async () => {
    const client = fakeClient();
    vi.mocked(client.get).mockRejectedValue(
      new ResearchPlatformApiError(
        "company not found: missing",
        404,
        "not_found",
      ),
    );

    render(
      <MemoryRouter initialEntries={["/companies/missing"]}>
        <Routes>
          <Route
            path="/companies/:id"
            element={
              <CompanyDetailPage
                data={bootstrap()}
                reload={vi.fn()}
                companyClient={client}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "找不到这家公司" }),
    ).toBeTruthy();
    expect(screen.queryByText("错误回退公司")).toBeNull();
  });

  it("详情上传把文件绑定当前公司，并在处理完成后刷新数量", async () => {
    const client = fakeClient();
    const updated = companyDetail();
    updated.materialCount = 3;
    updated.materials = [
      ...updated.materials,
      {
        conversationId: "conversation-new",
        documentId: "document-new",
        fileName: "补充材料.txt",
        status: "completed",
        sourceChannel: "web",
        updatedAt: "2026-08-26T01:00:00.000Z",
      },
    ];
    vi.mocked(client.uploadDocument).mockResolvedValue({
      reusedDocument: false,
      conversation: { conversationId: "conversation-new" },
    } as Awaited<ReturnType<CompanyDirectoryClient["uploadDocument"]>>);
    vi.mocked(client.get)
      .mockResolvedValueOnce(companyDetail())
      .mockResolvedValueOnce(updated);

    render(
      <MemoryRouter initialEntries={["/companies/company-1"]}>
        <Routes>
          <Route path="/companies/:id" element={<CompanyDetailPage data={bootstrap()} reload={vi.fn()} companyClient={client} />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "云杉智能" });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["补充"], "补充材料.txt", { type: "text/plain" })] },
    });

    expect(await screen.findByText("材料处理完成，档案数量已刷新")).toBeTruthy();
    expect(client.uploadDocument).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ name: "补充材料.txt" }),
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("button", { name: "材料3" })).toBeTruthy();
  });

  it("关注按钮带当前版本写入并立即回显", async () => {
    const client = fakeClient();
    const watched = companyDetail();
    watched.version = 3;
    watched.profile.watched = true;
    vi.mocked(client.setWatched).mockResolvedValue(watched);

    render(
      <MemoryRouter initialEntries={["/companies/company-1"]}>
        <Routes>
          <Route path="/companies/:id" element={<CompanyDetailPage data={bootstrap()} reload={vi.fn()} companyClient={client} />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "云杉智能" });
    fireEvent.click(screen.getByRole("button", { name: "关注" }));

    await waitFor(() => expect(client.setWatched).toHaveBeenCalledWith(
      "company-1",
      { watched: true, expectedVersion: 2 },
      expect.any(AbortSignal),
    ));
    expect(await screen.findByRole("button", { name: "持续跟踪" })).toBeTruthy();
  });
});

function fakeClient(): CompanyDirectoryClient {
  return {
    list: vi.fn().mockResolvedValue({ items: [directoryItem()], total: 1 }),
    get: vi.fn().mockResolvedValue(companyDetail()),
    uploadDocument: vi.fn(),
    setWatched: vi.fn(),
  };
}

function directoryItem(): CompanyDirectoryItem {
  return {
    companyId: "company-1",
    canonicalName: "云杉智能有限公司",
    status: "active",
    aliases: [{ alias: "云杉智能", type: "short_name" }],
    version: 2,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    profile: {
      summary: { value: "公司提供智能制造平台。", state: "confirmed" },
      primaryIndustry: { value: "人工智能", state: "confirmed" },
      industryPosition: { value: "工业软件", state: "confirmed" },
      location: { state: "missing" },
      foundedAt: { state: "missing" },
      latestFunding: { state: "missing" },
      watched: false,
    },
    materialCount: 2,
    knowledgeCount: 3,
    pendingCandidateCount: 1,
  };
}

function companyDetail(): CompanyDetailResponse {
  const item = directoryItem();
  const { knowledgeCount: _knowledgeCount, ...detailBase } = item;
  return {
    ...detailBase,
    knowledge: [
      {
        knowledgeId: "knowledge-1",
        companyId: "company-1",
        knowledgeType: "company_summary",
        statement: "公司提供智能制造平台。",
        status: "current",
        version: 1,
        sourceCandidateId: "candidate-1",
        evidence: [
          {
            evidenceId: "evidence-1",
            sourceType: "material",
            quote: "BP 第 3 页：平台已服务 20 家工厂。",
            fileName: "云杉智能 BP.pdf",
            documentId: "document-1",
            page: 3,
          },
        ],
        createdAt: "2026-08-26T00:00:00.000Z",
      },
    ],
    materials: [
      {
        conversationId: "conversation-1",
        documentId: "document-1",
        fileName: "云杉智能 BP.pdf",
        status: "completed",
        sourceChannel: "web",
        updatedAt: "2026-08-26T00:00:00.000Z",
      },
    ],
    pendingCandidates: [
      {
        candidateId: "candidate-2",
        companyId: "company-1",
        sectionKey: "financing",
        knowledgeType: "latest_funding",
        statement: "公司完成新一轮融资。",
        status: "pending",
        version: 1,
        highImpact: false,
        sensitive: false,
        evidence: [],
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      },
    ],
    researchRecords: [],
    relations: [],
    industryPlacements: [
      {
        industryId: "industry-1",
        industryName: "人工智能",
        nodeId: "node-1",
        nodeName: "工业软件",
        positionLabel: "智能制造平台",
        status: "confirmed",
      },
    ],
  };
}

function bootstrap(): Bootstrap {
  const user = {
    id: "u-investor",
    name: "投资经理",
    role: "investor" as const,
    projectIds: [],
  };
  return {
    user,
    users: [user],
    companies: [
      {
        id: "legacy-company",
        standardName: "错误回退公司",
        aliases: [],
        description: "不应展示",
        cognitionStatus: "旧数据",
        attentionStatus: "未关注",
        positions: [],
        claims: [],
        evidence: [],
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    industryNodes: [],
    industryEdges: [],
    tasks: [],
    settings: { externalModelsEnabled: false, knowledgeSource: "" },
  };
}
