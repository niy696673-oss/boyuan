import { describe, expect, it } from "vitest";
import type {
  CompanyDirectoryItem,
  LatestMaterialAnalysisV1,
} from "../../../shared/research-platform-v1";
import { companyDirectoryView } from "./view-model";

describe("公司目录前端投影", () => {
  it("卡片优先展示最近材料摘要，且待确认候选不计入正式知识", () => {
    const view = companyDirectoryView(
      directoryItem({
        taskStatus: "completed",
        summary: "最近 BP 显示公司已进入量产验证阶段。",
      }),
    );

    expect(view.description).toBe("最近 BP 显示公司已进入量产验证阶段。");
    expect(view.knowledgeCount).toBe(0);
    expect(view.pendingCandidateCount).toBe(7);
    expect(view.analysisStatus).toEqual({
      state: "pending_confirmation",
      label: "待确认 7",
      tone: "warning",
    });
  });

  it.each([
    ["queued", "分析排队中", "warning"],
    ["running", "分析进行中", "warning"],
    ["waiting", "等待继续处理", "warning"],
    ["failed", "分析失败", "warning"],
    ["cancelled", "分析已取消", "warning"],
  ] as const)("准确映射 %s 材料分析状态", (taskStatus, label, tone) => {
    const view = companyDirectoryView(directoryItem({ taskStatus }));

    expect(view.analysisStatus).toEqual({ state: taskStatus, label, tone });
  });

  it("没有待确认候选时才把正式知识显示为已确认", () => {
    const item = directoryItem({ taskStatus: "completed" });
    item.pendingCandidateCount = 0;
    item.knowledgeCount = 3;

    expect(companyDirectoryView(item).analysisStatus).toEqual({
      state: "confirmed",
      label: "已确认知识 3",
      tone: "success",
    });
  });
});

function directoryItem(
  analysis: Pick<LatestMaterialAnalysisV1, "taskStatus"> &
    Partial<LatestMaterialAnalysisV1>,
): CompanyDirectoryItem {
  return {
    companyId: "company-1",
    canonicalName: "云杉智能有限公司",
    status: "active",
    aliases: [{ alias: "错误材料标题", type: "source_name" }],
    version: 2,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    profile: {
      summary: { value: "旧的正式档案摘要。", state: "confirmed" },
      primaryIndustry: { state: "missing" },
      industryPosition: { state: "missing" },
      location: { state: "missing" },
      foundedAt: { state: "missing" },
      latestFunding: { state: "missing" },
      watched: false,
    },
    materialCount: 1,
    knowledgeCount: 0,
    pendingCandidateCount: 7,
    latestMaterialAnalysis: {
      taskId: "task-1",
      conversationId: "conversation-1",
      documentId: "document-1",
      fileName: "云杉智能 BP.pdf",
      sectionCount: 13,
      updatedAt: "2026-08-26T00:00:00.000Z",
      ...analysis,
    },
  };
}
