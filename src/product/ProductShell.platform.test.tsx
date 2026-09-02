// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "../api";
import type { CompanyDirectoryClient } from "../capabilities/companies/client";
import type { PlatformNavigationClient } from "../capabilities/navigation/client";
import type { ReviewQueueClient } from "../capabilities/review/client";
import type { PlatformNotificationV1 } from "../../shared/research-platform-v1";
import { ProductShell } from "./ProductShell";

const companyPages = vi.hoisted(() => ({
  companies: vi.fn(() => <div>公司</div>),
  detail: vi.fn(() => <div>公司详情</div>),
}));

vi.mock("./WorkbenchPage", () => ({
  WorkbenchPage: () => <div>工作台</div>,
}));
vi.mock("./CompanyPages", () => ({
  CompaniesPage: companyPages.companies,
  CompanyDetailPage: companyPages.detail,
  CompanyImportPage: () => <div>导入公司</div>,
}));
vi.mock("./IndustryPages", () => ({
  IndustriesPage: () => <div>行业</div>,
  IndustryDetailPage: () => <div>行业详情</div>,
}));
vi.mock("./ConfirmationPage", () => ({
  ConfirmationPage: () => <div>待确认页面</div>,
}));
vi.mock("./OperationsPage", () => ({
  OperationsPage: () => <div>管理页面</div>,
}));

afterEach(() => vi.useRealTimers());

describe("全局待确认数量", () => {
  it("以持久审核队列为唯一数量来源", async () => {
    const reviewClient: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({ items: [], total: 4 }),
      decide: vi.fn(),
    };

    render(
      <MemoryRouter>
        <ProductShell
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={reviewClient}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("img", { name: "博源资本" })).toBeTruthy();
    expect(
      await screen.findByRole("link", { name: /待确认\s*4/ }),
    ).toBeTruthy();
    expect(reviewClient.list).toHaveBeenCalledOnce();
  });

  it("轮询刷新长任务通知，并保留候选深链参数", async () => {
    vi.useFakeTimers();
    const notification: PlatformNotificationV1 = {
      notificationId: "candidate:candidate-2",
      kind: "candidate",
      title: "白杨智能有待确认知识",
      description: "第二条候选",
      targetUrl: "/confirmations?candidateId=candidate-2",
      createdAt: "2026-08-26T00:01:00.000Z",
    };
    const navigationClient: PlatformNavigationClient = {
      search: vi.fn(),
      notifications: vi
        .fn()
        .mockResolvedValueOnce({ items: [], unreadCount: 0 })
        .mockResolvedValue({ items: [notification], unreadCount: 1 }),
      markNotificationRead: vi.fn().mockResolvedValue({
        ...notification,
        readAt: "2026-08-26T00:02:00.000Z",
      }),
    };
    const reviewClient: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      decide: vi.fn(),
    };

    const view = render(
      <MemoryRouter>
        <ProductShell
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={reviewClient}
          navigationClient={navigationClient}
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    await act(async () => Promise.resolve());
    expect(navigationClient.notifications).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(navigationClient.notifications).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "通知" }));
    await act(async () => Promise.resolve());
    fireEvent.click(
      screen.getByRole("button", { name: /白杨智能有待确认知识/ }),
    );
    await act(async () => Promise.resolve());

    expect(navigationClient.markNotificationRead).toHaveBeenCalledWith(
      "candidate:candidate-2",
    );
    expect(screen.getByTestId("location").textContent).toBe(
      "/confirmations?candidateId=candidate-2",
    );

    view.unmount();
    vi.useRealTimers();
  });

  it("跨结果类型按后端语义相关性排序，而不是按标题排序", async () => {
    vi.useFakeTimers();
    const navigationClient: PlatformNavigationClient = {
      search: vi.fn().mockResolvedValue({
        query: "智能制造",
        mode: "semantic",
        providerId: "opencode",
        modelId: "semantic-test",
        companies: [
          {
            companyId: "company-low",
            canonicalName: "阿尔法公司",
            match: { score: 0.2, reason: "弱相关公司" },
          },
        ],
        industries: [
          {
            industryId: "industry-high",
            name: "智能制造行业",
            match: { score: 0.95, reason: "最相关行业" },
          },
        ],
        materials: [
          {
            conversationId: "conversation-material",
            documentId: "document-medium",
            fileName: "制造项目材料.pdf",
            match: { score: 0.7, reason: "相关材料" },
          },
        ],
        conversations: [
          {
            conversationId: "conversation-medium",
            title: "制造项目对话",
            match: { score: 0.5, reason: "相关对话" },
          },
        ],
      }),
      notifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }),
      markNotificationRead: vi.fn(),
    };
    const reviewClient: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      decide: vi.fn(),
    };
    const view = render(
      <MemoryRouter>
        <ProductShell
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={reviewClient}
          navigationClient={navigationClient}
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    const input = screen.getByRole("textbox", { name: "全局搜索" });
    fireEvent.change(input, { target: { value: "智能制造" } });
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });

    const options = within(screen.getByRole("listbox")).getAllByRole("button");
    expect(options.map((option) => option.textContent)).toEqual([
      "行业智能制造行业最相关行业",
      "材料制造项目材料.pdf相关材料",
      "对话制造项目对话相关对话",
      "公司阿尔法公司弱相关公司",
    ]);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("location").textContent).toBe(
      "/industry/industry-high",
    );

    view.unmount();
    vi.useRealTimers();
  });

  it("把同一个持久公司客户端注入列表和详情路由", () => {
    const companyClient: CompanyDirectoryClient = {
      list: vi.fn(),
      get: vi.fn(),
      uploadDocument: vi.fn(),
      setWatched: vi.fn(),
    };
    const reviewClient: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      decide: vi.fn(),
    };

    const { unmount } = render(
      <MemoryRouter initialEntries={["/companies"]}>
        <ProductShell
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={reviewClient}
          companyClient={companyClient}
        />
      </MemoryRouter>,
    );
    expect(companyPages.companies).toHaveBeenCalledWith(
      expect.objectContaining({ companyClient }),
      undefined,
    );
    unmount();

    render(
      <MemoryRouter initialEntries={["/companies/company-1"]}>
        <ProductShell
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={reviewClient}
          companyClient={companyClient}
        />
      </MemoryRouter>,
    );
    expect(companyPages.detail).toHaveBeenCalledWith(
      expect.objectContaining({ companyClient }),
      undefined,
    );
  });
});

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

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
