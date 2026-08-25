// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "../api";
import type { CompanyDirectoryClient } from "../capabilities/companies/client";
import type { ReviewQueueClient } from "../capabilities/review/client";
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

    expect(
      await screen.findByRole("link", { name: /待确认\s*4/ }),
    ).toBeTruthy();
    expect(reviewClient.list).toHaveBeenCalledOnce();
  });

  it("把同一个持久公司客户端注入列表和详情路由", () => {
    const companyClient: CompanyDirectoryClient = {
      list: vi.fn(),
      get: vi.fn(),
    };
    const reviewClient: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      decide: vi.fn(),
    };

    const { unmount } = render(
      <MemoryRouter initialEntries={["/companies"]}>
        <ProductShell data={emptyBootstrap()} reload={vi.fn()} reviewClient={reviewClient} companyClient={companyClient} />
      </MemoryRouter>,
    );
    expect(companyPages.companies).toHaveBeenCalledWith(expect.objectContaining({ companyClient }), undefined);
    unmount();

    render(
      <MemoryRouter initialEntries={["/companies/company-1"]}>
        <ProductShell data={emptyBootstrap()} reload={vi.fn()} reviewClient={reviewClient} companyClient={companyClient} />
      </MemoryRouter>,
    );
    expect(companyPages.detail).toHaveBeenCalledWith(expect.objectContaining({ companyClient }), undefined);
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
