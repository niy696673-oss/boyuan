// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "../api";
import type { CompanyDirectoryClient } from "../capabilities/companies/client";
import type { IndustryDirectoryClient } from "../capabilities/industries/client";
import type { ResearchPlatformClient } from "../capabilities/research/client";
import type {
  ConversationDetail,
  ConversationSummary,
} from "../capabilities/research/types";
import type {
  CompanyDirectoryItem,
  IndustryDirectoryItemV1,
} from "../../shared/research-platform-v1";
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

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("工作台研究平台接缝", () => {
  it("在 StrictMode 首次请求被清理后仍能打开飞书深链", async () => {
    const detail = conversationDetail();
    const getConversation = vi.fn((_: string, signal?: AbortSignal) => {
      if (getConversation.mock.calls.length === 1) {
        return new Promise<ConversationDetail>((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }
      return Promise.resolve(detail);
    });
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([detail]),
      getConversation,
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
    };

    render(
      <StrictMode>
        <MemoryRouter>
          <WorkbenchPage
            data={emptyBootstrap()}
            reload={vi.fn()}
            researchClient={client}
            initialConversationId={detail.conversationId}
          />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(
      await screen.findByRole("heading", {
        name: detail.document.fileName,
        level: 1,
      }),
    ).toBeTruthy();
    expect(getConversation).toHaveBeenCalledTimes(2);
  });

  it("通过飞书深链直接打开指定的持久对话", async () => {
    const detail = conversationDetail();
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([detail]),
      getConversation: vi.fn().mockResolvedValue(detail),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          initialConversationId={detail.conversationId}
        />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(client.getConversation).toHaveBeenCalledWith(
        detail.conversationId,
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByRole("heading", {
        name: detail.document.fileName,
        level: 1,
      }),
    ).toBeTruthy();
  });

  it("首页治理入口展示持久审核队列数量", async () => {
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn(),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
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
      startIndustryResearch: vi.fn(),
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

  it("从公司上下文显式确认输入范围后创建 BP 诊断 Skill 任务", async () => {
    const detail = conversationDetail();
    detail.type = "company";
    detail.task.type = "company_research";
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn().mockResolvedValue(detail),
      uploadDocument: vi.fn(),
      getCompanyResearchWorkflowSources: vi.fn().mockResolvedValue([
        {
          sourceId: "source-bp-1",
          title: "白杨智能 BP.pdf",
          locator: "page:1",
        },
      ]),
      startCompanyResearch: vi.fn().mockResolvedValue(detail),
      startIndustryResearch: vi.fn(),
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

    await screen.findByRole("button", { name: /白杨智能/ });
    fireEvent.click(
      screen.getByRole("button", { name: "BP 材料完整性复核" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "融资或交易阶段" }), {
      target: { value: "A 轮" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByRole("textbox", { name: "研究问题" }), {
      target: { value: "诊断当前 BP 的证据缺口" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送问题" }));

    await waitFor(() => expect(client.startCompanyResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-persistent-1",
        explicitWebSearch: false,
        workflow: expect.objectContaining({
          skill: "diagnose-bp",
          scope: expect.objectContaining({
            stage: "A 轮",
            decisionOwner: "投资经理",
          }),
          inputScopeApproval: expect.objectContaining({
            approved: true,
            approvedBy: "投资经理",
            sourceIds: ["source-bp-1"],
          }),
        }),
      }),
    ));
    expect(
      screen.getByText(/不替代标准 BP 深度分析/),
    ).toBeTruthy();
  });

  it("行业深链通过持久研究接口创建行业任务", async () => {
    const industry = industryItem("industry-1", "人工智能");
    const detail = conversationDetail();
    detail.type = "industry";
    detail.task.type = "industry_research";
    detail.industry = industry;
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn().mockResolvedValue(detail),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn().mockResolvedValue(detail),
    };

    render(
      <MemoryRouter initialEntries={["/?industryId=industry-1"]}>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient()}
          industryClient={industryClient([industry])}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: /人工智能/ });
    fireEvent.change(screen.getByRole("textbox", { name: "研究问题" }), {
      target: { value: "分析产业链结构与关键趋势" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送问题" }));

    await waitFor(() => expect(client.startIndustryResearch).toHaveBeenCalledWith({
      industryId: "industry-1",
      intent: "分析产业链结构与关键趋势",
      explicitWebSearch: true,
    }));
  });

  it("展示持久对话并在打开后呈现真实任务步骤", async () => {
    const detail = conversationDetail();
    const summary: ConversationSummary = detail;
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([summary]),
      getConversation: vi.fn().mockResolvedValue(detail),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <WorkbenchPage
                data={emptyBootstrap()}
                reload={vi.fn()}
                researchClient={client}
                companyClient={directoryClient()}
              />
            }
          />
          <Route path="/confirmations" element={<h1>待确认页面</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    const rail = screen.getByRole("complementary", { name: "研究对话" });
    const conversation = await within(rail).findByRole("button", {
      name: /白杨智能 BP\.txt/,
    });
    fireEvent.click(conversation);

    await waitFor(() =>
      expect(client.getConversation).toHaveBeenCalledWith("conversation-1"),
    );
    expect(await screen.findByText("解析文件")).toBeTruthy();
    expect(screen.getByText("生成候选知识")).toBeTruthy();
    expect(screen.getByText("已由研究平台持久保存")).toBeTruthy();
    const reviewCandidates = screen.getByRole("button", {
      name: "1 条候选知识待确认",
    });
    fireEvent.click(reviewCandidates);
    expect(await screen.findByRole("heading", { name: "待确认页面" })).toBeTruthy();
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
      startIndustryResearch: vi.fn(),
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

    const rail = screen.getByRole("complementary", { name: "研究对话" });
    fireEvent.click(
      await within(rail).findByRole("button", { name: /白杨智能 BP\.txt/ }),
    );
    await waitFor(() =>
      expect(within(rail).getByText("待确认 1")).toBeTruthy(),
    );
    expect(client.getConversation).toHaveBeenCalledTimes(1);
  });

  it("将已取消会话作为 warning 终态展示，并停止继续轮询", async () => {
    const detail = conversationDetail();
    detail.status = "cancelled";
    detail.task.status = "cancelled";
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
      startIndustryResearch: vi.fn(),
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

    const rail = screen.getByRole("complementary", { name: "研究对话" });
    fireEvent.click(
      await within(rail).findByRole("button", { name: /白杨智能 BP\.txt/ }),
    );
    const cancelled = await within(rail).findByText("已取消");
    expect(cancelled.classList.contains("warning")).toBe(true);
    expect(client.getConversation).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("等待生成")).toBeNull();
  });

  it("会话栏按标题、来源和类型筛选持久对话", async () => {
    const material = conversationDetail();
    const company: ConversationSummary = {
      ...material,
      conversationId: "conversation-company",
      title: "红杉机器人公司研究",
      type: "company",
      sourceChannel: "web",
      task: {
        ...material.task,
        taskId: "task-company",
        type: "company_research",
      },
    };
    const industry: ConversationSummary = {
      ...material,
      conversationId: "conversation-industry",
      title: "人工智能行业研究",
      type: "industry",
      sourceChannel: "feishu",
      task: {
        ...material.task,
        taskId: "task-industry",
        type: "industry_research",
      },
    };
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([material, company, industry]),
      getConversation: vi.fn(),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient()}
          industryClient={industryClient()}
        />
      </MemoryRouter>,
    );

    const rail = await screen.findByRole("complementary", { name: "研究对话" });
    const search = within(rail).getByRole("textbox", {
      name: "搜索对话或来源",
    });

    fireEvent.change(search, { target: { value: "飞书" } });
    expect(within(rail).getByText("人工智能行业研究")).toBeTruthy();
    expect(within(rail).queryByText("红杉机器人公司研究")).toBeNull();

    fireEvent.change(search, { target: { value: "公司" } });
    expect(within(rail).getByText("红杉机器人公司研究")).toBeTruthy();
    expect(within(rail).queryByText("人工智能行业研究")).toBeNull();

    fireEvent.change(search, { target: { value: "白杨智能" } });
    expect(within(rail).getByText("白杨智能 BP.txt")).toBeTruthy();
    expect(within(rail).queryByText("红杉机器人公司研究")).toBeNull();
  });

  it("会话栏优先展示最多 30 条未取消对话", async () => {
    const conversations: ConversationSummary[] = Array.from(
      { length: 31 },
      (_, index) => {
        const detail = conversationDetail();
        const sequence = String(index + 1).padStart(2, "0");
        return {
          ...detail,
          conversationId: `conversation-${sequence}`,
          title: `演示任务 ${sequence}`,
          status: index < 30 ? "cancelled" : "completed",
          task: {
            ...detail.task,
            taskId: `task-${sequence}`,
            status: index < 30 ? "cancelled" : "completed",
          },
        };
      },
    );
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue(conversations),
      getConversation: vi.fn(),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
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

    const rail = await screen.findByRole("complementary", { name: "研究对话" });
    expect(within(rail).getAllByRole("button", { name: /演示任务/ })).toHaveLength(30);
    expect(within(rail).getByText("演示任务 31")).toBeTruthy();
    expect(within(rail).queryByText("演示任务 30")).toBeNull();
    fireEvent.click(
      within(rail).getByRole("button", { name: "查看全部对话（31）" }),
    );
    expect(within(rail).getAllByRole("button", { name: /演示任务/ })).toHaveLength(31);
    expect(within(rail).getByText("演示任务 30")).toBeTruthy();
    expect(within(rail).getByRole("button", { name: "收起对话" })).toBeTruthy();
  });

  it("首页近期任务读取平台对话并展示真实来源", async () => {
    const detail = conversationDetail();
    detail.sourceChannel = "wecom";
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([detail]),
      getConversation: vi.fn(),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient()}
          industryClient={industryClient()}
        />
      </MemoryRouter>,
    );

    const recent = screen.getByRole("heading", { name: "近期任务" }).closest("section");
    if (!recent) throw new Error("recent tasks section missing");
    expect(await within(recent).findByText("白杨智能 BP.txt")).toBeTruthy();
    expect(within(recent).getByText(/^企业微信 ·/)).toBeTruthy();
    expect(within(recent).queryByRole("button", { name: "查看全部" })).toBeNull();
    const rail = screen.getByRole("complementary", { name: "研究对话" });
    expect(within(rail).getByText("企业微信")).toBeTruthy();
  });

  it("公司和行业选择器展示目录 API 的真实数量", async () => {
    const company = directoryItem("company-1", "白杨智能有限公司", "白杨智能");
    company.materialCount = 7;
    const industry = industryItem("industry-1", "人工智能");
    industry.companyCount = 4;
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn(),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient([company])}
          industryClient={industryClient([industry])}
        />
      </MemoryRouter>,
    );

    await screen.findByText("从 1 家已有主体中选择");
    const researchTypes = screen.getByLabelText("研究类型");
    fireEvent.click(within(researchTypes).getByRole("button", { name: "公司" }));
    fireEvent.click(await screen.findByRole("button", { name: /选择已有公司/ }));
    expect(await screen.findByText("7 份 BP")).toBeTruthy();
    fireEvent.click(within(researchTypes).getByRole("button", { name: "行业" }));
    fireEvent.click(await screen.findByRole("button", { name: /选择已有行业/ }));
    expect(await screen.findByText("4 家公司")).toBeTruthy();
  });

  it("材料模式拒绝空材料问题并把公司名单入口接到真实导入页", async () => {
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn(),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <WorkbenchPage
                data={emptyBootstrap()}
                reload={vi.fn()}
                researchClient={client}
                companyClient={directoryClient()}
                industryClient={industryClient()}
              />
            }
          />
          <Route path="/companies/import" element={<h1>公司名单导入</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "研究问题" }), {
      target: { value: "请直接分析这家公司" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送问题" }));
    expect(
      await screen.findByText("材料模式请先上传材料；如需直接提问，请切换到公司或行业模式"),
    ).toBeTruthy();
    expect(client.startCompanyResearch).not.toHaveBeenCalled();
    expect(client.startIndustryResearch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /处理公司名单/ }));
    expect(await screen.findByRole("heading", { name: "公司名单导入" })).toBeTruthy();
  });

  it("未生成回答时显示等待态，并按真实归档状态与本次候选展示", async () => {
    const detail = companyResearchDetail();
    detail.document.archiveStatus = "stored";
    detail.status = "processing";
    detail.task.status = "running";
    detail.task.currentStep = "analyze_company";
    detail.analysisSections = [];
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn().mockResolvedValue(detail),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient()}
          industryClient={industryClient()}
          initialConversationId={detail.conversationId}
        />
      </MemoryRouter>,
    );

    expect(await screen.findAllByText("AI 正在生成本次分析结果，请稍候。"))
      .toHaveLength(2);
    expect(screen.queryByText("已自动归档")).toBeNull();
    expect(screen.getByText("公司专注企业智能化服务。")).toBeTruthy();
    expect(screen.getByText(/此处会发起新的研究任务/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "发起新的研究任务" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "查看执行详情" })).toBeNull();
  });

  it("公司研究结果从当前对话段落和候选项展示核心信息与待验证", async () => {
    const detail = companyResearchDetail();
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn().mockResolvedValue(detail),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient()}
          industryClient={industryClient()}
          initialConversationId={detail.conversationId}
        />
      </MemoryRouter>,
    );

    const core = (await screen.findByRole("heading", { name: "核心信息" })).closest("section");
    const risks = screen.getByRole("heading", { name: "风险与待验证" }).closest("section");
    if (!core || !risks) throw new Error("analysis sections missing");
    expect(within(core).getByText("内部材料与公开来源已分别核验。")).toBeTruthy();
    expect(within(risks).getByText("公司专注企业智能化服务。")).toBeTruthy();
  });

  it("公司研究轮询完成后仍保留公司上下文、核心信息与待验证项", async () => {
    const company = {
      companyId: "company-1",
      canonicalName: "白杨智能有限公司",
      aliases: [{ alias: "白杨智能", type: "short_name" }],
      status: "active" as const,
      version: 1,
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:01:00.000Z",
    };
    const running = companyResearchDetail();
    running.company = company;
    running.status = "processing";
    running.task.status = "running";
    running.analysisSections = [];
    running.candidates = [];
    const completed = companyResearchDetail();
    completed.company = company;
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(completed);
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([]),
      getConversation,
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient()}
          industryClient={industryClient()}
          initialConversationId={running.conversationId}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/公司：白杨智能/)).toBeTruthy();
    const core = screen.getByRole("heading", { name: "核心信息" }).closest("section");
    const risks = screen.getByRole("heading", { name: "风险与待验证" }).closest("section");
    if (!core || !risks) throw new Error("analysis sections missing");
    expect(within(core).getByText("内部材料与公开来源已分别核验。")).toBeTruthy();
    expect(within(risks).getByText("公司专注企业智能化服务。")).toBeTruthy();
  });

  it("分开呈现冻结材料证据与持久 Exa 来源，并只链接安全 URL", async () => {
    localStorage.setItem("boyuan-access-token", "workbench-token");
    localStorage.setItem("boyuan-user", "u-investor");
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response("document bytes", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:workbench-document");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickDownload = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const detail = companyResearchDetail();
    detail.companyResearch?.sources.push({
      evidenceId: "evidence-web-unsafe",
      sourceType: "web",
      quote: "不安全地址只显示，不打开。",
      site: "unsafe.example",
      url: "javascript:alert(1)",
      retrievedAt: "2026-08-26T02:00:00.000Z",
      accessStatus: "metadata_only",
    });
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn().mockResolvedValue(detail),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient()}
          industryClient={industryClient()}
          initialConversationId={detail.conversationId}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("白杨智能公开进展")).toBeTruthy();
    expect(screen.getByText("example.com")).toBeTruthy();
    expect(screen.getByText("https://example.com/company")).toBeTruthy();
    expect(screen.getByText(/已获取/)).toBeTruthy();
    const sourceLink = screen.getByRole("link", {
      name: "打开外部来源：白杨智能公开进展",
    });
    expect(sourceLink.getAttribute("href")).toBe("https://example.com/company");
    expect(screen.getByText("evidence-material-approved")).toBeTruthy();
    expect(screen.queryByText("evidence-web-1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "下载原文" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/v1/documents/document-1/content",
      expect.objectContaining({
        headers: {
          accept: "application/octet-stream",
          authorization: "Bearer workbench-token",
          "x-user-id": "u-investor",
        },
      }),
    );

    const materialRow = document.querySelector(".by-file-row");
    expect(materialRow).toBeTruthy();
    fireEvent.click(materialRow as HTMLElement);
    const drawer = screen.getByRole("complementary", { name: "证据详情" });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "下载原文" }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(clickDownload).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("javascript:alert(1)")).toBeNull();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.queryByText(/尚未执行外部信息核验/)).toBeNull();
  });

  it("Exa 已执行但没有结果时不再显示尚未执行", async () => {
    const detail = companyResearchDetail();
    if (!detail.companyResearch) throw new Error("company research missing");
    detail.companyResearch.sources = [];
    detail.analysisSections[0]!.evidence = detail.analysisSections[0]!.evidence.filter(
      (item) => item.sourceType === "material",
    );
    const client: ResearchPlatformClient = {
      listConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn().mockResolvedValue(detail),
      uploadDocument: vi.fn(),
      startCompanyResearch: vi.fn(),
      startIndustryResearch: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WorkbenchPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          researchClient={client}
          companyClient={directoryClient()}
          industryClient={industryClient()}
          initialConversationId={detail.conversationId}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("外部信息核验已执行，本次未返回可展示来源。"),
    ).toBeTruthy();
    expect(screen.queryByText(/尚未执行外部信息核验/)).toBeNull();
  });

  it.each(["company", "industry"] as const)(
    "%s Exa 失败时展示执行详情和重新发送语义",
    async (kind) => {
      const detail = failedExternalResearchDetail(kind);
      const client: ResearchPlatformClient = {
        listConversations: vi.fn().mockResolvedValue([]),
        getConversation: vi.fn().mockResolvedValue(detail),
        uploadDocument: vi.fn(),
        startCompanyResearch: vi.fn(),
        startIndustryResearch: vi.fn(),
      };

      render(
        <MemoryRouter>
          <WorkbenchPage
            data={emptyBootstrap()}
            reload={vi.fn()}
            researchClient={client}
            companyClient={directoryClient()}
            industryClient={industryClient()}
            initialConversationId={detail.conversationId}
          />
        </MemoryRouter>,
      );

      expect(await screen.findByText("检索失败")).toBeTruthy();
      expect(
        screen.getByText(
          new RegExp(`外部检索步骤失败：${kind}_exa_failed.*重新输入原研究问题.*重试`),
        ),
      ).toBeTruthy();
      if (kind === "company") {
        expect(screen.getByText("白杨智能公开进展")).toBeTruthy();
      }
      expect(screen.queryByText("检索中")).toBeNull();
    },
  );
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

function industryClient(items: IndustryDirectoryItemV1[] = []): IndustryDirectoryClient {
  return {
    list: vi.fn().mockResolvedValue({
      items,
      total: items.length,
      unclassifiedMaterialCount: 0,
    }),
    reclassify: vi.fn(),
    get: vi.fn(),
    confirmClassification: vi.fn(),
    uploadDocument: vi.fn(),
    setWatched: vi.fn(),
  };
}

function industryItem(industryId: string, name: string): IndustryDirectoryItemV1 {
  return {
    industryId,
    name,
    summary: `${name}产业链`,
    status: "active",
    watched: false,
    version: 1,
    materialCount: 0,
    companyCount: 0,
    updatedAt: "2026-08-26T00:00:00.000Z",
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

function companyResearchDetail(): ConversationDetail {
  const detail = conversationDetail();
  detail.type = "company";
  detail.title = "白杨智能有限公司公司研究";
  detail.task.type = "company_research";
  detail.task.steps.push({
    stepId: "step-search",
    name: "execute_external_search",
    position: 8,
    status: "completed",
    attempts: 1,
  });
  detail.analysisSections = [
    {
      key: "company_research",
      title: "公司研究结论",
      summary: "内部材料与公开来源已分别核验。",
      evidence: [
        {
          evidenceId: "evidence-material-approved",
          sourceType: "material",
          quote: "公司专注企业智能化服务。",
          fileName: "白杨智能 BP.txt",
          documentId: "document-1",
          page: 2,
        },
        {
          evidenceId: "evidence-web-1",
          sourceType: "web",
          quote: "公司发布公开进展。",
          title: "白杨智能公开进展",
          site: "example.com",
          url: "https://example.com/company",
          retrievedAt: "2026-08-26T01:00:00.000Z",
        },
      ],
    },
  ];
  detail.companyResearch = {
    runId: "research-1",
    companyId: "company-1",
    intent: "核验最新公开进展",
    explicitWebSearch: true,
    triggerReason: "user_requested",
    publicQuery: "白杨智能 最新公开进展",
    summary: "内部材料与公开来源已分别核验。",
    sources: [
      {
        evidenceId: "evidence-web-1",
        sourceType: "web",
        quote: "公司发布公开进展。",
        title: "白杨智能公开进展",
        site: "example.com",
        url: "https://example.com/company",
        retrievedAt: "2026-08-26T01:00:00.000Z",
        accessStatus: "accessible",
      },
    ],
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T01:00:00.000Z",
  };
  return detail;
}

function failedExternalResearchDetail(
  kind: "company" | "industry",
): ConversationDetail {
  const detail = companyResearchDetail();
  detail.conversationId = `conversation-${kind}-failed`;
  detail.type = kind;
  detail.status = "failed";
  detail.task.type = kind === "company" ? "company_research" : "industry_research";
  detail.task.status = "failed";
  detail.task.currentStep =
    kind === "company" ? "execute_external_search" : "execute_industry_search";
  const searchStep = detail.task.steps.find((step) =>
    ["execute_external_search", "execute_industry_search"].includes(step.name),
  );
  if (!searchStep) throw new Error("search step missing");
  searchStep.name = detail.task.currentStep;
  searchStep.status = "failed";
  searchStep.errorCode = `${kind}_exa_failed`;
  detail.analysisSections[0]!.evidence = detail.analysisSections[0]!.evidence.filter(
    (item) => item.sourceType === "material",
  );
  const companyResearch = detail.companyResearch;
  if (!companyResearch) throw new Error("company research missing");
  if (kind === "industry") {
    companyResearch.sources = [];
    delete detail.companyResearch;
    detail.industryResearch = {
      runId: companyResearch.runId,
      industryId: "industry-1",
      intent: companyResearch.intent,
      explicitWebSearch: companyResearch.explicitWebSearch,
      triggerReason: "user_requested",
      publicQuery: companyResearch.publicQuery,
      sources: [],
      createdAt: companyResearch.createdAt,
      updatedAt: companyResearch.updatedAt,
    };
  }
  return detail;
}
