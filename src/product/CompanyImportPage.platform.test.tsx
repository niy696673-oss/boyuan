// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "../api";
import type { CompanyListClient } from "../capabilities/company-lists/client";
import type { CompanyListRecordV1 } from "../../shared/research-platform-v1";
import { CompanyImportPage } from "./CompanyPages";

describe("持久公司名单导入页面", () => {
  it("上传名单、等待识别并把可确认公司写入目录", async () => {
    const list = companyList();
    const confirmed = {
      ...list,
      status: "completed" as const,
      rows: list.rows.map((row) => ({
        ...row,
        confirmationStatus: "confirmed" as const,
        company: row.options[0] || company("company-2", "松涛科技有限公司"),
      })),
    };
    const client: CompanyListClient = {
      upload: vi.fn().mockResolvedValue({
        reusedDocument: false,
        conversation: { conversationId: "conversation-list" },
      }),
      getConversation: vi.fn().mockResolvedValue({
        conversationId: "conversation-list",
        status: "pending_confirmation",
        companyList: list,
      }),
      get: vi.fn(),
      confirm: vi.fn().mockResolvedValue(confirmed),
      startResearch: vi.fn(),
    } as CompanyListClient;
    const reload = vi.fn();

    render(
      <MemoryRouter>
        <CompanyImportPage
          data={bootstrap()}
          reload={reload}
          companyListClient={client}
        />
      </MemoryRouter>,
    );
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["公司名称\n云杉智能有限公司"], "公司名单.csv", { type: "text/csv" })] },
    });

    expect(await screen.findByText("名单识别完成，请确认可建立的公司主体")).toBeTruthy();
    expect(screen.getAllByText("已有公司").length).toBeGreaterThan(0);
    expect(screen.getByText("待新建")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认可识别公司并入库" }));

    await waitFor(() => expect(client.confirm).toHaveBeenCalledWith(
      "list-1",
      [
        { rowId: "row-1", expectedVersion: 1, companyId: "company-1" },
        { rowId: "row-2", expectedVersion: 1, createName: "松涛科技有限公司" },
      ],
      expect.any(AbortSignal),
    ));
    expect(await screen.findByText("已确认 2 家公司并写入档案")).toBeTruthy();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("允许人工选择同名主体并修正识别失败的公司名称", async () => {
    const list = companyList();
    list.rows.push(
      {
        rowId: "row-3",
        rowOrder: 3,
        originalValue: "云杉科技",
        normalizedName: "云杉科技",
        matchStatus: "ambiguous",
        confirmationStatus: "pending",
        options: [
          company("company-3", "北京云杉科技有限公司"),
          company("company-4", "上海云杉科技有限公司"),
        ],
        evidence: { evidenceId: "evidence-3", sourceType: "material", quote: "云杉科技" },
        version: 2,
      },
      {
        rowId: "row-4",
        rowOrder: 4,
        originalValue: "???",
        matchStatus: "failed",
        confirmationStatus: "pending",
        options: [],
        evidence: { evidenceId: "evidence-4", sourceType: "material", quote: "???" },
        errorCode: "company_name_invalid",
        version: 1,
      },
    );
    const client: CompanyListClient = {
      upload: vi.fn().mockResolvedValue({
        reusedDocument: false,
        conversation: { conversationId: "conversation-list" },
      }),
      getConversation: vi.fn().mockResolvedValue({
        conversationId: "conversation-list",
        status: "pending_confirmation",
        companyList: list,
      }),
      get: vi.fn(),
      confirm: vi.fn().mockResolvedValue({ ...list, status: "completed" }),
      startResearch: vi.fn(),
    } as CompanyListClient;

    render(
      <MemoryRouter>
        <CompanyImportPage
          data={bootstrap()}
          reload={vi.fn()}
          companyListClient={client}
        />
      </MemoryRouter>,
    );
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["公司名称\n云杉科技"], "公司名单.csv", { type: "text/csv" })] },
    });

    fireEvent.change(await screen.findByRole("combobox", { name: "选择 云杉科技 的公司主体" }), {
      target: { value: "company-4" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "修正 ??? 的公司名称" }), {
      target: { value: "青松科技有限公司" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认可识别公司并入库" }));

    await waitFor(() => expect(client.confirm).toHaveBeenCalledWith(
      "list-1",
      [
        { rowId: "row-1", expectedVersion: 1, companyId: "company-1" },
        { rowId: "row-2", expectedVersion: 1, createName: "松涛科技有限公司" },
        { rowId: "row-3", expectedVersion: 2, companyId: "company-4" },
        { rowId: "row-4", expectedVersion: 1, createName: "青松科技有限公司" },
      ],
      expect.any(AbortSignal),
    ));
  });
});

function companyList(): CompanyListRecordV1 {
  return {
    listId: "list-1",
    conversationId: "conversation-list",
    documentId: "document-list",
    status: "pending_confirmation",
    rows: [
      {
        rowId: "row-1",
        rowOrder: 1,
        originalValue: "云杉智能有限公司",
        normalizedName: "云杉智能有限公司",
        matchStatus: "existing",
        confirmationStatus: "pending",
        options: [company("company-1", "云杉智能有限公司")],
        evidence: { evidenceId: "evidence-1", sourceType: "material", quote: "云杉智能有限公司" },
        version: 1,
      },
      {
        rowId: "row-2",
        rowOrder: 2,
        originalValue: "松涛科技有限公司",
        normalizedName: "松涛科技有限公司",
        matchStatus: "new",
        confirmationStatus: "pending",
        options: [],
        evidence: { evidenceId: "evidence-2", sourceType: "material", quote: "松涛科技有限公司" },
        version: 1,
      },
    ],
    researchRequests: [],
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  };
}

function company(companyId: string, canonicalName: string) {
  return {
    companyId,
    canonicalName,
    status: "active" as const,
    aliases: [],
    version: 1,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  };
}

function bootstrap(): Bootstrap {
  const user = { id: "u-1", name: "投资经理", role: "investor" as const, projectIds: [] };
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
