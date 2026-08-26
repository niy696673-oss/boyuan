import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileSearch,
  FileStack,
  FileText,
  Globe2,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  Network,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type Bootstrap } from "../api";
import {
  createCompanyDirectoryClient,
  type CompanyDirectoryClient,
} from "../capabilities/companies/client";
import { companyDirectoryView } from "../capabilities/companies/view-model";
import {
  createIndustryDirectoryClient,
  type IndustryDirectoryClient,
} from "../capabilities/industries/client";
import {
  createResearchPlatformClient,
  type PrivateMarketWorkflowSkill,
  type ResearchPlatformClient,
} from "../capabilities/research/client";
import type {
  AnalysisSection,
  ConversationDetail,
  ConversationStatus,
  PlatformEvidence,
} from "../capabilities/research/types";
import {
  toWorkbenchConversation,
  toWorkbenchResearch,
  type WorkbenchExternalResearch,
} from "../capabilities/research/workbench-view-model";
import type { Company, Evidence, IndustryNode, ResearchTask } from "../types";
import type { IndustryDirectoryItemV1 } from "../../shared/research-platform-v1";
import { AuthenticatedDocumentDownload } from "./AuthenticatedDocumentDownload";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type ContextType = "材料" | "公司" | "行业";
type WorkflowComposerState = {
  skill: PrivateMarketWorkflowSkill | "";
  inputScopeApproved: boolean;
  stage: string;
  audience: string;
  transactionSide: string;
  confidentiality: "public" | "internal" | "restricted";
  screenMode: "one-minute" | "preliminary" | "re-screen" | "gp-fit";
  mandate: string;
};
type ActiveResearch = {
  task: ResearchTask;
  company?: Company;
  industry?: IndustryNode;
  platformConversationId?: string;
  platformStatus?: ConversationStatus;
  materialDocumentId?: string;
  materialFileName?: string;
  pendingCandidateCount?: number;
  analysisSections?: AnalysisSection[];
  internalMaterialEvidence?: PlatformEvidence[];
  externalResearch?: WorkbenchExternalResearch;
} | null;

type ConversationRow = NonNullable<ActiveResearch>;

const defaultResearchClient = createResearchPlatformClient();
const defaultCompanyClient = createCompanyDirectoryClient();
const defaultIndustryClient = createIndustryDirectoryClient();
const terminalPlatformStatuses = new Set<ConversationStatus>([
  "pending_confirmation",
  "completed",
  "failed",
  "cancelled",
]);

export function WorkbenchPage({
  data,
  reload,
  researchClient = defaultResearchClient,
  companyClient = defaultCompanyClient,
  industryClient = defaultIndustryClient,
  persistentPendingCount,
  initialConversationId,
}: {
  data: Bootstrap;
  reload: () => void;
  researchClient?: ResearchPlatformClient;
  companyClient?: CompanyDirectoryClient;
  industryClient?: IndustryDirectoryClient;
  persistentPendingCount?: number;
  initialConversationId?: string;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pageRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const appliedCompanyId = useRef<string | null>(null);
  const appliedIndustryId = useRef<string | null>(null);
  const [activeResearch, setActiveResearch] = useState<ActiveResearch>(null);
  const [context, setContext] = useState<ContextType>("材料");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedIndustryId, setSelectedIndustryId] = useState("");
  const [query, setQuery] = useState("");
  const [workflowSkill, setWorkflowSkill] = useState<
    PrivateMarketWorkflowSkill | ""
  >("");
  const [workflowScopeApproved, setWorkflowScopeApproved] = useState(false);
  const [workflowStage, setWorkflowStage] = useState("");
  const [workflowAudience, setWorkflowAudience] = useState("内部投资团队");
  const [workflowSide, setWorkflowSide] = useState("company");
  const [workflowConfidentiality, setWorkflowConfidentiality] = useState<
    "public" | "internal" | "restricted"
  >("restricted");
  const [screenMode, setScreenMode] = useState<
    "one-minute" | "preliminary" | "re-screen" | "gp-fit"
  >("preliminary");
  const [screenMandate, setScreenMandate] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(
    null,
  );
  const [conversationFilter, setConversationFilter] = useState<
    "全部" | ContextType
  >("全部");
  const [platformConversations, setPlatformConversations] = useState<
    ConversationRow[]
  >([]);
  const [directoryCompanies, setDirectoryCompanies] = useState<Company[] | null>(
    null,
  );
  const [directoryIndustries, setDirectoryIndustries] = useState<
    IndustryDirectoryItemV1[] | null
  >(null);
  const workbenchData = useMemo<Bootstrap>(
    () => ({
      ...data,
      companies: directoryCompanies || [],
      industryNodes: (directoryIndustries || []).map((industry) => ({
        id: industry.industryId,
        name: industry.name,
        parentId: null,
        level: 0,
        description: industry.summary,
        source: "研究平台 SQLite",
      })),
    }),
    [data, directoryCompanies, directoryIndustries],
  );
  const openedInitialConversation = useRef<string | undefined>(undefined);

  const pending =
    persistentPendingCount ??
    workbenchData.companies.reduce(
      (sum, company) =>
        sum +
        company.claims.filter((claim) =>
          ["candidate", "disputed"].includes(claim.status),
        ).length,
      0,
    );

  useEffect(() => {
    const controller = new AbortController();
    void companyClient
      .list(controller.signal)
      .then((response) =>
        setDirectoryCompanies(response.items.map(companyDirectoryView)),
      )
      .catch((error) => {
        if (!controller.signal.aborted) {
          setNotice(
            error instanceof Error ? error.message : "无法读取公司目录",
          );
        }
      });
    return () => controller.abort();
  }, [companyClient]);

  useEffect(() => {
    const controller = new AbortController();
    void industryClient
      .list(controller.signal)
      .then((response) => setDirectoryIndustries(response.items))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setNotice(error instanceof Error ? error.message : "无法读取行业目录");
        }
      });
    return () => controller.abort();
  }, [industryClient]);

  useEffect(() => {
    const companyId = searchParams.get("companyId");
    if (
      !companyId ||
      !directoryCompanies ||
      appliedCompanyId.current === companyId
    )
      return;
    appliedCompanyId.current = companyId;
    if (!directoryCompanies.some((company) => company.id === companyId)) {
      setNotice("链接中的公司已不存在，请重新选择");
      return;
    }
    setActiveResearch(null);
    setContext("公司");
    setSelectedCompanyId(companyId);
    setNotice("");
  }, [directoryCompanies, searchParams]);

  useEffect(() => {
    const industryId = searchParams.get("industryId");
    if (
      !industryId ||
      !directoryIndustries ||
      appliedIndustryId.current === industryId
    ) return;
    appliedIndustryId.current = industryId;
    if (!directoryIndustries.some((industry) => industry.industryId === industryId)) {
      setNotice("链接中的行业已不存在，请重新选择");
      return;
    }
    setActiveResearch(null);
    setContext("行业");
    setSelectedIndustryId(industryId);
    setNotice("");
  }, [directoryIndustries, searchParams]);

  const loadPlatformConversations = useCallback(
    async (signal?: AbortSignal) => {
      const conversations = await researchClient.listConversations(signal);
      setPlatformConversations(conversations.map(toWorkbenchConversation));
    },
    [researchClient],
  );

  const syncPlatformConversation = useCallback(
    (conversation: ConversationDetail) => {
      const next = toWorkbenchResearch(conversation);
      setPlatformConversations((current) => {
        const found = current.some(
          (item) => item.platformConversationId === conversation.conversationId,
        );
        return found
          ? current.map((item) =>
              item.platformConversationId === conversation.conversationId
                ? next
                : item,
            )
          : [next, ...current];
      });
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadPlatformConversations(controller.signal).catch((error) => {
      if (!controller.signal.aborted) {
        setNotice(error instanceof Error ? error.message : "无法读取研究对话");
      }
    });
    return () => controller.abort();
  }, [loadPlatformConversations]);

  useEffect(() => {
    if (
      !initialConversationId ||
      openedInitialConversation.current === initialConversationId
    ) return;
    const controller = new AbortController();
    setBusy(true);
    setNotice("");
    void researchClient
      .getConversation(initialConversationId, controller.signal)
      .then((conversation) => {
        if (controller.signal.aborted) return;
        openedInitialConversation.current = initialConversationId;
        setActiveResearch(toWorkbenchResearch(conversation));
        syncPlatformConversation(conversation);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setNotice(error instanceof Error ? error.message : "无法打开研究对话");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [initialConversationId, researchClient, syncPlatformConversation]);

  useEffect(() => {
    const conversationId = activeResearch?.platformConversationId;
    if (
      !conversationId ||
      (activeResearch.platformStatus &&
        terminalPlatformStatuses.has(activeResearch.platformStatus))
    )
      return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const detail = await researchClient.getConversation(conversationId);
        if (!cancelled) {
          setActiveResearch(toWorkbenchResearch(detail));
          syncPlatformConversation(detail);
        }
      } catch (error) {
        if (!cancelled)
          setNotice(
            error instanceof Error ? error.message : "无法刷新任务状态",
          );
      }
    };
    const timer = window.setInterval(() => void refresh(), 1_200);
    void refresh();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeResearch?.platformConversationId,
    activeResearch?.platformStatus,
    researchClient,
    syncPlatformConversation,
  ]);

  const conversationRows = useMemo<ConversationRow[]>(
    () => [
      ...platformConversations,
      ...workbenchData.tasks.map((task) => ({
        task,
        company: workbenchData.companies.find(
          (item) => item.id === task.companyId,
        ),
        industry: workbenchData.industryNodes.find(
          (item) => item.id === task.industryId,
        ),
      })),
    ],
    [platformConversations, workbenchData],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    const scroller = pageRef.current?.querySelector<HTMLElement>(
      ".by-conversation-scroll, .by-workbench-home",
    );
    scroller?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeResearch?.task.id]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!activeResearch) {
        gsap.from(".by-home-center > *", {
          opacity: 0,
          y: 18,
          duration: 0.58,
          stagger: 0.055,
          ease: "power3.out",
        });
        return;
      }
      gsap.from(".by-timeline-item", {
        opacity: 0,
        y: 22,
        duration: 0.52,
        stagger: 0.065,
        ease: "power3.out",
      });
      const scroller = pageRef.current?.querySelector(
        ".by-conversation-scroll",
      );
      const contextBar = pageRef.current?.querySelector(".by-context-bar");
      const stream = pageRef.current?.querySelector(".by-conversation-stream");
      if (scroller && contextBar && stream && window.innerWidth >= 1100) {
        ScrollTrigger.create({
          trigger: stream,
          scroller,
          start: "top 86px",
          end: "bottom 300px",
          pin: contextBar,
          pinSpacing: false,
        });
      }
    },
    {
      scope: pageRef,
      dependencies: [activeResearch?.task.id],
      revertOnUpdate: true,
    },
  );

  const openConversation = async (research: ConversationRow) => {
    let next = research;
    if (research.platformConversationId) {
      setBusy(true);
      setNotice("");
      try {
        const detail = await researchClient.getConversation(
          research.platformConversationId,
        );
        next = toWorkbenchResearch(detail);
        syncPlatformConversation(detail);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "无法打开研究对话");
        return;
      } finally {
        setBusy(false);
      }
    }
    const { task, company, industry } = next;
    setActiveResearch(next);
    setContext(
      task.contextType || (industry ? "行业" : company ? "公司" : "材料"),
    );
    setSelectedCompanyId(company?.id || "");
    setSelectedIndustryId(industry?.id || "");
    setQuery("");
    setNotice("");
  };

  const runResearch = async () => {
    if (!query.trim() || busy) return;
    if (context === "公司" && !selectedCompanyId) {
      setNotice("请先选择一家已有公司");
      return;
    }
    if (context === "行业" && !selectedIndustryId) {
      setNotice("请先选择一个已有行业");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      if (context === "公司") {
        const company = workbenchData.companies.find(
          (item) => item.id === selectedCompanyId,
        );
        if (!company) {
          setNotice("选择的公司已不存在，请刷新后重试");
          return;
        }
        if (workflowSkill) {
          if (!workflowScopeApproved) {
            setNotice("运行投研 Skill 前，请确认本次输入材料范围");
            return;
          }
          if (!workflowStage.trim() || !workflowAudience.trim()) {
            setNotice("请填写融资/交易阶段和结果受众");
            return;
          }
          if (workflowSkill === "screen-deal" && !screenMandate.trim()) {
            setNotice("项目初筛需要填写本次投资 mandate");
            return;
          }
        }
        let workflowSourceIds: string[] = [];
        if (workflowSkill) {
          const loadWorkflowSources =
            researchClient.getCompanyResearchWorkflowSources;
          if (!loadWorkflowSources) {
            setNotice("当前运行时无法冻结投研材料范围，请刷新后重试");
            return;
          }
          const workflowSources = await loadWorkflowSources(company.id);
          if (workflowSources.length === 0) {
            setNotice("当前公司没有可授权的已解析材料，无法运行投研 Skill");
            return;
          }
          workflowSourceIds = workflowSources.map((source) => source.sourceId);
        }
        const approvedAt = new Date().toISOString();
        const conversation = await researchClient.startCompanyResearch({
          companyId: company.id,
          intent: query.trim(),
          explicitWebSearch: !workflowSkill,
          ...(workflowSkill
            ? {
                workflow: {
                  skill: workflowSkill,
                  scope: {
                    asOfDate: approvedAt.slice(0, 10),
                    transactionSide: workflowSide,
                    stage: workflowStage.trim(),
                    audience: workflowAudience.trim(),
                    confidentiality: workflowConfidentiality,
                    decisionOwner: data.user.name,
                    ...(workflowSkill === "screen-deal"
                      ? {
                          mode: screenMode,
                          mandate: screenMandate.trim(),
                        }
                      : {}),
                  },
                  inputScopeApproval: {
                    approved: true,
                    approvedBy: data.user.name,
                    approvedAt,
                    sourceIds: workflowSourceIds,
                  },
                },
              }
            : {}),
        });
        setActiveResearch({ ...toWorkbenchResearch(conversation), company });
        syncPlatformConversation(conversation);
        setQuery("");
        setWorkflowScopeApproved(false);
        await loadPlatformConversations();
        return;
      }
      if (context === "行业") {
        const industry = workbenchData.industryNodes.find(
          (item) => item.id === selectedIndustryId,
        );
        if (!industry) {
          setNotice("选择的行业已不存在，请刷新后重试");
          return;
        }
        const conversation = await researchClient.startIndustryResearch({
          industryId: industry.id,
          intent: query.trim(),
          explicitWebSearch: true,
        });
        setActiveResearch({ ...toWorkbenchResearch(conversation), industry });
        syncPlatformConversation(conversation);
        setQuery("");
        await loadPlatformConversations();
        return;
      }
      const result = await api.research({
        query: query.trim(),
        contextType: context,
      });
      setActiveResearch(result);
      setQuery("");
      reload();
    } catch (error) {
      setNotice(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "研究任务创建失败，请稍后重试",
      );
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setNotice(`已接收 ${files.length} 份材料，正在安全保存并创建对话`);
    const results = await Promise.allSettled(
      files.map((file) => researchClient.uploadDocument(file)),
    );
    const success = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    const failed = results.length - success;
    setNotice(
      failed
        ? `${success} 份已提交，${failed} 份失败，请检查格式后重试`
        : `${success} 份材料已保存，后台分析已开始`,
    );
    const first = results.find((result) => result.status === "fulfilled");
    if (first?.status === "fulfilled") {
      setActiveResearch(toWorkbenchResearch(first.value.conversation));
      setContext("材料");
    }
    if (uploadRef.current) uploadRef.current.value = "";
    await loadPlatformConversations();
  };

  const workflowComposer: WorkflowComposerState = {
    skill: workflowSkill,
    inputScopeApproved: workflowScopeApproved,
    stage: workflowStage,
    audience: workflowAudience,
    transactionSide: workflowSide,
    confidentiality: workflowConfidentiality,
    screenMode,
    mandate: screenMandate,
  };
  const applyWorkflowComposer = (next: WorkflowComposerState) => {
    setWorkflowSkill(next.skill);
    setWorkflowScopeApproved(next.inputScopeApproved);
    setWorkflowStage(next.stage);
    setWorkflowAudience(next.audience);
    setWorkflowSide(next.transactionSide);
    setWorkflowConfidentiality(next.confidentiality);
    setScreenMode(next.screenMode);
    setScreenMandate(next.mandate);
  };

  return (
    <div className="by-workbench" ref={pageRef}>
      <ConversationRail
        data={workbenchData}
        conversations={conversationRows}
        filter={conversationFilter}
        activeTaskId={activeResearch?.task.id}
        onFilter={setConversationFilter}
        onNew={() => {
          setActiveResearch(null);
          setQuery("");
          setNotice("");
          setSelectedCompanyId("");
          setSelectedIndustryId("");
          setWorkflowSkill("");
          setWorkflowScopeApproved(false);
        }}
        onOpen={(research) => void openConversation(research)}
      />

      {!activeResearch ? (
        <section className="by-workbench-home">
          <div className="by-home-center">
            <div className="by-assistant-mark">
              <Sparkles />
            </div>
            <h1>今天想研究什么？</h1>
            <p>
              提交问题或材料，博源 AI
              会调用你有权访问的机构知识，并保留完整来源。
            </p>
            <ResearchComposer
              data={workbenchData}
              context={context}
              selectedCompanyId={selectedCompanyId}
              selectedIndustryId={selectedIndustryId}
              query={query}
              busy={busy}
              notice={notice}
              workflow={workflowComposer}
              onContext={(next) => {
                setContext(next);
                setNotice("");
              }}
              onCompany={setSelectedCompanyId}
              onIndustry={setSelectedIndustryId}
              onQuery={setQuery}
              onWorkflow={applyWorkflowComposer}
              onSubmit={runResearch}
              onUpload={() => uploadRef.current?.click()}
            />
            <input
              ref={uploadRef}
              hidden
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              onChange={(event) =>
                void uploadFiles([...(event.target.files || [])])
              }
            />
            <QuickActions
              companyCount={workbenchData.companies.length}
              onUpload={() => uploadRef.current?.click()}
              onFill={(nextContext, prompt) => {
                setContext(nextContext);
                setQuery(prompt);
                setNotice("");
              }}
            />
            <RecentTasks
              data={workbenchData}
              onOpen={(task) =>
                void openConversation({
                  task,
                  company: workbenchData.companies.find(
                    (item) => item.id === task.companyId,
                  ),
                  industry: workbenchData.industryNodes.find(
                    (item) => item.id === task.industryId,
                  ),
                })
              }
            />
            <div className="by-governance-note">
              <ShieldCheck />
              <span>
                AI 与 Web Search 只生成候选知识，确认后才会进入机构知识库
              </span>
              <button onClick={() => navigate("/confirmations")}>
                {pending} 条待确认 <ArrowRight />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <ActiveConversation
            research={activeResearch}
            data={workbenchData}
            context={context}
            selectedCompanyId={selectedCompanyId}
            selectedIndustryId={selectedIndustryId}
            query={query}
            busy={busy}
            notice={notice}
            workflow={workflowComposer}
            uploadRef={uploadRef}
            onContext={setContext}
            onCompany={setSelectedCompanyId}
            onIndustry={setSelectedIndustryId}
            onQuery={setQuery}
            onWorkflow={applyWorkflowComposer}
            onSubmit={runResearch}
            onUploadFiles={uploadFiles}
            onEvidence={setSelectedEvidence}
            onReviewCandidates={() => navigate("/confirmations")}
          />
          <TaskRail
            task={activeResearch.task}
            pending={
              activeResearch.pendingCandidateCount ??
              activeResearch.company?.claims.filter((claim) =>
                ["candidate", "disputed"].includes(claim.status),
              ).length ??
              0
            }
            activeStep={activeStep}
            onStep={setActiveStep}
            onReview={() => navigate("/confirmations")}
          />
        </>
      )}

      {selectedEvidence && (
        <EvidenceDrawer
          evidence={selectedEvidence}
          onClose={() => setSelectedEvidence(null)}
        />
      )}
    </div>
  );
}

function ConversationRail({
  data,
  conversations,
  filter,
  activeTaskId,
  onFilter,
  onNew,
  onOpen,
}: {
  data: Bootstrap;
  conversations: ConversationRow[];
  filter: "全部" | ContextType;
  activeTaskId?: string;
  onFilter: (filter: "全部" | ContextType) => void;
  onNew: () => void;
  onOpen: (research: ConversationRow) => void;
}) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase("zh-CN");
  const visibleTasks = conversations.filter(({ task }) => {
    const matchesFilter = (() => {
      if (filter === "全部") return true;
      if (task.contextType) return task.contextType === filter;
      if (filter === "公司") return Boolean(task.companyId);
      if (filter === "行业")
        return Boolean(task.industryId) || /行业|产业链/.test(task.query);
      return !task.companyId || /材料|BP|名单/.test(task.query);
    })();
    if (!matchesFilter || !normalizedSearch) return matchesFilter;
    return [
      task.query,
      task.createdBy,
      task.contextType,
      task.companyId,
      task.industryId,
    ]
      .filter(Boolean)
      .some((value) =>
        String(value).toLocaleLowerCase("zh-CN").includes(normalizedSearch),
      );
  });
  return (
    <aside className="by-conversation-rail" aria-label="研究对话">
      <button className="by-new-conversation" onClick={onNew}>
        <Plus />
        新建对话
      </button>
      <label className="by-rail-search">
        <Search />
        <input
          aria-label="搜索对话或来源"
          placeholder="搜索对话或来源"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className="by-rail-filters">
        {(["全部", "材料", "公司", "行业"] as const).map((item) => (
          <button
            className={filter === item ? "active" : ""}
            key={item}
            onClick={() => onFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="by-conversation-list">
        <span>最近对话</span>
        {visibleTasks.map((research) => {
          const { task } = research;
          const company = data.companies.find(
            (item) => item.id === task.companyId,
          );
          const pending =
            research.pendingCandidateCount ??
            company?.claims.filter((claim) =>
              ["candidate", "disputed"].includes(claim.status),
            ).length ??
            0;
          return (
            <button
              className={activeTaskId === task.id ? "active" : ""}
              key={research.platformConversationId || task.id}
              onClick={() => onOpen(research)}
            >
              <FileText />
              <span>
                <strong>{task.query}</strong>
                <small>
                  <em>工作台</em>
                  {relativeTime(task.createdAt)}
                </small>
              </span>
              <StatusMark status={task.status} count={pending} />
            </button>
          );
        })}
      </div>
      <button className="by-view-all">
        <MessageSquareText />
        查看全部对话
        <ChevronRight />
      </button>
    </aside>
  );
}

function QuickActions({
  companyCount,
  onUpload,
  onFill,
}: {
  companyCount: number;
  onUpload: () => void;
  onFill: (context: ContextType, prompt: string) => void;
}) {
  const actions = [
    {
      icon: FileStack,
      title: "分析一份材料",
      detail: "提炼要点、核验事实",
      action: onUpload,
    },
    {
      icon: Building2,
      title: "研究一家公司",
      detail: `从 ${companyCount} 家已有主体中选择`,
      action: () =>
        onFill("公司", "请总结这家公司的核心产品、竞争壁垒与主要风险"),
    },
    {
      icon: ListChecks,
      title: "处理公司名单",
      detail: "批量识别与建立档案",
      action: () => onFill("材料", "识别并处理这份公司名单"),
    },
    {
      icon: Globe2,
      title: "研究一个行业",
      detail: "公司映射与产业链分析",
      action: () =>
        onFill("行业", "请分析这个行业的产业链结构、重点公司与关键趋势"),
    },
  ];
  return (
    <div className="by-quick-actions" aria-label="快捷研究任务">
      {actions.map(({ icon: Icon, title, detail, action }) => (
        <button key={title} onClick={action}>
          <Icon />
          <span>
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function RecentTasks({
  data,
  onOpen,
}: {
  data: Bootstrap;
  onOpen: (task: ResearchTask) => void;
}) {
  const rows = data.tasks.slice(0, 3);
  return (
    <section className="by-recent-tasks">
      <header>
        <h2>近期任务</h2>
        <button>
          查看全部
          <ChevronRight />
        </button>
      </header>
      <div>
        {rows.map((task) => {
          const company = data.companies.find(
            (item) => item.id === task.companyId,
          );
          const pending =
            company?.claims.filter((claim) =>
              ["candidate", "disputed"].includes(claim.status),
            ).length || 0;
          const progress = task.steps.length
            ? Math.round(
                (task.steps.filter((step) => step.status === "done").length /
                  task.steps.length) *
                  100,
              )
            : 0;
          return (
            <button key={task.id} onClick={() => onOpen(task)}>
              <span className="by-task-kind">
                {task.industryId ? (
                  <Globe2 />
                ) : task.companyId ? (
                  <Building2 />
                ) : (
                  <FileText />
                )}
              </span>
              <span>
                <strong>{task.query}</strong>
                <small>工作台 · {relativeTime(task.createdAt)}</small>
              </span>
              <span className="by-task-progress">
                <i style={{ width: `${progress}%` }} />
                {task.status}
              </span>
              <StatusMark status={task.status} count={pending} />
              <ChevronRight />
            </button>
          );
        })}
        {!rows.length && (
          <p className="by-inline-empty">
            暂无研究任务，从上方输入问题或上传材料开始。
          </p>
        )}
      </div>
    </section>
  );
}

function ActiveConversation({
  research,
  data,
  context,
  selectedCompanyId,
  selectedIndustryId,
  query,
  busy,
  notice,
  workflow,
  uploadRef,
  onContext,
  onCompany,
  onIndustry,
  onQuery,
  onWorkflow,
  onSubmit,
  onUploadFiles,
  onEvidence,
  onReviewCandidates,
}: {
  research: NonNullable<ActiveResearch>;
  data: Bootstrap;
  context: ContextType;
  selectedCompanyId: string;
  selectedIndustryId: string;
  query: string;
  busy: boolean;
  notice: string;
  workflow: WorkflowComposerState;
  uploadRef: React.RefObject<HTMLInputElement | null>;
  onContext: (context: ContextType) => void;
  onCompany: (companyId: string) => void;
  onIndustry: (industryId: string) => void;
  onQuery: (query: string) => void;
  onWorkflow: (workflow: WorkflowComposerState) => void;
  onSubmit: () => void;
  onUploadFiles: (files: File[]) => void;
  onEvidence: (evidence: Evidence) => void;
  onReviewCandidates: () => void;
}) {
  const { company, industry, task } = research;
  const industryCompanyIds = new Set(
    industry
      ? data.companies
          .filter((candidate) =>
            candidate.positions.some((position) => {
              const node = data.industryNodes.find(
                (item) => item.id === position.nodeId,
              );
              return node?.id === industry.id || node?.parentId === industry.id;
            }),
          )
          .map((candidate) => candidate.id)
      : [],
  );
  const evidence =
    company?.evidence ||
    data.companies
      .filter((candidate) => industryCompanyIds.has(candidate.id))
      .flatMap((candidate) => candidate.evidence);
  const internalMaterialEvidence = research.internalMaterialEvidence || [];
  const companyName = company
    ? company.aliases[0] || company.standardName
    : undefined;
  const primaryEvidence = evidence[0];
  const primaryPlatformEvidence = internalMaterialEvidence[0];
  const originalDocumentId =
    primaryPlatformEvidence?.documentId || research.materialDocumentId;
  const primaryFileName =
    primaryEvidence?.fileName ||
    primaryPlatformEvidence?.fileName ||
    research.materialFileName ||
    `${industry?.name || companyName || "当前对象"}研究材料`;
  const industryName =
    industry?.name ||
    company?.positions
      .map(
        (position) =>
          data.industryNodes.find((node) => node.id === position.nodeId)?.name,
      )
      .find(Boolean);
  const externalClaims =
    company?.claims.filter((claim) => claim.type === "external_view") || [];
  const externalSources = (research.externalResearch?.sources || []).filter(
    (source) => source.sourceType === "web",
  );
  const externalSearchState = research.externalResearch?.status === "failed"
    ? "检索失败"
    : research.externalResearch?.status === "cancelled"
      ? "已取消"
      : externalSources.length
        ? `已完成 · ${externalSources.length} 条来源`
        : research.externalResearch?.executed
        ? "已完成 · 0 条来源"
        : research.externalResearch?.requested
          ? "检索中"
          : externalClaims.length
            ? "已完成"
            : "未执行";
  const pendingCount =
    research.pendingCandidateCount ??
    company?.claims.filter((claim) =>
      ["candidate", "disputed"].includes(claim.status),
    ).length ??
    0;
  const platformMaterialStored = Boolean(
    research.platformConversationId && research.materialFileName,
  );
  const parseStep = task.steps.find((step) => step.name === "解析文件");
  const parseState =
    parseStep?.status === "done"
      ? "已完成"
      : parseStep?.status === "running"
        ? "处理中"
        : parseStep?.status === "needs-review"
          ? "需要处理"
          : "等待处理";
  const analysisState = task.answer
    ? "已完成"
    : task.status === "已取消"
      ? "已取消"
      : task.status === "执行失败"
        ? "执行失败"
        : "等待生成";
  return (
    <section className="by-active-conversation">
      <div className="by-conversation-scroll">
        <header className="by-context-bar">
          <span className="by-file-mark">
            <FileText />
          </span>
          <div>
            <h1>{primaryFileName}</h1>
            <p>
              来源：<strong>{primaryEvidence || primaryPlatformEvidence ? "机构材料" : "研究任务"}</strong>
              <span />
              创建时间：{new Date(task.createdAt).toLocaleString("zh-CN")}
              {companyName && (
                <>
                  <span />
                  公司：{companyName}
                </>
              )}
              {industryName && (
                <>
                  <span />
                  行业：{industryName}
                </>
              )}
            </p>
          </div>
          <span className="by-archive-state">
            <Check />
            已自动归档
          </span>
          {originalDocumentId && (
            <AuthenticatedDocumentDownload
              className="by-context-action"
              documentId={originalDocumentId}
              fileName={primaryFileName}
            />
          )}
        </header>

        <div className="by-conversation-stream">
          <TimelineItem
            icon={<FileText />}
            title="原始材料"
            state={
              primaryEvidence || primaryPlatformEvidence || platformMaterialStored
                ? "已保存"
                : "等待上传"
            }
          >
            <button
              className="by-file-row"
              onClick={() => {
                if (primaryEvidence) onEvidence(primaryEvidence);
                else if (primaryPlatformEvidence)
                  onEvidence(platformEvidenceForDrawer(primaryPlatformEvidence));
              }}
            >
              <FileText />
              <span>
                <strong>{primaryFileName}</strong>
                <small>
                  {primaryEvidence
                    ? `${primaryEvidence.sourceDate} · 原始证据`
                    : primaryPlatformEvidence
                      ? `${platformEvidenceLocator(primaryPlatformEvidence)} · 冻结材料证据`
                    : platformMaterialStored
                      ? "已由研究平台持久保存"
                      : "尚未关联原始材料"}
                </small>
              </span>
              <BookOpen />
            </button>
          </TimelineItem>
          <TimelineItem
            icon={<FileCheck2 />}
            title="文件解析"
            state={
              parseStep ? parseState : primaryEvidence ? "已完成" : "等待材料"
            }
          >
            <p className="by-process-line">
              {task.steps.find((step) => /检索|材料|解析/.test(step.name))
                ?.detail || "上传材料后将自动解析正文、表格与图表。"}
            </p>
          </TimelineItem>
          <TimelineItem
            icon={<Sparkles />}
            title="AI 分析"
            state={analysisState}
            source="AI 候选"
          >
            <article className="by-analysis-card">
              <section>
                <h3>材料摘要</h3>
                <p>
                  {task.answer?.text ||
                    company?.description ||
                    industry?.description ||
                    "当前尚未形成分析摘要。补充材料后，系统将生成带有证据引用的内容。"}
                </p>
              </section>
              {!!research.analysisSections?.length && (
                <section>
                  <h3>分析结论与内部材料证据</h3>
                  <div className="by-platform-analysis-sections">
                    {research.analysisSections.map((section) => (
                      <article key={section.key}>
                        <strong>{section.title}</strong>
                        <p>{section.summary}</p>
                        {!!section.evidence.length && (
                          <div className="by-material-evidence-links">
                            {section.evidence.map((item) => (
                              <button
                                type="button"
                                key={item.evidenceId}
                                onClick={() =>
                                  onEvidence(platformEvidenceForDrawer(item))
                                }
                              >
                                <FileSearch />
                                <span>{item.fileName || "内部材料"}</span>
                                <code>{item.evidenceId}</code>
                              </button>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h3>核心信息</h3>
                <div className="by-analysis-columns">
                  {company?.claims.slice(0, 6).map((claim) => (
                    <button
                      key={claim.id}
                      onClick={() =>
                        evidence.find((item) =>
                          claim.evidenceIds.includes(item.id),
                        ) &&
                        onEvidence(
                          evidence.find((item) =>
                            claim.evidenceIds.includes(item.id),
                          )!,
                        )
                      }
                    >
                      <span>{claim.category}</span>
                      <p>{claim.text}</p>
                      <small>
                        <FileSearch />
                        {claim.evidenceIds.length} 条证据
                      </small>
                    </button>
                  ))}
                  {!company?.claims.length && (
                    <p className="by-inline-empty">
                      暂无结构化结论，当前回答直接基于已关联的 BP 证据生成。
                    </p>
                  )}
                </div>
              </section>
              <section>
                <h3>风险与待验证</h3>
                <ul>
                  {company?.claims
                    .filter((claim) =>
                      ["candidate", "disputed"].includes(claim.status),
                    )
                    .slice(0, 4)
                    .map((claim) => (
                      <li key={claim.id}>{claim.text}</li>
                    ))}
                  {!pendingCount && <li>暂无待验证事项</li>}
                </ul>
              </section>
              <button
                type="button"
                className="by-candidate-entry"
                onClick={onReviewCandidates}
              >
                {pendingCount} 条候选知识待确认
                <ChevronRight />
              </button>
            </article>
          </TimelineItem>
          <TimelineItem
            icon={<Globe2 />}
            title="Web Search 核验"
            state={externalSearchState}
            source="Exa 外部来源"
          >
            <article className="by-web-card">
              {research.externalResearch?.status === "failed" && (
                <p className="by-inline-empty">
                  {research.externalResearch.failureDetail || "外部信息核验执行失败"}
                  。可在下方重新输入原研究问题并发送，以创建新的研究任务重试。
                </p>
              )}
              {externalSources.map((source) => {
                const safeUrl = safeExternalUrl(source.url);
                const sourceLabel =
                  source.title || safeUrl || source.site || "公开来源";
                return (
                  <div key={source.evidenceId}>
                    <span>{source.site || "外部网站"}</span>
                    <p>
                      <strong>{sourceLabel}</strong>
                      {safeUrl && <small>{safeUrl}</small>}
                    </p>
                    <time>{externalSourceStatus(source)}</time>
                    {safeUrl ? (
                      <a
                        aria-label={`打开外部来源：${sourceLabel}`}
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink />
                      </a>
                    ) : (
                      <span aria-label="来源地址不可打开">—</span>
                    )}
                  </div>
                );
              })}
              {externalClaims.map((claim) => (
                <div key={claim.id}>
                  <span>外部来源</span>
                  <p>{claim.text}</p>
                  <time>{claim.eventTime || "待补充日期"}</time>
                  <ExternalLink />
                </div>
              ))}
              {!externalSources.length &&
                !externalClaims.length &&
                research.externalResearch?.status !== "failed" && (
                <p className="by-inline-empty">
                  {research.externalResearch?.status === "cancelled"
                    ? "外部信息核验已取消，本次未生成来源。"
                    : research.externalResearch?.executed
                    ? "外部信息核验已执行，本次未返回可展示来源。"
                    : research.externalResearch?.requested
                      ? "外部信息核验正在执行，来源返回后会在此展示。"
                      : "尚未执行外部信息核验，系统不会生成虚构来源。"}
                </p>
                )}
              {externalClaims.some((claim) => claim.status === "disputed") && (
                <button>
                  <CircleAlert />
                  发现外部信息与内部材料存在冲突
                  <span>
                    查看详情
                    <ChevronRight />
                  </span>
                </button>
              )}
            </article>
          </TimelineItem>
        </div>
      </div>

      <div className="by-active-composer">
        <ResearchComposer
          data={data}
          context={context}
          selectedCompanyId={selectedCompanyId}
          selectedIndustryId={selectedIndustryId}
          query={query}
          busy={busy}
          notice={notice}
          workflow={workflow}
          compact
          onContext={onContext}
          onCompany={onCompany}
          onIndustry={onIndustry}
          onQuery={onQuery}
          onWorkflow={onWorkflow}
          onSubmit={onSubmit}
          onUpload={() => uploadRef.current?.click()}
        />
        <input
          ref={uploadRef}
          hidden
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md"
          onChange={(event) =>
            void onUploadFiles([...(event.target.files || [])])
          }
        />
      </div>
    </section>
  );
}

function platformEvidenceForDrawer(evidence: PlatformEvidence): Evidence {
  return {
    id: evidence.evidenceId,
    documentId: evidence.documentId || "",
    fileName: evidence.fileName || evidence.title || "内部材料证据",
    excerpt: evidence.quote,
    ...(evidence.page === undefined ? {} : { page: evidence.page }),
    sourceDate: evidence.publishedAt || evidence.retrievedAt || "日期未记录",
    visibility: "organization",
  };
}

function platformEvidenceLocator(evidence: PlatformEvidence): string {
  if (evidence.page !== undefined) return `第 ${evidence.page} 页`;
  if (evidence.paragraph !== undefined) return `第 ${evidence.paragraph} 段`;
  if (evidence.sheet) {
    return [evidence.sheet, evidence.cellRange].filter(Boolean).join(" · ");
  }
  return evidence.evidenceId;
}

function safeExternalUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function externalSourceStatus(
  source: WorkbenchExternalResearch["sources"][number],
): string {
  const access =
    source.accessStatus === "accessible" ? "已获取" : "仅元数据";
  if (!source.retrievedAt) return `${access} · 时间未记录`;
  return `${access} · ${new Date(source.retrievedAt).toLocaleDateString("zh-CN")}`;
}

function TimelineItem({
  icon,
  title,
  state,
  source,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  state: string;
  source?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="by-timeline-item">
      <span className="by-timeline-icon">{icon}</span>
      <div className="by-timeline-content">
        <header>
          <h2>
            {title}
            {source && <em>{source}</em>}
          </h2>
          <span>
            <Check />
            {state}
          </span>
        </header>
        {children}
      </div>
    </section>
  );
}

function TaskRail({
  task,
  pending,
  activeStep,
  onStep,
  onReview,
}: {
  task: ResearchTask;
  pending: number;
  activeStep: number;
  onStep: (step: number) => void;
  onReview: () => void;
}) {
  const steps = task.steps.map((step) => ({
    name: step.name,
    detail: step.detail,
    status: step.status,
  }));
  if (pending > 0 && !steps.some((step) => step.name.includes("确认")))
    steps.push({
      name: "候选知识确认",
      detail: `${pending} 项等待人工判断`,
      status: "needs-review",
    });
  return (
    <aside className="by-task-rail">
      <div className="by-task-rail-inner">
        <h2>当前任务进度</h2>
        <div className="by-step-accordion">
          {steps.map((step, index) => (
            <button
              className={`${activeStep === index ? "active" : ""} ${step.status === "done" ? "done" : "pending"}`}
              key={`${step.name}-${index}`}
              onClick={() => onStep(index)}
            >
              <span>
                {step.status === "done" ? (
                  <Check />
                ) : step.name.includes("确认") ? (
                  pending
                ) : (
                  <Clock3 />
                )}
              </span>
              <strong>{step.name}</strong>
              <time>
                {step.status === "done"
                  ? "已完成"
                  : step.status === "running"
                    ? "进行中"
                    : "待处理"}
              </time>
              <ChevronDown />
              {activeStep === index && <p>{step.detail}</p>}
            </button>
          ))}
        </div>
        <section className="by-task-review-card">
          <span>待处理事项</span>
          <strong>{pending} 项候选知识等待确认</strong>
          <button onClick={onReview}>处理待确认</button>
        </section>
        <button className="by-task-detail">
          <ListChecks />
          查看执行详情
        </button>
      </div>
    </aside>
  );
}

function ResearchComposer({
  data,
  context,
  selectedCompanyId,
  selectedIndustryId,
  query,
  busy,
  notice,
  workflow,
  compact = false,
  onContext,
  onCompany,
  onIndustry,
  onQuery,
  onWorkflow,
  onSubmit,
  onUpload,
}: {
  data: Bootstrap;
  context: ContextType;
  selectedCompanyId: string;
  selectedIndustryId: string;
  query: string;
  busy: boolean;
  notice: string;
  workflow: WorkflowComposerState;
  compact?: boolean;
  onContext: (context: ContextType) => void;
  onCompany: (companyId: string) => void;
  onIndustry: (industryId: string) => void;
  onQuery: (query: string) => void;
  onWorkflow: (workflow: WorkflowComposerState) => void;
  onSubmit: () => void;
  onUpload: () => void;
}) {
  return (
    <div className={`by-composer ${compact ? "compact" : ""}`}>
      {notice && <div className="by-composer-notice">{notice}</div>}
      <div className="by-composer-context-row">
        <div className="by-context-switch" aria-label="研究类型">
          {(["材料", "公司", "行业"] as const).map((type) => (
            <button
              className={context === type ? "active" : ""}
              key={type}
              onClick={() => onContext(type)}
            >
              {type}
            </button>
          ))}
        </div>
        {context === "公司" && (
          <ResearchTargetPicker
            kind="公司"
            items={data.companies.map((company) => ({
              id: company.id,
              name: company.aliases[0] || company.standardName,
              detail: `${company.evidence.length} 份 BP`,
            }))}
            selectedId={selectedCompanyId}
            onSelect={onCompany}
          />
        )}
        {context === "行业" && (
          <ResearchTargetPicker
            kind="行业"
            items={data.industryNodes
              .filter(
                (industry) =>
                  industry.parentId === null || industry.level === 0,
              )
              .map((industry) => ({
                id: industry.id,
                name: industry.name,
                detail: `${
                  data.companies.filter((company) =>
                    company.positions.some((position) => {
                      const node = data.industryNodes.find(
                        (item) => item.id === position.nodeId,
                      );
                      return (
                        node?.id === industry.id ||
                        node?.parentId === industry.id
                      );
                    }),
                  ).length
                } 家公司`,
              }))}
            selectedId={selectedIndustryId}
            onSelect={onIndustry}
          />
        )}
        {context === "材料" && (
          <span className="by-material-context-note">
            <FileText />
            上传材料，或直接提出研究问题
          </span>
        )}
      </div>
      {context === "公司" && (
        <div className="by-workflow-config">
          <div className="by-workflow-skills" aria-label="投研 Skill">
            {([
              ["", "常规研究"],
              ["diagnose-bp", "BP 材料完整性复核"],
              ["screen-deal", "项目初筛"],
              ["extract-risk-flags", "风险提取"],
            ] as const).map(([skill, label]) => (
              <button
                type="button"
                className={workflow.skill === skill ? "active" : ""}
                key={skill || "default"}
                onClick={() => onWorkflow({
                  ...workflow,
                  skill,
                  inputScopeApproved: false,
                })}
              >
                {label}
              </button>
            ))}
          </div>
          {workflow.skill && (
            <div className="by-workflow-scope">
              <label>
                <span>交易侧</span>
                <select
                  aria-label="交易侧"
                  value={workflow.transactionSide}
                  onChange={(event) => onWorkflow({
                    ...workflow,
                    transactionSide: event.target.value,
                    inputScopeApproved: false,
                  })}
                >
                  <option value="company">公司</option>
                  <option value="fa">FA</option>
                  <option value="gp">GP / 投资方</option>
                  <option value="lp">LP</option>
                  <option value="unknown">待确认</option>
                </select>
              </label>
              <label>
                <span>融资/交易阶段</span>
                <input
                  aria-label="融资或交易阶段"
                  value={workflow.stage}
                  onChange={(event) => onWorkflow({
                    ...workflow,
                    stage: event.target.value,
                    inputScopeApproved: false,
                  })}
                  placeholder="例如：A 轮初筛"
                />
              </label>
              <label>
                <span>结果受众</span>
                <input
                  aria-label="结果受众"
                  value={workflow.audience}
                  onChange={(event) => onWorkflow({
                    ...workflow,
                    audience: event.target.value,
                    inputScopeApproved: false,
                  })}
                />
              </label>
              <label>
                <span>保密级别</span>
                <select
                  aria-label="保密级别"
                  value={workflow.confidentiality}
                  onChange={(event) => onWorkflow({
                    ...workflow,
                    confidentiality: event.target.value as WorkflowComposerState["confidentiality"],
                    inputScopeApproved: false,
                  })}
                >
                  <option value="restricted">受限</option>
                  <option value="internal">内部</option>
                  <option value="public">公开</option>
                </select>
              </label>
              {workflow.skill === "screen-deal" && (
                <>
                  <label>
                    <span>初筛模式</span>
                    <select
                      aria-label="初筛模式"
                      value={workflow.screenMode}
                      onChange={(event) => onWorkflow({
                        ...workflow,
                        screenMode: event.target.value as WorkflowComposerState["screenMode"],
                        inputScopeApproved: false,
                      })}
                    >
                      <option value="one-minute">一分钟</option>
                      <option value="preliminary">初步初筛</option>
                      <option value="re-screen">重新初筛</option>
                      <option value="gp-fit">GP 匹配</option>
                    </select>
                  </label>
                  <label className="wide">
                    <span>投资 mandate</span>
                    <input
                      aria-label="投资 mandate"
                      value={workflow.mandate}
                      onChange={(event) => onWorkflow({
                        ...workflow,
                        mandate: event.target.value,
                        inputScopeApproved: false,
                      })}
                      placeholder="阶段、行业、地域、票面与排除项"
                    />
                  </label>
                </>
              )}
              <label className="by-scope-approval wide">
                <input
                  type="checkbox"
                  checked={workflow.inputScopeApproved}
                  onChange={(event) => onWorkflow({
                    ...workflow,
                    inputScopeApproved: event.target.checked,
                  })}
                />
                <span>
                  我确认提交时冻结并仅使用当前公司的已授权关联材料来源
                </span>
              </label>
              <p className="wide">
                这是单独选择的内部投研产物，不替代标准 BP 深度分析；如需公开信息，请切换“常规研究”单独执行。输出仅供内部决策支持，评分方法、严重度、投资决定和对外发布仍需相应负责人确认。
              </p>
            </div>
          )}
        </div>
      )}
      <textarea
        aria-label="研究问题"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder={
          compact
            ? "基于当前对象与 BP 证据继续提问"
            : context === "公司"
              ? selectedCompanyId
                ? "输入对这家公司的研究问题"
                : "请先从上方选择已有公司"
              : context === "行业"
                ? selectedIndustryId
                  ? "输入对这个行业或产业链的研究问题"
                  : "请先从上方选择已有行业"
                : "向博源 AI 提问或上传材料"
        }
      />
      <div className="by-composer-toolbar">
        <button className="by-add-file" onClick={onUpload}>
          <Paperclip />
          添加文件
        </button>
        <span className="by-context-disclosure">
          <ShieldCheck />
          使用已授权 BP 与正式知识
        </span>
        <button
          className="by-send"
          aria-label="发送问题"
          disabled={
            busy ||
            !query.trim() ||
            (context === "公司" && !selectedCompanyId) ||
            (context === "行业" && !selectedIndustryId)
          }
          onClick={onSubmit}
        >
          {busy ? <LoaderCircle /> : <ArrowUp />}
        </button>
      </div>
    </div>
  );
}

function ResearchTargetPicker({
  kind,
  items,
  selectedId,
  onSelect,
}: {
  kind: "公司" | "行业";
  items: Array<{ id: string; name: string; detail: string }>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const selected = items.find((item) => item.id === selectedId);
  const visible = items
    .filter((item) => item.name.toLowerCase().includes(filter.toLowerCase()))
    .slice(0, 10);
  return (
    <div className="by-target-picker">
      <button
        className={selected ? "selected" : ""}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {kind === "公司" ? <Building2 /> : <Globe2 />}
        <span>
          <small>{kind === "公司" ? "研究公司" : "研究行业"}</small>
          <strong>{selected?.name || `选择已有${kind}`}</strong>
        </span>
        <ChevronDown />
      </button>
      {open && (
        <div className="by-target-menu">
          <label>
            <Search />
            <input
              autoFocus
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={`搜索已有${kind}`}
            />
          </label>
          <div>
            {visible.map((item) => (
              <button
                className={item.id === selectedId ? "active" : ""}
                key={item.id}
                onClick={() => {
                  onSelect(item.id);
                  setOpen(false);
                  setFilter("");
                }}
              >
                <span>
                  {kind === "公司" ? item.name.slice(0, 1) : <Network />}
                </span>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
                {item.id === selectedId && <Check />}
              </button>
            ))}
            {!visible.length && <p>没有找到匹配的{kind}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusMark({
  status,
  count,
}: {
  status: ResearchTask["status"];
  count: number;
}) {
  if (status === "执行失败")
    return (
      <em className="by-status danger">
        <CircleAlert />
        失败
      </em>
    );
  if (status === "已取消")
    return <em className="by-status warning">已取消</em>;
  if (status === "已完成")
    return (
      <em className="by-status success">
        <Check />
        已完成
      </em>
    );
  if (status === "待用户确认")
    return (
      <em className="by-status warning">
        待确认{count > 0 ? ` ${count}` : ""}
      </em>
    );
  if (count > 0) return <em className="by-status warning">待确认 {count}</em>;
  return (
    <em className="by-status running">
      <Clock3 />
      处理中
    </em>
  );
}

function EvidenceDrawer({
  evidence,
  onClose,
}: {
  evidence: Evidence;
  onClose: () => void;
}) {
  return (
    <div className="by-drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="by-evidence-drawer"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="证据详情"
      >
        <header>
          <div>
            <span>原始材料证据</span>
            <h2>{evidence.fileName}</h2>
          </div>
          <button aria-label="关闭证据" onClick={onClose}>
            <X />
          </button>
        </header>
        <dl>
          <div>
            <dt>来源日期</dt>
            <dd>{evidence.sourceDate}</dd>
          </div>
          <div>
            <dt>权限范围</dt>
            <dd>
              <ShieldCheck />
              {evidence.visibility}
            </dd>
          </div>
          {evidence.page && (
            <div>
              <dt>定位</dt>
              <dd>第 {evidence.page} 页</dd>
            </div>
          )}
        </dl>
        <section>
          <h3>支持结论的原文片段</h3>
          <blockquote>{evidence.excerpt}</blockquote>
        </section>
        <div className="by-drawer-actions">
          {evidence.documentId ? (
            <AuthenticatedDocumentDownload
              className="primary"
              documentId={evidence.documentId}
              fileName={evidence.fileName}
            />
          ) : (
            <span>原始文件不可用，仍可使用上方证据定位与摘录。</span>
          )}
        </div>
      </aside>
    </div>
  );
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近更新";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
