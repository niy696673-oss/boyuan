import type { Company, ResearchTask } from "../../types";
import type {
  AnalysisSection,
  ConversationDetail,
  ConversationSummary,
  ConversationStatus,
  ExternalResearchSource,
  KnowledgeCandidate,
  PlatformCompany,
  PlatformDocument,
  PlatformEvidence,
  TaskStep,
} from "./types";

export interface WorkbenchExternalResearch {
  requested: boolean;
  executed: boolean;
  status: "not_requested" | "pending" | "completed" | "failed" | "cancelled";
  failureDetail?: string;
  query?: string;
  sources: ExternalResearchSource[];
}

export interface WorkbenchResearch {
  task: ResearchTask;
  platformConversationId: string;
  platformStatus: ConversationStatus;
  materialDocumentId: string;
  materialFileName: string;
  archiveStatus: PlatformDocument["archiveStatus"];
  pendingCandidateCount: number;
  company?: Company;
  analysisSections?: AnalysisSection[];
  candidates?: KnowledgeCandidate[];
  internalMaterialEvidence?: PlatformEvidence[];
  externalResearch?: WorkbenchExternalResearch;
  industry?: {
    id: string;
    name: string;
    parentId: null;
    level: 0;
    description: string;
    source: string;
  };
}

export function toWorkbenchConversation(
  conversation: ConversationSummary,
): WorkbenchResearch {
  return {
    platformConversationId: conversation.conversationId,
    platformStatus: conversation.status,
    materialDocumentId: conversation.document.documentId,
    materialFileName: conversation.document.fileName,
    archiveStatus: conversation.document.archiveStatus,
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
      createdBy: sourceChannelLabel(conversation.sourceChannel),
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
  resolve_company: "确认公司主体",
  load_company_knowledge: "加载正式知识",
  plan_external_search: "规划外部核验",
  execute_external_search: "执行 Exa 外部核验",
  analyze_company: "AI 公司研究",
  generate_research_candidates: "生成研究候选",
  load_industry_context: "加载行业材料与产业链",
  plan_industry_search: "规划行业外部核验",
  execute_industry_search: "执行 Exa 行业检索",
  analyze_industry: "AI 行业研究",
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
  const companyId =
    conversation.company?.companyId || conversation.companyResearch?.companyId;
  const industryId =
    conversation.industry?.industryId ||
    conversation.industryResearch?.industryId;
  const researchRecord = conversation.companyResearch || conversation.industryResearch;
  const internalMaterialEvidence = uniqueEvidence(
    conversation.analysisSections.flatMap((section) =>
      section.evidence.filter((evidence) => evidence.sourceType === "material"),
    ),
  );
  const externalSources = uniqueExternalSources([
    ...(researchRecord?.sources || []),
    ...conversation.analysisSections.flatMap((section) =>
      section.evidence
        .filter(
          (evidence): evidence is PlatformEvidence & { sourceType: "web" } =>
            evidence.sourceType === "web",
        )
        .map((evidence) => ({ ...evidence, accessStatus: "metadata_only" as const })),
    ),
  ]);
  const externalSearchExecuted = conversation.task.steps.some(
    (step) =>
      ["execute_external_search", "execute_industry_search"].includes(step.name) &&
      step.status === "completed",
  );
  const failedExternalSearchStep = conversation.task.steps.find(
    (step) =>
      ["execute_external_search", "execute_industry_search"].includes(step.name) &&
      step.status === "failed",
  );
  const externalSearchRequested = Boolean(
    researchRecord &&
      (researchRecord.explicitWebSearch ||
        (researchRecord.triggerReason && researchRecord.triggerReason !== "not_needed")),
  );
  const externalSearchFailed = Boolean(
    researchRecord &&
      (failedExternalSearchStep ||
        (externalSearchRequested &&
          !externalSearchExecuted &&
          externalSources.length === 0 &&
          conversation.task.status === "failed")),
  );
  const externalSearchCancelled = Boolean(
    externalSearchRequested &&
      !externalSearchExecuted &&
      externalSources.length === 0 &&
      conversation.task.status === "cancelled",
  );
  return {
    ...summary,
    ...(conversation.company
      ? { company: toWorkbenchCompany(conversation.company) }
      : {}),
    ...(conversation.industry
      ? {
          industry: {
            id: conversation.industry.industryId,
            name: conversation.industry.name,
            parentId: null,
            level: 0,
            description: conversation.industry.summary,
            source: "研究平台 SQLite",
          },
        }
      : {}),
    pendingCandidateCount: conversation.candidates.filter((candidate) =>
      ["pending", "conflicted"].includes(candidate.status),
    ).length,
    candidates: conversation.candidates,
    analysisSections: conversation.analysisSections.map((section) => ({
      ...section,
      evidence: section.evidence.filter(
        (evidence) => evidence.sourceType === "material",
      ),
    })),
    internalMaterialEvidence,
    ...(researchRecord
      ? {
          externalResearch: {
            requested: externalSearchRequested,
            executed: externalSearchExecuted || externalSources.length > 0,
            status: externalSearchFailed
              ? "failed"
              : externalSearchCancelled
                ? "cancelled"
              : externalSearchExecuted || externalSources.length > 0
                ? "completed"
                : externalSearchRequested
                  ? "pending"
                  : "not_requested",
            ...(externalSearchFailed
              ? {
                  failureDetail: failedExternalSearchStep?.errorCode
                    ? `外部检索步骤失败：${failedExternalSearchStep.errorCode}`
                    : "研究任务在外部检索完成前失败",
                }
              : {}),
            ...(researchRecord.publicQuery
              ? { query: researchRecord.publicQuery }
              : {}),
            sources: externalSources,
          },
        }
      : {}),
    task: {
      ...summary.task,
      ...(companyId ? { companyId } : {}),
      ...(industryId ? { industryId } : {}),
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

function sourceChannelLabel(
  sourceChannel: ConversationSummary["sourceChannel"],
): string {
  if (sourceChannel === "feishu") return "飞书";
  if (sourceChannel === "wecom") return "企业微信";
  return "工作台";
}

function toWorkbenchCompany(company: PlatformCompany): Company {
  return {
    id: company.companyId,
    standardName: company.canonicalName,
    aliases: company.aliases.map((alias) => alias.alias),
    description: "",
    cognitionStatus:
      company.status === "provisional"
        ? "待完善"
        : company.status === "merged"
          ? "已合并"
          : "已建档",
    attentionStatus: "未关注",
    positions: [],
    claims: [],
    evidence: [],
    updatedAt: company.updatedAt,
  };
}

function uniqueEvidence(items: PlatformEvidence[]): PlatformEvidence[] {
  return [...new Map(items.map((item) => [item.evidenceId, item])).values()];
}

function uniqueExternalSources(
  items: ExternalResearchSource[],
): ExternalResearchSource[] {
  const unique = new Map<string, ExternalResearchSource>();
  for (const item of items) {
    if (!unique.has(item.evidenceId)) unique.set(item.evidenceId, item);
  }
  return [...unique.values()];
}

function workbenchStatus(status: ConversationStatus): ResearchTask["status"] {
  if (status === "completed") return "已完成";
  if (status === "pending_confirmation") return "待用户确认";
  if (status === "waiting") return "检索中";
  if (status === "failed") return "执行失败";
  if (status === "cancelled") return "已取消";
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
