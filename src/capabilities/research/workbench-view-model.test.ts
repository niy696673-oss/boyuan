import { describe, expect, it } from "vitest";
import type { ConversationDetail } from "./types";
import { toWorkbenchResearch } from "./workbench-view-model";

describe("研究对话工作台视图模型", () => {
  it("把持久任务步骤和候选知识映射为现有工作台模型", () => {
    const detail = {
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
          {
            stepId: "step-3",
            name: "execute_external_search",
            position: 10,
            status: "completed",
            attempts: 1,
          },
        ],
      },
      analysisSections: [
        {
          key: "company_and_project_stage",
          title: "公司与项目阶段",
          summary: "公司专注企业智能化服务。",
          evidence: [
            {
              evidenceId: "evidence-1",
              sourceType: "material",
              quote: "公司专注企业智能化服务。",
              fileName: "白杨智能 BP.txt",
            },
            {
              evidenceId: "evidence-web-1",
              sourceType: "web",
              quote: "公司公开信息。",
              title: "白杨智能公开进展",
              site: "example.com",
              url: "https://example.com/company",
              retrievedAt: "2026-08-26T00:00:00.000Z",
            },
          ],
        },
      ],
      companyResearch: {
        runId: "research-1",
        companyId: "company-1",
        intent: "核验公开进展",
        explicitWebSearch: true,
        triggerReason: "user_requested",
        publicQuery: "白杨智能 公开进展",
        sources: [
          {
            evidenceId: "evidence-web-1",
            sourceType: "web",
            quote: "公司公开信息。",
            title: "白杨智能公开进展",
            site: "example.com",
            url: "https://example.com/company",
            retrievedAt: "2026-08-26T00:00:00.000Z",
            accessStatus: "accessible",
          },
        ],
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:01:00.000Z",
      },
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
    } satisfies ConversationDetail;

    const research = toWorkbenchResearch(detail);

    expect(research).toMatchObject({
      platformConversationId: "conversation-1",
      platformStatus: "completed",
      materialDocumentId: "document-1",
      materialFileName: "白杨智能 BP.txt",
      pendingCandidateCount: 1,
      task: {
        id: "task-1",
        query: "白杨智能 BP.txt",
        status: "已完成",
        answer: {
          text: "公司与项目阶段：公司专注企业智能化服务。",
          provider: "deterministic-test",
          model: "fixture-v1",
          citationCount: 2,
        },
        steps: [
          { name: "解析文件", status: "done" },
          { name: "生成候选知识", status: "needs-review" },
          { name: "执行 Exa 外部核验", status: "done" },
        ],
      },
      analysisSections: [
        {
          key: "company_and_project_stage",
          evidence: [{ evidenceId: "evidence-1", sourceType: "material" }],
        },
      ],
      internalMaterialEvidence: [
        { evidenceId: "evidence-1", sourceType: "material" },
      ],
      externalResearch: {
        requested: true,
        executed: true,
        status: "completed",
        query: "白杨智能 公开进展",
        sources: [
          {
            evidenceId: "evidence-web-1",
            sourceType: "web",
            accessStatus: "accessible",
          },
        ],
      },
    });
  });

  it.each([
    ["company", "execute_external_search"],
    ["industry", "execute_industry_search"],
  ] as const)("把 %s Exa 执行失败映射为显式失败态", (kind, stepName) => {
    const detail = failedResearchDetail(kind, stepName);

    const research = toWorkbenchResearch(detail);

    expect(research.externalResearch).toMatchObject({
      requested: true,
      executed: false,
      status: "failed",
      failureDetail: `外部检索步骤失败：${kind}_exa_failed`,
      sources: [],
    });
    expect(research.task.status).toBe("执行失败");
  });
});

function failedResearchDetail(
  kind: "company" | "industry",
  stepName: "execute_external_search" | "execute_industry_search",
): ConversationDetail {
  const researchRecord = {
    runId: `research-${kind}`,
    intent: "核验公开进展",
    explicitWebSearch: true,
    triggerReason: "user_requested" as const,
    publicQuery: "公开进展",
    sources: [],
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:01:00.000Z",
  };
  return {
    conversationId: `conversation-${kind}`,
    title: `${kind} research`,
    type: kind,
    sourceChannel: "web",
    status: "failed",
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:01:00.000Z",
    receiptCount: 1,
    document: {
      documentId: `document-${kind}`,
      fileName: `${kind} research`,
      bytes: 0,
      sha256: "fixture",
      parseStatus: "parsed",
      archiveStatus: "archived",
      createdAt: "2026-08-26T00:00:00.000Z",
    },
    task: {
      taskId: `task-${kind}`,
      type: kind === "company" ? "company_research" : "industry_research",
      status: "failed",
      currentStep: stepName,
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:01:00.000Z",
      steps: [
        {
          stepId: `step-${kind}`,
          name: stepName,
          position: 1,
          status: "failed",
          attempts: 2,
          errorCode: `${kind}_exa_failed`,
        },
      ],
    },
    analysisSections: [],
    candidates: [],
    ...(kind === "company"
      ? {
          companyResearch: {
            ...researchRecord,
            companyId: "company-1",
          },
        }
      : {
          industryResearch: {
            ...researchRecord,
            industryId: "industry-1",
          },
        }),
  };
}
