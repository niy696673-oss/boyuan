// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "../api";
import { OperationsPage } from "./OperationsPage";

describe("研究任务归档", () => {
  it("将已取消任务显示为 warning 终态，而不是仍在等待生成", () => {
    render(
      <OperationsPage
        data={bootstrapWithCancelledTask()}
        mode="tasks"
        reload={vi.fn()}
      />,
    );

    const status = screen.getByText("已取消");
    expect(status.classList.contains("warning")).toBe(true);
    expect(screen.getByText("未生成")).toBeTruthy();
    expect(screen.queryByText("等待生成")).toBeNull();
  });
});

function bootstrapWithCancelledTask(): Bootstrap {
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
    industryNodes: [],
    industryEdges: [],
    tasks: [
      {
        id: "task-cancelled",
        query: "已取消的行业研究",
        contextType: "行业",
        status: "已取消",
        createdBy: "工作台",
        createdAt: "2026-08-27T00:00:00.000Z",
        steps: [],
      },
    ],
    settings: { externalModelsEnabled: false, knowledgeSource: "" },
  };
}
