// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "../api";
import type { CompanyDirectoryClient } from "../capabilities/companies/client";
import type { ResearchPlatformClient } from "../capabilities/research/client";
import type {
  ConversationDetail,
  ConversationSummary,
} from "../capabilities/research/types";
import type { CompanyDirectoryItem } from "../../shared/research-platform-v1";
import { WorkbenchPage } from "./WorkbenchPage";

vi.mock("@gsap/react", () => ({ useGSAP: () => undefined }));
vi.mock("gsap", () => ({
  default: { registerPlugin: vi.fn(), from: vi.fn() },
}));
vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: { create: vi.fn() },
}));

beforeAll(() => {
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});

describe("工作台研究平台接缝", () => {
  it("首页治理入口展示持久审核队列数量", async () => {
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn(),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient()}
          persistentPendingCount={3}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("3 条待确认")).toBeTruthy();
  });

  it("详情深链预选 SQLite 公司并通过 v1 接缝创建外部调研对话", async () => {
    const detail = conversationDetail();
    detail.type = "company";
    detail.title = "白杨智能有限公司公司研究";
    detail.task.type = "company_research";
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn().mockResolvedValue(detail),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn().mockResolvedValue(detail),
    };

    render(
      <MemoryRouter initialEntries={["/?companyId=company-persistent-1"]}>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient([
            directoryItem("company-persistent-1", "白杨智能有限公司", "白杨智能"),
          ])}
        />
      </MemoryRouter>,
    );

    const home = screen
      .getByRole("heading", { name: "今天想研究什么？" })
      .closest("section");
    if (!home) throw new Error("workbench home missing");
    expect(await within(home).findByRole("button", { name: /白杨智能/ })).toBeTruthy();
    fireEvent.change(within(home).getByRole("textbox", { name: "研究问题" }), {
      target: { value: "核验最新业务与融资动态" },
    });
    fireEvent.click(within(home).getByRole("button", { name: "发送问题" }));

    await waitFor(() =>
      expect(client.startCompanyResearch).toHaveBeenCalledWith({
        companyId: "company-persistent-1",
        intent: "核验最新业务与融资动态",
        explicitWebSearch: true,
      }),
    );
    expect(await screen.findByText("生成候选知识")).toBeTruthy();
  });

  it("展示持久对话并在打开后呈现真实任务步骤", async () => {
    const detail = conversationDetail();
    const summary: ConversationSummary = detail;
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([summary]),
      getConversation: vi.fn().mockResolvedValue(detail),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient()}
        />
      </MemoryRouter>,
    );

    const conversation = await screen.findByRole("button", {
      name: /白杨智能 BP\.txt/,
    });
    fireEvent.click(conversation);

    await waitFor(() =>
      expect(client.getConversation).toHaveBeenCalledWith("conversation-1"),
    );
    expect(await screen.findByText("解析文件")).toBeTruthy();
    expect(screen.getByText("生成候选知识")).toBeTruthy();
    expect(screen.getByText("已由研究平台持久保存")).toBeTruthy();
    expect(screen.getByText("1 条候选知识待确认")).toBeTruthy();
  });

  it("同步会话栏的待确认终态，并停止继续轮询", async () => {
    const detail = conversationDetail();
    detail.status = "pending_confirmation";
    detail.task.status = "pending_confirmation";
    const summary: ConversationSummary = {
      ...detail,
      status: "processing",
      task: { ...detail.task, status: "running" },
    };
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([summary]),
      getConversation: vi.fn().mockResolvedValue(detail),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /白杨智能 BP\.txt/ }),
    );

    const rail = screen.getByRole("complementary", { name: "研究对话" });
    await waitFor(() =>
      expect(within(rail).getByText("待确认 1")).toBeTruthy(),
    );
    expect(client.getConversation).toHaveBeenCalledTimes(1);
  });
});

function emptyBootstrap(): Bootstrap {
  const user = {
    id: "u-investor",
    name: "投资经理",
    role: "investor" as const,
    projectIds: [],
  };
  return {
    user,
    users: [user],
    companies: [],
    industryNodes: [],
    industryEdges: [],
    tasks: [],
    settings: { externalModelsEnabled: false, knowledgeSource: "" },
  };
}

function directoryClient(items: CompanyDirectoryItem[] = []): CompanyDirectoryClient {
  return {
    list: vi.fn().mockResolvedValue({ items, total: items.length }),
    get: vi.fn(),
    uploadDocument: vi.fn(),
    setWatched: vi.fn(),
  };
}

function directoryItem(companyId: string, canonicalName: string, alias: string): CompanyDirectoryItem {
  return {
    companyId,
    canonicalName,
    status: "active",
    aliases: [{ alias, type: "short_name" }],
    version: 1,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    profile: {
      summary: { state: "missing" },
      primaryIndustry: { state: "missing" },
      industryPosition: { state: "missing" },
      location: { state: "missing" },
      foundedAt: { state: "missing" },
      latestFunding: { state: "missing" },
      watched: false,
    },
    materialCount: 0,
    knowledgeCount: 0,
    pendingCandidateCount: 0,
  };
}

function conversationDetail(): ConversationDetail {
  return {
    conversationId: "conversation-1",
    title: "白杨智能 BP.txt",
    type: "material",
    sourceChannel: "web",
    status: "completed",
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:01:00.000Z",
    receiptCount: 1,
    document: {
      documentId: "document-1",
      fileName: "白杨智能 BP.txt",
      bytes: 128,
      sha256: "fixture",
      parseStatus: "parsed",
      archiveStatus: "archived",
      createdAt: "2026-08-26T00:00:00.000Z",
    },
    task: {
      taskId: "task-1",
      type: "material_analysis",
      status: "completed",
      currentStep: "generate_candidates",
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:01:00.000Z",
      providerId: "deterministic-test",
      modelId: "fixture-v1",
      resultStatus: "validated",
      steps: [
        {
          stepId: "step-1",
          name: "parse_document",
          position: 3,
          status: "completed",
          attempts: 1,
        },
        {
          stepId: "step-2",
          name: "generate_candidates",
          position: 9,
          status: "pending_confirmation",
          attempts: 1,
        },
      ],
    },
    analysisSections: [],
    candidates: [
      {
        candidateId: "candidate-1",
        sectionKey: "company_and_project_stage",
        knowledgeType: "company_summary",
        statement: "公司专注企业智能化服务。",
        status: "pending",
        version: 1,
        evidence: [],
        createdAt: "2026-08-26T00:01:00.000Z",
        updatedAt: "2026-08-26T00:01:00.000Z",
      },
    ],
  };
}
