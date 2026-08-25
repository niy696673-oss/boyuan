// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "../api";
import type { CompanyDirectoryClient } from "../capabilities/companies/client";
import { CompanyDetailPage } from "./CompanyPages";
import { IndustryDetailPage } from "./IndustryPages";

vi.mock("@gsap/react", () => ({ useGSAP: () => undefined }));
vi.mock("gsap", () => ({
  default: { registerPlugin: vi.fn(), from: vi.fn() },
}));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      industryContext: vi.fn().mockResolvedValue({
        companyId: "company-1",
        centerNodes: [],
        upstream: [],
        downstream: [],
      }),
    },
  };
});

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});

describe("飞书卡片实体深链", () => {
  it("直接打开公司的产业关系页签", async () => {
    render(
      <MemoryRouter initialEntries={["/companies/company-1?tab=relations"]}>
        <Routes>
          <Route
            path="/companies/:id"
            element={<CompanyDetailPage data={bootstrap()} reload={vi.fn()} companyClient={companyClient()} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect((await screen.findByRole("button", { name: "产业关系" })).className).toContain("active");
    expect(document.querySelector(".by-industry-lane.expanded")).not.toBeNull();
  });

  it("直接打开行业的产业链页签", () => {
    render(
      <MemoryRouter initialEntries={["/industry/industry-1?tab=chain"]}>
        <Routes>
          <Route
            path="/industry/:id"
            element={<IndustryDetailPage data={bootstrap()} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /产业链/ }).className).toContain("active");
  });
});

function companyClient(): CompanyDirectoryClient {
  const item = {
    companyId: "company-1",
    canonicalName: "星河科技有限公司",
    status: "active" as const,
    aliases: [{ alias: "星河科技", type: "short_name" }],
    version: 1,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    profile: {
      summary: { value: "AI 算力调度平台", state: "confirmed" as const },
      primaryIndustry: { state: "missing" as const },
      industryPosition: { state: "missing" as const },
      location: { state: "missing" as const },
      foundedAt: { state: "missing" as const },
      latestFunding: { state: "missing" as const },
      watched: false,
    },
    materialCount: 0,
    pendingCandidateCount: 0,
  };
  return {
    list: vi.fn().mockResolvedValue({ items: [{ ...item, knowledgeCount: 0 }], total: 1 }),
    get: vi.fn().mockResolvedValue({ ...item, knowledge: [], materials: [], pendingCandidates: [], researchRecords: [], relations: [], industryPlacements: [] }),
    uploadDocument: vi.fn(),
    setWatched: vi.fn(),
  };
}

function bootstrap(): Bootstrap {
  const user = { id: "u-1", name: "投资经理", role: "investor" as const, projectIds: [] };
  return {
    user,
    users: [user],
    companies: [{
      id: "company-1",
      standardName: "星河科技有限公司",
      aliases: ["星河科技"],
      description: "AI 算力调度平台",
      cognitionStatus: "已建档",
      attentionStatus: "未关注",
      positions: [{
        nodeId: "stage-1",
        positionType: "primary",
        status: "confirmed",
        confidence: 0.9,
        source: "internal_evidence",
        sourceDate: "2026-08-26",
      }],
      claims: [],
      evidence: [],
      updatedAt: "2026-08-26T00:00:00.000Z",
    }],
    industryNodes: [
      { id: "industry-1", name: "人工智能", parentId: null, level: 0, source: "机构知识" },
      { id: "stage-1", name: "算力调度", parentId: "industry-1", level: 1, source: "机构知识" },
    ],
    industryEdges: [],
    tasks: [],
    settings: { externalModelsEnabled: false, knowledgeSource: "机构知识" },
  };
}
