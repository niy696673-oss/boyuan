import type { ResearchTask } from "../../types";
import type {
  ConversationDetail,
  ConversationSummary,
  ConversationStatus,
  TaskStep,
} from "./types";

export interface WorkbenchResearch {
  task: ResearchTask;
  platformConversationId: string;
  materialFileName: string;
  pendingCandidateCount: number;
}

export function toWorkbenchConversation(
  conversation: ConversationSummary,
): WorkbenchResearch {
  return {
    platformConversationId: conversation.conversationId,
    materialFileName: conversation.document.fileName,
    pendingCandidateCount: 0,
    task: {
      id: conversation.task.taskId,
      query: conversation.title,
      contextType:
        conversation.type === "company"
          ? "公司"
          : conversation.type === "industry"
            ? "行业"
            : "材料",
      status: workbenchStatus(conversation.status),
      createdBy: conversation.sourceChannel === "feishu" ? "飞书" : "工作台",
      createdAt: conversation.createdAt,
      steps: (conversation.task.steps || []).map(toWorkbenchStep),
    },
  };
}

const stepNames: Record<string, string> = {
  persist_document: "保存原始材料",
  verify_storage: "验证文件存储",
  parse_document: "解析文件",
  classify_material: "识别材料类型",
  identify_company: "识别公司主体",
  suggest_conversation_reuse: "判断对话归并",
  analyze_material: "AI 深度分析",
  web_search: "Web Search 核验",
  generate_candidates: "生成候选知识",
};

export function toWorkbenchResearch(
  conversation: ConversationDetail,
): WorkbenchResearch {
  const evidenceIds = new Set(
    conversation.analysisSections.flatMap((section) =>
      section.evidence.map((evidence) => evidence.evidenceId),
    ),
  );
  const answerText = conversation.analysisSections
    .filter((section) => section.summary && section.summary !== "材料未披露")
    .map((section) => `${section.title}：${section.summary}`)
    .join("\n");

  const summary = toWorkbenchConversation(conversation);
  return {
    ...summary,
    pendingCandidateCount: conversation.candidates.filter((candidate) =>
      ["pending", "conflicted"].includes(candidate.status),
    ).length,
    task: {
      ...summary.task,
      steps: conversation.task.steps.map(toWorkbenchStep),
      ...(answerText
        ? {
            answer: {
              text: answerText,
              provider: conversation.task.providerId || "unknown",
              model: conversation.task.modelId || "unknown",
              citationCount: evidenceIds.size,
            },
          }
        : {}),
    },
  };
}

function workbenchStatus(status: ConversationStatus): ResearchTask["status"] {
  if (status === "completed") return "已完成";
  if (status === "pending_confirmation") return "待用户确认";
  if (status === "waiting") return "检索中";
  if (status === "failed") return "执行失败";
  return "识别中";
}

function toWorkbenchStep(step: TaskStep): ResearchTask["steps"][number] {
  const status: ResearchTask["steps"][number]["status"] =
    step.status === "completed" || step.status === "skipped"
      ? "done"
      : step.status === "running"
        ? "running"
        : step.status === "pending_confirmation" || step.status === "failed"
          ? "needs-review"
          : "pending";
  return {
    name: stepNames[step.name] || step.name,
    status,
    detail: step.errorCode
      ? `执行失败：${step.errorCode}`
      : status === "done"
        ? `已完成，执行 ${step.attempts} 次`
        : status === "running"
          ? `正在执行，当前为第 ${step.attempts} 次尝试`
          : "等待前置步骤完成",
  };
}
