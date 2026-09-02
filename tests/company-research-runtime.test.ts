// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type {
  CompanyResearchInput,
  CompanyResearchWorkflowContext,
  CompanyResearchWorkflowSkill,
} from "../server/research-platform/research/contracts.js";
import { createOpenCodeResearchAdapter } from "../server/research-platform/research/opencode-research.js";
import { parseResearchJson } from "../server/research-platform/research/research-schema.js";
import { createRuntimeResearchAdapters } from "../server/research-platform/research/runtime-research.js";

describe("公司外部调研运行时", () => {
  it("通过 OpenCode 代理分析带 URL 的公开来源且禁用全部工具", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "session-1" }))
      .mockResolvedValueOnce(
        Response.json({
          info: {
            providerID: "openai",
            modelID: "gpt-5.6-sol",
            variant: "xhigh",
          },
          parts: [
            {
              type: "text",
              text: JSON.stringify({
                summary: "公开来源显示公司已发布新产品。",
                candidates: [
                  {
                    knowledgeType: "product_update",
                    statement: "公司已发布新产品。",
                    evidenceUrls: ["https://example.com/source"],
                    highImpact: false,
                    sensitive: false,
                  },
                ],
                relations: [
                  {
                    targetName: "青松科技有限公司",
                    category: "upstream",
                    relationType: "技术提供方",
                    description: "青松科技为白杨智能提供核心技术。",
                    evidenceUrls: ["https://example.com/source"],
                  },
                ],
              }),
            },
          ],
        }),
      );
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      model: { providerId: "openai", modelId: "gpt-5.6-sol" },
      variant: "xhigh",
      fetcher,
    });

    const result = await adapter.analyze({
      taskId: "task-1",
      conversationId: "conversation-1",
      companyId: "company-1",
      companyName: "白杨智能有限公司",
      intent: "了解最新产品",
      triggerReason: "user_requested",
      existingKnowledge: [],
      pendingCandidates: [],
      webResults: [
        {
          title: "来源",
          url: "https://example.com/source",
          site: "example.com",
          highlights: ["公开信息"],
          accessStatus: "accessible",
          retrievedAt: "2026-08-24T00:00:00.000Z",
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: "openai",
      modelId: "gpt-5.6-sol",
      sessionId: "session-1",
    });
    expect(result.candidates[0]?.evidenceUrls).toEqual([
      "https://example.com/source",
    ]);
    expect(result.relations).toEqual([
      {
        targetName: "青松科技有限公司",
        category: "upstream",
        relationType: "技术提供方",
        description: "青松科技为白杨智能提供核心技术。",
        evidenceUrls: ["https://example.com/source"],
      },
    ]);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "/opencode-api/session?directory=%2Fworkspace%2Fboyuan",
    );
    const prompt = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(prompt.tools).toEqual({ "*": false });
    expect(prompt.parts[0].text).toContain("本对话未确认候选");
    expect(prompt.parts[0].text).toContain(
      "upstream、downstream、customer、competitor",
    );
    expect(prompt.parts[0].text).toContain(
      "逐字复制 webResults 提供的原样完整 URL",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["diagnose-bp", "不重写 BP、不作投资决定"],
    ["screen-deal", "AI 准备、负责人决策"],
    ["extract-risk-flags", "区分覆盖缺口与实质风险"],
  ] as const)("加载并验证 %s Skill 后才生成内部投研结果", async (skill, boundary) => {
    const fetcher = workflowFetcher(skill);
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });

    const result = await adapter.analyze(workflowInput(skill));

    expect(result.summary).toBe(expectedSourceExcerptSummary(FROZEN_EXCERPT));
    expect(result.relations).toEqual([]);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/opencode-api/skill?");
    expect(String(fetcher.mock.calls[3]?.[0])).toContain(
      "/session/session-workflow/message?",
    );
    const body = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body));
    expect(body.tools).toEqual({ "*": false, skill: true });
    expect(body.system).toContain("不能替投资负责人作决定");
    expect(body.system).toContain("除 skill 外不得调用任何工具");
    expect(body.parts[0].text).toContain(
      `第一步必须调用 skill 工具加载“${skill}”`,
    );
    expect(body.parts[0].text).toMatch(
      new RegExp(`^第一步必须调用 skill 工具加载“${skill}”`),
    );
    expect(body.parts[0].text).toContain(boundary);
    expect(body.parts[0].text).toContain('"input_scope_approval":true');
    expect(body.parts[0].text).toContain('"method_assumption_approval":false');
    expect(body.parts[0].text).toContain("不得用外部信息补齐");
    expect(body.parts[0].text).toContain(
      "boyuan-bp-deep-analysis 与 Sequential Thinking 的独立链路",
    );
    expect(body.parts[0].text).not.toContain("公开搜索结果：");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("投研 Skill 收到公开搜索结果时在调用 OpenCode 前停止", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });
    const input = workflowInput("diagnose-bp");
    input.webResults = [{
      title: "公开来源",
      url: "https://example.com/source",
      site: "example.com",
      highlights: ["公开信息"],
      accessStatus: "accessible",
      retrievedAt: "2026-08-24T00:00:00.000Z",
    }];

    await expect(adapter.analyze(input)).rejects.toThrow(
      /Public search results must use a separate research run/,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("缺少 input_scope_approval 时在调用 OpenCode 前停止", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });
    const input = workflowInput("extract-risk-flags");
    input.workflowContext!.gates.inputScopeApproval.approved = false;

    await expect(adapter.analyze(input)).rejects.toThrow(/input_scope_approval/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("材料不在 input_scope_approval 范围内时停止", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });
    const input = workflowInput("diagnose-bp");
    input.workflowContext!.gates.inputScopeApproval.sourceIds = [];

    await expect(adapter.analyze(input)).rejects.toThrow(
      /input_scope_approval must freeze at least one source/,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("审批来源未出现在执行材料中时停止", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });
    const input = workflowInput("diagnose-bp");
    input.workflowContext!.gates.inputScopeApproval.sourceIds = [
      "MAT-001",
      "MAT-LATER",
    ];

    await expect(adapter.analyze(input)).rejects.toThrow(
      /Approved material source is unavailable: MAT-LATER/,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["未经批准的数值评分", "综合评分：85/100，建议补充证据。"],
    ["未经批准的严重度", "风险等级：高，需负责人复核。"],
    ["未经批准的高低风险", "风险：高。"],
    ["未经批准的风险定性", "高风险。"],
    ["未经批准的较高风险", "风险较高。"],
    ["机构推进决定", "本基金决定推进该项目。"],
    ["本轮推进决定", "本轮决定推进项目。"],
    ["本轮形成推进决定", "本轮形成推进决定。"],
    ["初筛通过结论", "初筛结论：通过。"],
    ["初筛拒绝结论", "初筛结论：拒绝。"],
    ["初筛搁置结论", "初筛结论：搁置。"],
    ["初筛直接通过", "初筛通过。"],
    ["建议进入下一轮尽调", "建议进入下一轮尽调。"],
    ["建议推进尽调", "建议推进尽调。"],
    ["建议推进项目", "建议推进项目。"],
    ["项目应该推进", "项目应该推进。"],
    ["初筛推进建议", "初筛建议：推进。"],
    ["外部发送已发生", "已向外部发送该报告。"],
    ["外部发布已发生", "报告已对外发布。"],
    ["报告已外发", "报告已外发。"],
    ["报告已发送给外部投资人", "报告已经发送给外部投资人。"],
    ["机构计划投资", "本机构将投资该项目。"],
    ["项目值得投资", "该项目值得投资。"],
    ["初步筛选推进", "初步筛选认为可继续推进。"],
    ["报告已发给投资人", "报告已发给投资人。"],
    ["团队已把报告发给外部投资人", "我们已经把报告发给外部投资人。"],
    ["可以推进项目", "可以推进该项目。"],
    ["专业定性结论", "公司已被认定实施财务造假。"],
  ])("%s 会在返回持久层前失败关闭", async (_label, summary) => {
    const fetcher = workflowFetcher(
      "diagnose-bp",
      "diagnose-bp",
      summary,
    );
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });

    await expect(adapter.analyze(workflowInput("diagnose-bp"))).rejects.toMatchObject({
      code: "research_schema_invalid",
    });
  });

  it("方法假设获批后允许披露方法内评分但仍标记内部草稿", async () => {
    const fetcher = workflowFetcher(
      "diagnose-bp",
      "diagnose-bp",
      FROZEN_EXCERPT,
      {
        summary: [{
          state: "method_score",
          category: "financials_risks",
          score: 85,
          scale: 100,
          riskLevel: "high",
          sourceIds: ["MAT-001"],
        }],
      },
    );
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });
    const input = workflowInput("diagnose-bp");
    input.workflowContext!.gates.methodAssumptionApproval = {
      approved: true,
      approvedBy: "投资负责人",
      approvedAt: "2026-08-26T00:00:00.000Z",
    };

    await expect(adapter.analyze(input)).resolves.toMatchObject({
      summary: "【内部草稿｜非投资决定】\n已审批方法观察（财务经营、规划与风险）：评分 85/100；风险等级 高。",
    });
  });

  it("只接受材料逐字摘录和服务端生成的缺口或待确认问题", async () => {
    const fetcher = workflowFetcher("screen-deal", "screen-deal", FROZEN_EXCERPT, {
      summary: [
        {
          state: "source_excerpt",
          category: "financing_equity",
          sourceId: "MAT-001",
          quote: FROZEN_EXCERPT,
        },
        { state: "evidence_gap", category: "financials_risks" },
        { state: "pending_question", category: "team_governance" },
      ],
    });
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });

    await expect(adapter.analyze(workflowInput("screen-deal"))).resolves.toMatchObject({
      summary: [
        "【内部草稿｜非投资决定】",
        `材料摘录（融资、估值、股权与资金用途）：${FROZEN_EXCERPT}`,
        "证据缺口：财务经营、规划与风险相关材料未充分披露。",
        "待确认问题：请负责人核验团队与治理相关事实与证据？",
      ].join("\n"),
    });
  });

  it("未知顶层字段会在原始研究输出返回持久层前失败关闭", async () => {
    const fetcher = workflowFetcher(
      "screen-deal",
      "screen-deal",
      "内部投研草稿",
      { institutional_decision: "advance" },
    );
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });

    await expect(adapter.analyze(workflowInput("screen-deal"))).rejects.toMatchObject({
      code: "research_schema_invalid",
      message: expect.stringContaining("institutional_decision"),
    });
  });

  it.each([
    ["缺少结构化决定字段", undefined],
    ["填充结构化决定字段", "advance"],
  ])("%s 时工作流输出失败关闭", (_label, decision) => {
    const output: Record<string, unknown> = {
      summary: "内部投研草稿",
      candidates: [],
    };
    if (decision !== undefined) output.decision = decision;

    expect(() =>
      parseResearchJson(JSON.stringify(output), { requireBlankDecision: true }),
    ).toThrowError(
      expect.objectContaining({
        code: "research_schema_invalid",
        message: expect.stringContaining("decision: null"),
      }),
    );
  });

  it("工作流拒绝自由文本摘要并要求受控状态数组", () => {
    expect(() => parseResearchJson(JSON.stringify({
      summary: "可以推进该项目。",
      decision: null,
      candidates: [],
    }), {
      requireBlankDecision: true,
      workflowMaterials: [{ sourceId: "MAT-001", excerpt: FROZEN_EXCERPT }],
    })).toThrowError(expect.objectContaining({
      code: "research_schema_invalid",
      message: expect.stringContaining("structured array"),
    }));
  });

  it("工作流结构化摘要只能引用冻结来源", () => {
    expect(() => parseResearchJson(JSON.stringify({
      summary: [{
        state: "source_excerpt",
        category: "financing_equity",
        sourceId: "MAT-OUTSIDE",
        quote: FROZEN_EXCERPT,
      }],
      decision: null,
      candidates: [],
    }), {
      requireBlankDecision: true,
      workflowMaterials: [{ sourceId: "MAT-001", excerpt: FROZEN_EXCERPT }],
    })).toThrowError(expect.objectContaining({
      code: "research_schema_invalid",
      message: expect.stringContaining("not from a frozen source"),
    }));
  });

  it("未知候选字段会在原始研究输出被接受前失败关闭", () => {
    const rawText = JSON.stringify({
      summary: "公开研究摘要",
      candidates: [{
        knowledgeType: "external_update",
        statement: "公司公开披露新产品。",
        evidenceUrls: ["https://example.com/source"],
        highImpact: false,
        sensitive: false,
        institutional_decision: "advance",
      }],
    });

    expect(() => parseResearchJson(rawText)).toThrowError(
      expect.objectContaining({
        code: "research_candidate_invalid",
        message: expect.stringContaining("institutional_decision"),
      }),
    );
  });

  it("兼容缺少 relations 的旧常规研究输出并规范化为空数组", () => {
    expect(parseResearchJson(JSON.stringify({
      summary: "公开研究摘要",
      candidates: [],
    }))).toEqual({
      summary: "公开研究摘要",
      candidates: [],
      relations: [],
    });
  });

  it("解析结构化外部关系并清理重复证据 URL", () => {
    expect(parseResearchJson(JSON.stringify({
      summary: "公开研究摘要",
      candidates: [],
      relations: [{
        targetName: " 青松科技有限公司 ",
        category: "customer",
        relationType: " 标杆客户 ",
        description: " 已公开披露双方合作。 ",
        evidenceUrls: [
          " https://example.com/source ",
          "https://example.com/source",
        ],
      }],
    })).relations).toEqual([{
      targetName: "青松科技有限公司",
      category: "customer",
      relationType: "标杆客户",
      description: "已公开披露双方合作。",
      evidenceUrls: ["https://example.com/source"],
    }]);
  });

  it.each([
    ["非法 category", { category: "partner" }],
    ["空 evidenceUrls", { evidenceUrls: [" "] }],
    ["未知字段", { institutional_decision: "advance" }],
    ["空目标名称", { targetName: " " }],
  ])("%s 的外部关系会失败关闭", (_label, override) => {
    expect(() => parseResearchJson(JSON.stringify({
      summary: "公开研究摘要",
      candidates: [],
      relations: [{
        targetName: "青松科技有限公司",
        category: "upstream",
        relationType: "技术提供方",
        description: "公开来源披露双方合作。",
        evidenceUrls: ["https://example.com/source"],
        ...override,
      }],
    }))).toThrowError(expect.objectContaining({
      code: "research_relation_invalid",
    }));
  });

  it("OpenCode 未真实调用指定 Skill 时失败", async () => {
    const fetcher = workflowFetcher("screen-deal", "diagnose-bp");
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });

    await expect(adapter.analyze(workflowInput("screen-deal"))).rejects.toThrow(
      /did not first call required skill: screen-deal/,
    );
  });

  it("OpenCode 正确加载指定 Skill 后再加载其他 Skill 时失败关闭", async () => {
    const fetcher = workflowFetcher(
      "screen-deal",
      "screen-deal",
      FROZEN_EXCERPT,
      {},
      ["diagnose-bp"],
    );
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });

    await expect(adapter.analyze(workflowInput("screen-deal"))).rejects.toMatchObject({
      code: "opencode_unexpected_skill_used",
      message: expect.stringContaining("diagnose-bp"),
    });
  });

  it("OpenCode 重复加载同一个指定 Skill 时仍满足 allowlist", async () => {
    const fetcher = workflowFetcher(
      "screen-deal",
      "screen-deal",
      FROZEN_EXCERPT,
      {},
      ["screen-deal"],
    );
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });

    await expect(adapter.analyze(workflowInput("screen-deal"))).resolves.toMatchObject({
      summary: expectedSourceExcerptSummary(FROZEN_EXCERPT),
    });
  });

  it("OpenCode 不可发现指定 Skill 时不会创建会话", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([{ name: "diagnose-bp" }]));
    const adapter = createOpenCodeResearchAdapter({
      baseUrl: new URL("http://127.0.0.1:4173/opencode-api/"),
      directory: "/workspace/boyuan",
      fetcher,
    });

    await expect(
      adapter.analyze(workflowInput("extract-risk-flags")),
    ).rejects.toThrow(/OpenCode skill is unavailable: extract-risk-flags/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("Exa 只接收规划后的公开查询并规范化可追溯来源", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        results: [
          {
            title: "白杨智能公开资料",
            url: "https://news.example.com/company",
            publishedDate: "2026-08-20T00:00:00.000Z",
            highlights: ["公司发布了新产品。"],
          },
        ],
      }),
    );
    const { search } = createRuntimeResearchAdapters(
      { BOYUAN_SEARCH_ADAPTER: "exa", EXA_API_KEY: "test-key" },
      {
        directory: "/workspace/boyuan",
        fetcher,
        now: () => new Date("2026-08-24T01:00:00.000Z"),
      },
    );

    const results = await search.search({
      companyName: "白杨智能有限公司",
      reason: "information_missing",
      query: "白杨智能有限公司 公司 最新 业务 产品 融资",
      maxResults: 5,
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.exa.ai/search");
    expect(init?.headers).toEqual(
      expect.objectContaining({ "x-api-key": "test-key" }),
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "白杨智能有限公司 公司 最新 业务 产品 融资",
      type: "auto",
      numResults: 5,
      contents: { highlights: true },
    });
    expect(results).toEqual([
      {
        title: "白杨智能公开资料",
        url: "https://news.example.com/company",
        site: "news.example.com",
        highlights: ["公司发布了新产品。"],
        accessStatus: "accessible",
        publishedAt: "2026-08-20T00:00:00.000Z",
        retrievedAt: "2026-08-24T01:00:00.000Z",
      },
    ]);
  });

  it("选择 Exa 时缺少密钥会在启动阶段失败", () => {
    expect(() =>
      createRuntimeResearchAdapters(
        { BOYUAN_SEARCH_ADAPTER: "exa" },
        { directory: "/workspace/boyuan" },
      ),
    ).toThrow(/EXA_API_KEY/);
  });
});

function workflowFetcher(
  availableSkill: CompanyResearchWorkflowSkill,
  calledSkill: CompanyResearchWorkflowSkill = availableSkill,
  summary = FROZEN_EXCERPT,
  extraOutput: Record<string, unknown> = {},
  additionalSkillCalls: readonly CompanyResearchWorkflowSkill[] = [],
) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json([{ name: availableSkill }]))
    .mockResolvedValueOnce(Response.json({ id: "session-workflow" }))
    .mockResolvedValueOnce(
      Response.json({
        info: {
          providerID: "openai",
          modelID: "gpt-5.6-sol",
          parentID: "turn-workflow",
        },
        parts: [
          {
            type: "text",
            text: JSON.stringify({
              summary: workflowSummaryItems(summary),
              decision: null,
              candidates: [],
              ...extraOutput,
            }),
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      Response.json([
        {
          info: { role: "assistant", parentID: "turn-workflow" },
          parts: [
            {
              type: "tool",
              tool: "skill",
              state: {
                status: "completed",
                input: { name: calledSkill },
              },
            },
            ...additionalSkillCalls.map((name) => ({
              type: "tool",
              tool: "skill",
              state: {
                status: "completed",
                input: { name },
              },
            })),
          ],
        },
      ]),
    );
}

function workflowSummaryItems(summary: string) {
  return [{
    state: 'source_excerpt',
    category: 'company_stage',
    sourceId: 'MAT-001',
    quote: summary,
  }];
}

function expectedSourceExcerptSummary(quote: string): string {
  return `【内部草稿｜非投资决定】\n材料摘录（公司主体与项目阶段）：${quote}`;
}

const FROZEN_EXCERPT = "公司计划完成新一轮融资。";

function workflowInput(
  workflowSkill: CompanyResearchWorkflowSkill,
): CompanyResearchInput {
  return {
    taskId: "task-workflow",
    conversationId: "conversation-workflow",
    companyId: "company-1",
    companyName: "白杨智能有限公司",
    intent: "形成内部投研判断支持",
    triggerReason: "not_needed",
    existingKnowledge: [
      {
        knowledgeType: "company_summary",
        statement: "公司提供企业智能化服务。",
        status: "current",
        createdAt: "2026-08-24T00:00:00.000Z",
      },
    ],
    pendingCandidates: [],
    webResults: [],
    workflowSkill,
    workflowContext: workflowContext(),
  };
}

function workflowContext(): CompanyResearchWorkflowContext {
  return {
    scope: {
      asOfDate: "2026-08-26",
      transactionSide: "investor",
      stage: "preliminary",
      audience: "内部投资团队",
      confidentiality: "restricted",
      decisionOwner: "投资负责人",
      mode: "preliminary",
      mandate: "人民币早期科技基金",
    },
    gates: {
      inputScopeApproval: {
        approved: true,
        approvedBy: "投资负责人",
        approvedAt: "2026-08-26T00:00:00.000Z",
        sourceIds: ["MAT-001"],
      },
      methodAssumptionApproval: { approved: false },
      externalReleaseApproval: { approved: false },
    },
    materials: [
      {
        sourceId: "MAT-001",
        title: "白杨智能 BP",
        excerpt: "公司计划完成新一轮融资。",
        locator: "第 3 页",
        evidenceState: "user-provided",
      },
    ],
  };
}
