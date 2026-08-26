// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("持久候选知识待确认页面接缝", () => {
  it("展示研究平台队列中的公司、候选和真实证据", async () => {
    localStorage.setItem("boyuan-access-token", "confirmation-token");
    localStorage.setItem("boyuan-user", "u-investor");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("document bytes", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(URL, "createObjectURL").mockReturnValue(
      "blob:confirmation-document",
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickDownload = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
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
    fireEvent.click(screen.getByRole("button", { name: "下载原文" }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        "/api/v1/documents/document-1/content",
        expect.objectContaining({
          headers: {
            accept: "application/octet-stream",
            authorization: "Bearer confirmation-token",
            "x-user-id": "u-investor",
          },
        }),
      ),
    );
    expect(clickDownload).toHaveBeenCalledTimes(1);
  });

  it("下载原文失败时展示可见错误，允许用户再次点击重试", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })),
    );
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

    const download = await screen.findByRole("button", { name: "下载原文" });
    fireEvent.click(download);

    expect(await screen.findByText("原始文件不存在或已不可用")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "下载原文" })).toBeTruthy();
  });

  it("外部 Web 证据保留安全的新窗口链接，不混作材料下载", async () => {
    const item = reviewItem();
    item.evidence = [
      {
        evidenceId: "evidence-web",
        sourceType: "web",
        quote: "官网披露了新的行业解决方案。",
        title: "白杨智能官网",
        url: "https://example.com/research",
      },
    ];
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

    const external = await screen.findByRole("link", {
      name: "打开外部来源",
    });
    expect(external.getAttribute("href")).toBe("https://example.com/research");
    expect(external.getAttribute("target")).toBe("_blank");
    expect(external.getAttribute("rel")).toContain("noopener");
    expect(screen.queryByRole("button", { name: "下载原文" })).toBeNull();
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

  it("从候选通知深链选中指定候选，而不是队列第一项", async () => {
    const first = reviewItem();
    const second: ReviewQueueItem = {
      ...reviewItem(),
      candidateId: "candidate-2",
      statement: "白杨智能的第二条待确认知识。",
      updatedAt: "2026-08-26T00:02:00.000Z",
    };
    const client: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({ items: [first, second], total: 2 }),
      decide: vi.fn(),
    };

    render(
      <MemoryRouter initialEntries={["/confirmations?candidateId=candidate-2"]}>
        <ConfirmationPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={client}
        />
      </MemoryRouter>,
    );

    const selectedButton = await screen.findByRole("button", {
      name: /白杨智能的第二条待确认知识。/,
    });
    await waitFor(() => expect(selectedButton.className).toContain("active"));
    expect(
      document.querySelector(".by-confirm-detail .by-candidate-content > p")
        ?.textContent,
    ).toBe(second.statement);
  });

  it("按搜索和导航条件筛选队列，并让当前选择始终留在可见候选中", async () => {
    const ai = reviewItem();
    const web: ReviewQueueItem = {
      ...reviewItem(),
      candidateId: "candidate-web",
      statement: "雪松科技已发布新的行业解决方案。",
      highImpact: true,
      evidence: [
        {
          evidenceId: "evidence-web",
          sourceType: "web",
          quote: "官网披露了新的行业解决方案。",
          title: "雪松科技官网",
        },
      ],
      company: {
        ...reviewItem().company,
        companyId: "company-web",
        canonicalName: "雪松科技有限公司",
      },
    };
    const conflicted: ReviewQueueItem = {
      ...reviewItem(),
      candidateId: "candidate-conflicted",
      statement: "冷杉智能的收入信息存在冲突。",
      status: "conflicted",
      company: {
        ...reviewItem().company,
        companyId: "company-conflicted",
        canonicalName: "冷杉智能有限公司",
      },
    };
    const client: ReviewQueueClient = {
      list: vi.fn().mockResolvedValue({
        items: [ai, web, conflicted],
        total: 3,
      }),
      decide: vi.fn(),
    };

    render(
      <MemoryRouter
        initialEntries={["/confirmations?candidateId=candidate-web"]}
      >
        <ConfirmationPage
          data={emptyBootstrap()}
          reload={vi.fn()}
          reviewClient={client}
        />
      </MemoryRouter>,
    );

    const deepLinked = await screen.findByRole("button", {
      name: /雪松科技已发布新的行业解决方案。/,
    });
    await waitFor(() => expect(deepLinked.className).toContain("active"));

    fireEvent.click(screen.getByRole("button", { name: /^AI 候选\s*2$/ }));
    expect(
      screen.queryByRole("button", {
        name: /雪松科技已发布新的行业解决方案。/,
      }),
    ).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: /白杨智能专注企业智能化服务。/,
        }).className,
      ).toContain("active"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /^Web Search 候选\s*1$/ }),
    );
    expect(
      screen.getByRole("button", {
        name: /雪松科技已发布新的行业解决方案。/,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: /白杨智能专注企业智能化服务。/,
      }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^高影响\s*1$/ }));
    expect(
      screen.getByRole("button", {
        name: /雪松科技已发布新的行业解决方案。/,
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^存在冲突\s*1$/ }));
    expect(
      screen.getByRole("button", { name: /冷杉智能的收入信息存在冲突。/ }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^公司\s*3$/ }));
    const searchInput = screen.getByPlaceholderText("搜索候选内容或公司");
    fireEvent.change(searchInput, { target: { value: "雪松" } });
    expect((searchInput as HTMLInputElement).value).toBe("雪松");
    expect(
      screen.getByRole("button", {
        name: /雪松科技已发布新的行业解决方案。/,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /冷杉智能的收入信息存在冲突。/ }),
    ).toBeNull();

    fireEvent.change(searchInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^行业\s*0$/ }));
    expect(
      screen.getByText("当前候选数据仅支持公司对象，暂无行业候选。"),
    ).toBeTruthy();
    expect(
      screen.getByText("当前候选协议只包含公司对象，因此行业筛选结果为 0。"),
    ).toBeTruthy();
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
        documentId: "document-1",
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
