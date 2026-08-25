import { useEffect, useRef, useState } from "react";
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
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type Bootstrap } from "../api";
import type { Company, Evidence, ResearchTask } from "../types";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type ContextType = "材料" | "公司" | "行业";
type ActiveResearch = { task: ResearchTask; company: Company } | null;

export function WorkbenchPage({
  data,
  reload,
}: {
  data: Bootstrap;
  reload: () => void;
}) {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [activeResearch, setActiveResearch] = useState<ActiveResearch>(null);
  const [context, setContext] = useState<ContextType>("材料");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [conversationFilter, setConversationFilter] = useState<"全部" | ContextType>("全部");

  const pending = data.companies.reduce(
    (sum, company) =>
      sum + company.claims.filter((claim) => ["candidate", "disputed"].includes(claim.status)).length,
    0,
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    const scroller = pageRef.current?.querySelector<HTMLElement>(".by-conversation-scroll, .by-workbench-home");
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
      const scroller = pageRef.current?.querySelector(".by-conversation-scroll");
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
    { scope: pageRef, dependencies: [activeResearch?.task.id], revertOnUpdate: true },
  );

  const openTask = (task: ResearchTask) => {
    const company = data.companies.find((item) => item.id === task.companyId) || data.companies[0];
    setActiveResearch({ task, company });
    setQuery("");
    setNotice("");
  };

  const runResearch = async () => {
    if (!query.trim() || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await api.research(query.trim(), activeResearch?.company.id);
      setActiveResearch(result);
      setQuery("");
      reload();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "研究任务创建失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setNotice(`已接收 ${files.length} 份材料，正在安全保存并创建对话`);
    const results = await Promise.allSettled(files.map((file) => api.upload(file)));
    const success = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - success;
    setNotice(failed ? `${success} 份已提交，${failed} 份失败，请检查格式后重试` : `${success} 份材料已保存，后台分析已开始`);
    if (uploadRef.current) uploadRef.current.value = "";
    reload();
  };

  return (
    <div className="by-workbench" ref={pageRef}>
      <ConversationRail
        data={data}
        filter={conversationFilter}
        activeTaskId={activeResearch?.task.id}
        onFilter={setConversationFilter}
        onNew={() => {
          setActiveResearch(null);
          setQuery("");
          setNotice("");
        }}
        onOpen={openTask}
      />

      {!activeResearch ? (
        <section className="by-workbench-home">
          <div className="by-home-center">
            <div className="by-assistant-mark"><Sparkles /></div>
            <h1>今天想研究什么？</h1>
            <p>提交问题或材料，博源 AI 会调用你有权访问的机构知识，并保留完整来源。</p>
            <ResearchComposer
              context={context}
              query={query}
              busy={busy}
              notice={notice}
              onContext={setContext}
              onQuery={setQuery}
              onSubmit={runResearch}
              onUpload={() => uploadRef.current?.click()}
            />
            <input
              ref={uploadRef}
              hidden
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.csv"
              onChange={(event) => void uploadFiles([...(event.target.files || [])])}
            />
            <QuickActions
              onUpload={() => uploadRef.current?.click()}
              onFill={(nextContext, prompt) => {
                setContext(nextContext);
                setQuery(prompt);
              }}
            />
            <RecentTasks data={data} onOpen={openTask} />
            <div className="by-governance-note">
              <ShieldCheck />
              <span>AI 与 Web Search 只生成候选知识，确认后才会进入机构知识库</span>
              <button onClick={() => navigate("/confirmations")}>{pending} 条待确认 <ArrowRight /></button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <ActiveConversation
            research={activeResearch}
            data={data}
            context={context}
            query={query}
            busy={busy}
            notice={notice}
            uploadRef={uploadRef}
            onContext={setContext}
            onQuery={setQuery}
            onSubmit={runResearch}
            onUploadFiles={uploadFiles}
            onEvidence={setSelectedEvidence}
          />
          <TaskRail
            task={activeResearch.task}
            pending={activeResearch.company.claims.filter((claim) => ["candidate", "disputed"].includes(claim.status)).length}
            activeStep={activeStep}
            onStep={setActiveStep}
            onReview={() => navigate("/confirmations")}
          />
        </>
      )}

      {selectedEvidence && (
        <EvidenceDrawer evidence={selectedEvidence} onClose={() => setSelectedEvidence(null)} />
      )}
    </div>
  );
}

function ConversationRail({
  data,
  filter,
  activeTaskId,
  onFilter,
  onNew,
  onOpen,
}: {
  data: Bootstrap;
  filter: "全部" | ContextType;
  activeTaskId?: string;
  onFilter: (filter: "全部" | ContextType) => void;
  onNew: () => void;
  onOpen: (task: ResearchTask) => void;
}) {
  const visibleTasks = data.tasks.filter((task) => {
    if (filter === "全部") return true;
    if (filter === "公司") return Boolean(task.companyId);
    if (filter === "行业") return /行业|产业链/.test(task.query);
    return !task.companyId || /材料|BP|名单/.test(task.query);
  });
  return (
    <aside className="by-conversation-rail" aria-label="研究对话">
      <button className="by-new-conversation" onClick={onNew}><Plus />新建对话</button>
      <label className="by-rail-search"><Search /><input placeholder="搜索对话或来源" /></label>
      <div className="by-rail-filters">
        {(["全部", "材料", "公司", "行业"] as const).map((item) => (
          <button className={filter === item ? "active" : ""} key={item} onClick={() => onFilter(item)}>{item}</button>
        ))}
      </div>
      <div className="by-conversation-list">
        <span>最近对话</span>
        {visibleTasks.map((task) => {
          const company = data.companies.find((item) => item.id === task.companyId);
          const pending = company?.claims.filter((claim) => ["candidate", "disputed"].includes(claim.status)).length || 0;
          return (
            <button className={activeTaskId === task.id ? "active" : ""} key={task.id} onClick={() => onOpen(task)}>
              <FileText />
              <span>
                <strong>{task.query}</strong>
                <small><em>工作台</em>{relativeTime(task.createdAt)}</small>
              </span>
              <StatusMark status={task.status} count={pending} />
            </button>
          );
        })}
      </div>
      <button className="by-view-all"><MessageSquareText />查看全部对话<ChevronRight /></button>
    </aside>
  );
}

function QuickActions({
  onUpload,
  onFill,
}: {
  onUpload: () => void;
  onFill: (context: ContextType, prompt: string) => void;
}) {
  const actions = [
    { icon: FileStack, title: "分析一份材料", detail: "提炼要点、核验事实", action: onUpload },
    { icon: Building2, title: "研究一家公司", detail: "复用材料与历史认知", action: () => onFill("公司", "请输入公司名称和希望了解的问题") },
    { icon: ListChecks, title: "处理公司名单", detail: "批量识别与建立档案", action: () => onFill("材料", "识别并处理这份公司名单") },
    { icon: Globe2, title: "研究一个行业", detail: "材料、公司与产业位置", action: () => onFill("行业", "请输入行业名称和希望研究的范围") },
  ];
  return (
    <div className="by-quick-actions" aria-label="快捷研究任务">
      {actions.map(({ icon: Icon, title, detail, action }) => (
        <button key={title} onClick={action}>
          <Icon />
          <span><strong>{title}</strong><small>{detail}</small></span>
        </button>
      ))}
    </div>
  );
}

function RecentTasks({ data, onOpen }: { data: Bootstrap; onOpen: (task: ResearchTask) => void }) {
  const rows = data.tasks.slice(0, 3);
  return (
    <section className="by-recent-tasks">
      <header><h2>近期任务</h2><button>查看全部<ChevronRight /></button></header>
      <div>
        {rows.map((task) => {
          const company = data.companies.find((item) => item.id === task.companyId);
          const pending = company?.claims.filter((claim) => ["candidate", "disputed"].includes(claim.status)).length || 0;
          const progress = task.steps.length ? Math.round(task.steps.filter((step) => step.status === "done").length / task.steps.length * 100) : 0;
          return <button key={task.id} onClick={() => onOpen(task)}>
            <span className="by-task-kind">{task.companyId ? <Building2 /> : <FileText />}</span>
            <span><strong>{task.query}</strong><small>工作台 · {relativeTime(task.createdAt)}</small></span>
            <span className="by-task-progress"><i style={{ width: `${progress}%` }} />{task.status}</span>
            <StatusMark status={task.status} count={pending} />
            <ChevronRight />
          </button>;
        })}
        {!rows.length && <p className="by-inline-empty">暂无研究任务，从上方输入问题或上传材料开始。</p>}
      </div>
    </section>
  );
}

function ActiveConversation({
  research,
  data,
  context,
  query,
  busy,
  notice,
  uploadRef,
  onContext,
  onQuery,
  onSubmit,
  onUploadFiles,
  onEvidence,
}: {
  research: NonNullable<ActiveResearch>;
  data: Bootstrap;
  context: ContextType;
  query: string;
  busy: boolean;
  notice: string;
  uploadRef: React.RefObject<HTMLInputElement | null>;
  onContext: (context: ContextType) => void;
  onQuery: (query: string) => void;
  onSubmit: () => void;
  onUploadFiles: (files: File[]) => void;
  onEvidence: (evidence: Evidence) => void;
}) {
  const { company, task } = research;
  const evidence = company.evidence;
  const companyName = company.aliases[0] || company.standardName;
  const primaryEvidence = evidence[0];
  const primaryFileName = primaryEvidence?.fileName || `${companyName}研究材料`;
  const industryName = company.positions.map((position) => data.industryNodes.find((node) => node.id === position.nodeId)?.name).find(Boolean);
  const externalClaims = company.claims.filter((claim) => claim.type === "external_view");
  const pendingCount = company.claims.filter((claim) => ["candidate", "disputed"].includes(claim.status)).length;
  return (
    <section className="by-active-conversation">
      <div className="by-conversation-scroll">
        <header className="by-context-bar">
          <span className="by-file-mark"><FileText /></span>
          <div>
            <h1>{primaryFileName}</h1>
            <p>来源：<strong>{primaryEvidence ? "机构材料" : "研究任务"}</strong><span />创建时间：{new Date(task.createdAt).toLocaleString("zh-CN")}<span />公司：{companyName}{industryName && <><span />行业：{industryName}</>}</p>
          </div>
          <span className="by-archive-state"><Check />已自动归档</span>
          <button><ExternalLink />打开原文</button>
          <button><RefreshCw />更换公司</button>
        </header>

        <div className="by-conversation-stream">
          <TimelineItem icon={<FileText />} title="原始材料" state={primaryEvidence ? "已保存" : "等待上传"}>
            <button className="by-file-row" onClick={() => evidence[0] && onEvidence(evidence[0])}>
              <FileText /><span><strong>{primaryFileName}</strong><small>{primaryEvidence ? `${primaryEvidence.sourceDate} · 原始证据` : "尚未关联原始材料"}</small></span><BookOpen />
            </button>
          </TimelineItem>
          <TimelineItem icon={<FileCheck2 />} title="文件解析" state={primaryEvidence ? "已完成" : "等待材料"}>
            <p className="by-process-line">{task.steps.find((step) => /检索|材料|解析/.test(step.name))?.detail || "上传材料后将自动解析正文、表格与图表。"}</p>
          </TimelineItem>
          <TimelineItem icon={<Sparkles />} title="AI 分析" state={task.answer ? "已完成" : "等待生成"} source="AI 候选">
            <article className="by-analysis-card">
              <section>
                <h3>材料摘要</h3>
                <p>{task.answer?.text || company.description || "当前尚未形成分析摘要。补充材料后，系统将生成带有证据引用的候选内容。"}</p>
              </section>
              <section>
                <h3>核心信息</h3>
                <div className="by-analysis-columns">
                  {company.claims.slice(0, 6).map((claim) => (
                    <button key={claim.id} onClick={() => evidence.find((item) => claim.evidenceIds.includes(item.id)) && onEvidence(evidence.find((item) => claim.evidenceIds.includes(item.id))!)}>
                      <span>{claim.category}</span><p>{claim.text}</p><small><FileSearch />{claim.evidenceIds.length} 条证据</small>
                    </button>
                  ))}
                  {!company.claims.length && <p className="by-inline-empty">暂无候选信息，所有结论必须在材料进入后基于证据生成。</p>}
                </div>
              </section>
              <section>
                <h3>风险与待验证</h3>
                <ul>{company.claims.filter((claim) => ["candidate", "disputed"].includes(claim.status)).slice(0, 4).map((claim) => <li key={claim.id}>{claim.text}</li>)}{!pendingCount && <li>暂无待验证事项</li>}</ul>
              </section>
              <button className="by-candidate-entry">{pendingCount} 条候选知识待确认<ChevronRight /></button>
            </article>
          </TimelineItem>
          <TimelineItem icon={<Globe2 />} title="Web Search 核验" state={externalClaims.length ? "已完成" : "暂无外部候选"} source="外部候选">
            <article className="by-web-card">
              {externalClaims.map((claim) => <div key={claim.id}><span>外部来源</span><p>{claim.text}</p><time>{claim.eventTime || "待补充日期"}</time><ExternalLink /></div>)}
              {!externalClaims.length && <p className="by-inline-empty">尚未执行外部信息核验，系统不会生成虚构来源。</p>}
              {externalClaims.some((claim) => claim.status === "disputed") && <button><CircleAlert />发现外部信息与内部材料存在冲突<span>查看详情<ChevronRight /></span></button>}
            </article>
          </TimelineItem>
        </div>
      </div>

      <div className="by-active-composer">
        <ResearchComposer context={context} query={query} busy={busy} notice={notice} compact onContext={onContext} onQuery={onQuery} onSubmit={onSubmit} onUpload={() => uploadRef.current?.click()} />
        <input ref={uploadRef} hidden type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" onChange={(event) => void onUploadFiles([...(event.target.files || [])])} />
      </div>
    </section>
  );
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
        <header><h2>{title}{source && <em>{source}</em>}</h2><span><Check />{state}</span></header>
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
  const steps = task.steps.map((step) => ({ name: step.name, detail: step.detail, status: step.status }));
  if (pending > 0 && !steps.some((step) => step.name.includes("确认"))) steps.push({ name: "候选知识确认", detail: `${pending} 项等待人工判断`, status: "needs-review" });
  return (
    <aside className="by-task-rail">
      <div className="by-task-rail-inner">
        <h2>当前任务进度</h2>
        <div className="by-step-accordion">
          {steps.map((step, index) => (
            <button className={`${activeStep === index ? "active" : ""} ${step.status === "done" ? "done" : "pending"}`} key={`${step.name}-${index}`} onClick={() => onStep(index)}>
              <span>{step.status === "done" ? <Check /> : step.name.includes("确认") ? pending : <Clock3 />}</span>
              <strong>{step.name}</strong>
              <time>{step.status === "done" ? "已完成" : step.status === "running" ? "进行中" : "待处理"}</time>
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
        <button className="by-task-detail"><ListChecks />查看执行详情</button>
      </div>
    </aside>
  );
}

function ResearchComposer({
  context,
  query,
  busy,
  notice,
  compact = false,
  onContext,
  onQuery,
  onSubmit,
  onUpload,
}: {
  context: ContextType;
  query: string;
  busy: boolean;
  notice: string;
  compact?: boolean;
  onContext: (context: ContextType) => void;
  onQuery: (query: string) => void;
  onSubmit: () => void;
  onUpload: () => void;
}) {
  return (
    <div className={`by-composer ${compact ? "compact" : ""}`}>
      {notice && <div className="by-composer-notice">{notice}</div>}
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
        placeholder={compact ? "基于当前材料与外部信息继续提问…" : "向博源 AI 提问或上传材料"}
      />
      <div className="by-composer-toolbar">
        <div className="by-context-switch">
          {(["材料", "公司", "行业"] as const).map((type) => <button className={context === type ? "active" : ""} key={type} onClick={() => onContext(type)}>{type}</button>)}
        </div>
        <button className="by-add-file" onClick={onUpload}><Paperclip />添加文件</button>
        {compact && <span className="by-context-disclosure"><ShieldCheck />将使用：当前材料 + 已确认知识</span>}
        <button className="by-send" aria-label="发送问题" disabled={busy || !query.trim()} onClick={onSubmit}>{busy ? <LoaderCircle /> : <ArrowUp />}</button>
      </div>
    </div>
  );
}

function StatusMark({ status, count }: { status: ResearchTask["status"]; count: number }) {
  if (status === "执行失败") return <em className="by-status danger"><CircleAlert />失败</em>;
  if (status === "已完成") return <em className="by-status success"><Check />已完成</em>;
  if (count > 0) return <em className="by-status warning">待确认 {count}</em>;
  return <em className="by-status running"><Clock3 />处理中</em>;
}

function EvidenceDrawer({ evidence, onClose }: { evidence: Evidence; onClose: () => void }) {
  return (
    <div className="by-drawer-backdrop" onMouseDown={onClose}>
      <aside className="by-evidence-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="证据详情">
        <header><div><span>原始材料证据</span><h2>{evidence.fileName}</h2></div><button aria-label="关闭证据" onClick={onClose}><X /></button></header>
        <dl><div><dt>来源日期</dt><dd>{evidence.sourceDate}</dd></div><div><dt>权限范围</dt><dd><ShieldCheck />{evidence.visibility}</dd></div>{evidence.page && <div><dt>定位</dt><dd>第 {evidence.page} 页</dd></div>}</dl>
        <section><h3>支持结论的原文片段</h3><blockquote>{evidence.excerpt}</blockquote></section>
        <div className="by-drawer-actions"><button><CircleAlert />标记证据不支持</button><button className="primary"><ExternalLink />打开原文</button></div>
      </aside>
    </div>
  );
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近更新";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
