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
            },
          ],
        },
      ],
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
          citationCount: 1,
        },
        steps: [
          { name: "解析文件", status: "done" },
          { name: "生成候选知识", status: "needs-review" },
        ],
      },
    });
  });
});
