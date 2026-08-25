// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "../api";
import type { ReviewQueueClient } from "../capabilities/review/client";
import type { ReviewQueueItem } from "../../shared/research-platform-v1";
import { ConfirmationPage } from "./ConfirmationPage";

vi.mock("@gsap/react", () => ({ useGSAP: () => undefined }));
vi.mock("gsap", () => ({
  default: { registerPlugin: vi.fn(), utils: { toArray: vi.fn(() => []) } },
}));
vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: { create: vi.fn() },
}));

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});

describe("持久候选知识待确认页面接缝", () => {
  it("展示研究平台队列中的公司、候选和真实证据", async () => {
    const client: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({ items: [reviewItem()], total: 1 }),
      decide: vi.fn(),
    };

    render(
      <MemoryRouter>
        <ConfirmationPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={client}
        />
      </MemoryRouter>,
    );

    expect(
      (await screen.findAllByText("白杨智能有限公司")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("白杨智能专注企业智能化服务。").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("公司专注企业智能化服务。")).toBeTruthy();
    expect(screen.getByText("1 条可见证据")).toBeTruthy();
  });

  it("冲突候选同时展示不支持证据和冲突正式知识", async () => {
    const item: ReviewQueueItem = {
      ...reviewItem(),
      status: "conflicted",
      unsupportedEvidence: [
        {
          evidenceId: "unsupported-1",
          sourceType: "material",
          quote: "材料不支持当前候选。",
          fileName: "补充材料.txt",
        },
      ],
      conflictingKnowledge: [
        {
          knowledgeId: "knowledge-1",
          companyId: "company-1",
          knowledgeType: "company_summary",
          statement: "现有正式知识认为其专注金融业。",
          status: "disputed",
          version: 1,
          sourceCandidateId: "earlier-candidate",
          evidence: [
            {
              evidenceId: "conflict-1",
              sourceType: "web",
              quote: "公开资料显示其主要服务金融机构。",
              title: "公开资料",
            },
          ],
          createdAt: "2026-08-25T00:00:00.000Z",
        },
      ],
    };
    const client: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({ items: [item], total: 1 }),
      decide: vi.fn(),
    };

    render(
      <MemoryRouter>
        <ConfirmationPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={client}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("材料不支持当前候选。")).toBeTruthy();
    expect(
      screen.getByText(/冲突知识：现有正式知识认为其专注金融业。/),
    ).toBeTruthy();
    expect(screen.getByText("3 条可见证据")).toBeTruthy();
  });

  it("确认成功后移除候选并同步全局数量", async () => {
    const item = reviewItem();
    const onQueueCountChange = vi.fn();
    const client: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({ items: [item], total: 1 }),
      decide: vi.fn().mockResolvedValue({
        candidate: { ...item, status: "confirmed", version: 2 },
        company: item.company,
        currentKnowledge: [],
        remainingCount: 0,
      }),
    };

    render(
      <MemoryRouter>
        <ConfirmationPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={client}
          onQueueCountChange={onQueueCountChange}
        />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "确认并入库" }));

    await waitFor(() =>
      expect(client.decide).toHaveBeenCalledWith("candidate-1", {
        expectedVersion: 1,
        action: "confirm",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "待确认内容已处理完毕" }),
    ).toBeTruthy();
    expect(onQueueCountChange).toHaveBeenLastCalledWith(0);
  });

  it("修改候选后以修改确认动作提交新陈述", async () => {
    const item = reviewItem();
    const client: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({ items: [item], total: 1 }),
      decide: vi.fn().mockResolvedValue({
        candidate: { ...item, status: "modified_confirmed", version: 2 },
        company: item.company,
        currentKnowledge: [],
        remainingCount: 0,
      }),
    };

    render(
      <MemoryRouter>
        <ConfirmationPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={client}
        />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "修改确认" }));
    fireEvent.change(screen.getByDisplayValue(item.statement), {
      target: { value: "白杨智能专注制造业智能化服务。" },
    });
    fireEvent.change(screen.getByLabelText("修改原因"), {
      target: { value: "依据原始材料" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存并确认" }));

    await waitFor(() =>
      expect(client.decide).toHaveBeenCalledWith("candidate-1", {
        expectedVersion: 1,
        action: "modify",
        statement: "白杨智能专注制造业智能化服务。",
      }),
    );
  });

  it("驳回候选后从队列移除", async () => {
    const item = reviewItem();
    const client: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({ items: [item], total: 1 }),
      decide: vi.fn().mockResolvedValue({
        candidate: { ...item, status: "rejected", version: 2 },
        company: item.company,
        currentKnowledge: [],
        remainingCount: 0,
      }),
    };

    render(
      <MemoryRouter>
        <ConfirmationPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={client}
        />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "驳回" }));

    await waitFor(() =>
      expect(client.decide).toHaveBeenCalledWith("candidate-1", {
        expectedVersion: 1,
        action: "reject",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "待确认内容已处理完毕" }),
    ).toBeTruthy();
  });

  it("提交冲突时保留候选并展示可重试错误", async () => {
    const item = reviewItem();
    const client: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({ items: [item], total: 1 }),
      decide: vi.fn().mockRejectedValue(new Error("候选已变化，请刷新后重试")),
    };

    render(
      <MemoryRouter>
        <ConfirmationPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={client}
        />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "确认并入库" }));

    expect(await screen.findByText("候选已变化，请刷新后重试")).toBeTruthy();
    expect(screen.getAllByText(item.statement).length).toBeGreaterThan(0);
  });
});

function reviewItem(): ReviewQueueItem {
  return {
    candidateId: "candidate-1",
    companyId: "company-1",
    sectionKey: "company_and_project_stage",
    knowledgeType: "company_summary",
    statement: "白杨智能专注企业智能化服务。",
    status: "pending",
    version: 1,
    highImpact: false,
    sensitive: false,
    evidence: [
      {
        evidenceId: "evidence-1",
        sourceType: "material",
        quote: "公司专注企业智能化服务。",
        fileName: "白杨智能 BP.txt",
        paragraph: 2,
      },
    ],
    company: {
      companyId: "company-1",
      canonicalName: "白杨智能有限公司",
      aliases: [],
      version: 1,
    },
    currentKnowledge: [],
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:01:00.000Z",
  };
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
