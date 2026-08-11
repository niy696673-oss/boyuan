import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Bot,
  BookOpen,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Database,
  FileSearch,
  FileText,
  FolderClock,
  History,
  LayoutDashboard,
  LockKeyhole,
  MessageSquareText,
  Network,
  PanelRight,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  api,
  ApiError,
  type Bootstrap,
  type IndustryContext,
  setApiUser,
} from "./api";
import type {
  AuditEvent,
  Claim,
  Company,
  DocumentRecord,
  EntityCandidate,
  Evidence,
  IndustryNode,
  ResearchTask,
} from "./types";

const claimLabel: Record<string, string> = {
  verified_fact: "已确认事实",
  company_statement: "企业表述",
  user_view: "机构观点",
  external_view: "外部观点",
  ai_inference: "AI 推断",
};
const statusLabel: Record<string, string> = {
  confirmed: "已确认",
  candidate: "待确认",
  disputed: "有冲突",
  superseded: "已更新",
  expired: "已过期",
  rejected: "已否定",
};

gsap.registerPlugin(ScrollTrigger, useGSAP);

function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const load = () =>
    api
      .bootstrap()
      .then((value) => {
        setData(value);
        setError("");
        setAuthRequired(false);
      })
      .catch((e) => {
        setError(e.message);
        setAuthRequired(e instanceof ApiError && e.status === 401);
      });
  useEffect(() => {
    void load();
  }, []);
  if (authRequired) return <Login onSuccess={load} />;
  if (error)
    return (
      <div className="center-state">
        <CircleAlert />
        {error}
        <button onClick={load}>重试</button>
      </div>
    );
  if (!data)
    return (
      <div className="center-state">
        <span className="loader" />
        正在加载机构知识...
      </div>
    );
  return <Shell data={data} reload={load} />;
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("admin@boyuan.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <main className="login-page">
      <form
        className="login-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          setError("");
          try {
            await api.login(email, password);
            onSuccess();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "登录失败");
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="brand-mark">博</div>
        <span className="eyebrow">SECURE RESEARCH WORKSPACE</span>
        <h1>登录博源 AI 研究工作台</h1>
        <p>使用机构账号访问获得授权的项目、资料与模型。</p>
        <label>
          邮箱
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="primary" disabled={loading}>
          {loading ? "验证中…" : "安全登录"}
        </button>
      </form>
    </main>
  );
}

function Shell({ data, reload }: { data: Bootstrap; reload: () => void }) {
  const [userOpen, setUserOpen] = useState(false);
  const switchUser = (id: string) => {
    setApiUser(id);
    setUserOpen(false);
    reload();
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-content">
        跳至主要内容
      </a>
      <MotionDirector />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">博</div>
          <div>
            <strong>博源投资</strong>
            <span>AI 研究工作台</span>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>
            <LayoutDashboard />
            研究首页
          </NavLink>
          <NavLink to="/companies">
            <Building2 />
            公司认知
          </NavLink>
          <NavLink to="/industry">
            <Network />
            商业航天产业链
          </NavLink>
          <NavLink to="/tasks">
            <FolderClock />
            研究任务
          </NavLink>
          {["knowledge_admin", "system_admin"].includes(data.user.role) && (
            <NavLink to="/admin">
              <Settings />
              知识管理
            </NavLink>
          )}
        </nav>
        <div className="source-card">
          <div>
            <Database />
            内置知识源
          </div>
          <strong>商业航天全景图谱</strong>
          <span>5 个一级板块 · 18 个演示节点</span>
          <em>来源图谱 · 待持续核验</em>
        </div>
        <div className="user-switch" onClick={() => setUserOpen(!userOpen)}>
          <div className="avatar">{data.user.name[0]}</div>
          <div>
            <strong>{data.user.name}</strong>
            <span>{roleName(data.user.role)}</span>
          </div>
          <ChevronRight />
          {userOpen && (
            <div className="user-menu">
              {data.users.map((u) => (
                <button key={u.id} onClick={() => switchUser(u.id)}>
                  <span>{u.name}</span>
                  <small>{roleName(u.role)}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
      <main className="main" id="workspace-content">
        <Routes>
          <Route path="/" element={<Workspace data={data} reload={reload} />} />
          <Route path="/companies" element={<Companies data={data} />} />
          <Route
            path="/companies/:id"
            element={<CompanyPage data={data} reload={reload} />}
          />
          <Route
            path="/industry"
            element={<Industry data={data} reload={reload} />}
          />
          <Route
            path="/tasks"
            element={<Tasks data={data} reload={reload} />}
          />
          <Route
            path="/admin"
            element={<Admin data={data} reload={reload} />}
          />
        </Routes>
      </main>
    </div>
  );
}

function MotionDirector() {
  const location = useLocation();
  useGSAP(
    () => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduceMotion) return;

      const headers = gsap.utils.toArray<HTMLElement>(
        ".page > :is(.page-title,.topbar,.company-header)",
      );
      if (headers.length)
        gsap.fromTo(
          headers,
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
        );
      const surfaces = gsap.utils.toArray<HTMLElement>(
        ".page > :is(.hero-input,.toolbar,.source-banner,.admin-metrics)",
      );
      if (surfaces.length)
        gsap.fromTo(
          surfaces,
          { opacity: 0, y: 30, scale: 0.985 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.9,
            delay: 0.08,
            ease: "power3.out",
          },
        );

      gsap.utils
        .toArray<HTMLElement>(
          ".section-card, .company-list article, .task-table, .signal-stage",
        )
        .forEach((element) => {
          gsap.fromTo(
            element,
            { opacity: 0, y: 44, scale: 0.97 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.75,
              ease: "power3.out",
              scrollTrigger: {
                trigger: element,
                start: "top 88%",
                toggleActions: "play none none reverse",
              },
            },
          );
        });

      const media = gsap.matchMedia();
      media.add("(min-width: 1100px)", () => {
        const panel = document.querySelector<HTMLElement>(".workflow-panel");
        const layout = document.querySelector<HTMLElement>(".company-layout");
        if (panel && layout) {
          ScrollTrigger.create({
            trigger: layout,
            start: "top 112px",
            end: "bottom bottom",
            pin: panel,
            pinSpacing: false,
          });
        }

        const cards = gsap.utils.toArray<HTMLElement>(".claim-list article");
        cards.forEach((card, index) => {
          gsap.fromTo(
            card,
            { y: 48 + index * 10, scale: 0.94, opacity: 0.35 },
            {
              y: 0,
              scale: 1,
              opacity: 1,
              ease: "none",
              scrollTrigger: {
                trigger: card,
                start: "top 88%",
                end: "top 52%",
                scrub: 0.7,
              },
            },
          );
        });
      });
      return () => media.revert();
    },
    { dependencies: [location.pathname], revertOnUpdate: true },
  );
  return null;
}

function Workspace({ data, reload }: { data: Bootstrap; reload: () => void }) {
  const navigate = useNavigate();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState("");
  const [turns, setTurns] = useState<
    Array<{ id: string; query: string; task: ResearchTask; company: Company }>
  >([]);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(
    null,
  );
  const [entityChoices, setEntityChoices] = useState<
    Array<{ id: string; standardName: string; reason: string }>
  >([]);
  const run = async (companyId?: string) => {
    if (!query.trim()) return;
    const submittedQuery = query.trim();
    setBusy(true);
    setEntityChoices([]);
    setUploadResult("");
    try {
      const r = await api.research(submittedQuery, companyId);
      setTurns((current) => [
        ...current,
        {
          id: r.task.id,
          query: submittedQuery,
          task: r.task,
          company: r.company,
        },
      ]);
      setQuery("");
      reload();
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.payload.code === "ENTITY_AMBIGUOUS"
      )
        setEntityChoices(
          error.payload.candidates as Array<{
            id: string;
            standardName: string;
            reason: string;
          }>,
        );
      else
        setUploadResult(
          error instanceof Error ? error.message : "研究任务创建失败",
        );
    } finally {
      setBusy(false);
    }
  };
  const latestTurn = turns.at(-1);
  const activeCompany = latestTurn?.company || data.companies[0];
  const positionNames = activeCompany.positions
    .filter((position) => position.status !== "rejected")
    .map(
      (position) =>
        data.industryNodes.find((node) => node.id === position.nodeId)?.name ||
        position.nodeId,
    );
  const openTask = (task: ResearchTask) => {
    const company = data.companies.find((item) => item.id === task.companyId);
    if (!company || !task.answer) return;
    setTurns([{ id: task.id, query: task.query, task, company }]);
    setSelectedEvidence(null);
  };
  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploadResult(`正在上传并排队解析 ${files.length} 份资料...`);
    const results = await Promise.allSettled(
      files.map((file) => api.upload(file)),
    );
    const success = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) =>
        result.reason instanceof Error ? result.reason.message : "上传失败",
      );
    setUploadResult(
      failures.length
        ? `${success} 份资料已提交，${failures.length} 份失败：${failures.join("；")}`
        : `${success} 份资料已提交，正在后台解析`,
    );
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    reload();
  };
  return (
    <div className="workspace conversation-workspace">
      <header className="conversation-header">
        <div>
          <h1>研究问答</h1>
          <p>直接提问，系统基于当前权限内的资料回答并标注引用。</p>
        </div>
        <div className="conversation-status">
          <ShieldCheck />
          <div>
            <strong>权限内检索</strong>
            <span>
              {data.settings.externalModelsEnabled
                ? "DeepSeek 已连接"
                : "仅使用内部模型"}
            </span>
          </div>
        </div>
      </header>
      <div className="conversation-layout">
        <section className="chat-surface" aria-label="研究对话">
          <div className="chat-scroll">
            {!turns.length && (
              <div className="chat-empty">
                <div className="chat-empty-mark">
                  <MessageSquareText />
                </div>
                <h2>问一个具体问题</h2>
                <p>
                  我会先识别公司，再检索内部资料和产业链关系，最后给出带引用的回答。
                </p>
                <div className="prompt-grid">
                  {[
                    "银河航天的核心业务是什么？",
                    "蓝箭航天的技术路线有哪些证据？",
                    "银河航天处于产业链什么位置？",
                  ].map((prompt) => (
                    <button key={prompt} onClick={() => setQuery(prompt)}>
                      {prompt}
                      <ArrowRight />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn) => (
              <article className="conversation-turn" key={turn.id}>
                <div className="user-question">
                  <span>{data.user.name.slice(0, 1)}</span>
                  <p>{turn.query}</p>
                </div>
                <div className="assistant-answer">
                  <div className="assistant-mark">
                    <Bot />
                  </div>
                  <div className="answer-body">
                    <div className="answer-meta">
                      <strong>博源研究助手</strong>
                      <span>{turn.task.answer?.model || "证据检索"}</span>
                    </div>
                    <AnswerWithCitations
                      task={turn.task}
                      company={turn.company}
                      onEvidence={setSelectedEvidence}
                    />
                    <div className="answer-trace">
                      <span>
                        <FileSearch />
                        命中 {turn.task.retrieval?.hitCount || 0} 条证据
                      </span>
                      <span>
                        <BookOpen />
                        有效引用 {turn.task.answer?.citationCount || 0} 条
                      </span>
                      <button onClick={() => navigate(`/tasks`)}>
                        查看研究过程
                        <ChevronRight />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
            {busy && (
              <div className="answer-loading" aria-live="polite">
                <span className="assistant-mark">
                  <Bot />
                </span>
                <div>
                  <i />
                  <i />
                  <i />
                  <p>正在识别主体、检索证据并生成回答...</p>
                </div>
              </div>
            )}
          </div>
          <div className="chat-composer-wrap">
            {uploadResult && (
              <div className="composer-message">{uploadResult}</div>
            )}
            {entityChoices.length > 0 && (
              <div className="entity-choices compact-choices">
                <strong>请选择正确的公司主体</strong>
                {entityChoices.map((choice) => (
                  <button key={choice.id} onClick={() => run(choice.id)}>
                    <span>{choice.standardName}</span>
                    <small>{choice.reason}</small>
                    <ChevronRight />
                  </button>
                ))}
              </div>
            )}
            <div className="chat-composer">
              <textarea
                aria-label="研究问题"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void run(latestTurn?.company.id);
                  }
                }}
                placeholder={
                  latestTurn
                    ? `继续追问 ${latestTurn.company.aliases[0] || latestTurn.company.standardName}`
                    : "输入公司名和你想了解的问题"
                }
              />
              <div className="chat-composer-actions">
                <button
                  type="button"
                  className="composer-upload"
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <Upload />
                  上传资料
                </button>
                <input
                  ref={uploadInputRef}
                  className="composer-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md,.csv"
                  onChange={(event) =>
                    void uploadFiles([...(event.target.files || [])])
                  }
                />
                <span>Enter 发送，Shift + Enter 换行</span>
                <button
                  aria-label="发送问题"
                  disabled={busy || !query.trim()}
                  onClick={() => run(latestTurn?.company.id)}
                >
                  <Send />
                </button>
              </div>
            </div>
          </div>
        </section>
        <aside className="cognition-rail" aria-label="公司认知与研究历史">
          <section className="cognition-summary">
            <div className="cognition-title">
              <div className="company-logo">
                {activeCompany.standardName[0]}
              </div>
              <div>
                <span>{activeCompany.cognitionStatus}</span>
                <h2>
                  {activeCompany.aliases[0] || activeCompany.standardName}
                </h2>
              </div>
            </div>
            <p>{activeCompany.description}</p>
            <div className="cognition-stats">
              <span>
                <strong>{activeCompany.claims.length}</strong>知识陈述
              </span>
              <span>
                <strong>{activeCompany.evidence.length}</strong>可见证据
              </span>
              <span>
                <strong>{positionNames.length}</strong>产业位置
              </span>
            </div>
            <div className="cognition-block">
              <h3>产业位置</h3>
              <div className="position-chips">
                {positionNames.length ? (
                  positionNames.map((name) => <span key={name}>{name}</span>)
                ) : (
                  <em>等待识别</em>
                )}
              </div>
            </div>
            <div className="cognition-block">
              <h3>关键认知</h3>
              {activeCompany.claims.slice(0, 3).map((claim) => (
                <div className="rail-claim" key={claim.id}>
                  <span>{claim.category}</span>
                  <p>{claim.text}</p>
                </div>
              ))}
            </div>
            {selectedEvidence && (
              <div className="selected-evidence">
                <div>
                  <FileText />
                  <strong>引用原文</strong>
                  <button onClick={() => setSelectedEvidence(null)}>
                    <X />
                  </button>
                </div>
                <span>{selectedEvidence.fileName}</span>
                <blockquote>{selectedEvidence.excerpt}</blockquote>
                <button
                  onClick={async () =>
                    setSelectedEvidence(
                      await api.viewEvidence(selectedEvidence.id),
                    )
                  }
                >
                  核验证据权限与原文
                </button>
              </div>
            )}
            <button
              className="open-cognition"
              onClick={() => navigate(`/companies/${activeCompany.id}`)}
            >
              打开完整公司认知
              <ArrowRight />
            </button>
          </section>
          <section className="rail-history">
            <div className="rail-section-head">
              <h3>研究历史</h3>
              <button onClick={() => navigate("/tasks")}>全部</button>
            </div>
            {data.tasks.slice(0, 4).map((task) => (
              <button
                className="rail-history-item"
                key={task.id}
                disabled={!task.answer}
                onClick={() => openTask(task)}
              >
                <History />
                <span>
                  <strong>{task.query}</strong>
                  <small>
                    {new Date(task.createdAt).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </span>
              </button>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

function AnswerWithCitations({
  task,
  company,
  onEvidence,
}: {
  task: ResearchTask;
  company: Company;
  onEvidence: (evidence: Evidence) => void;
}) {
  const text = task.answer?.text || "当前没有可展示的回答。";
  const renderInline = (line: string, lineIndex: number) =>
    line
      .replace(/\*\*/g, "")
      .split(/([\[【]证据\s*\d+[\]】])/g)
      .map((part, index) => {
        const match = part.match(/[\[【]证据\s*(\d+)[\]】]/);
        if (!match)
          return <span key={`${lineIndex}-${part}-${index}`}>{part}</span>;
        const evidenceId = task.retrieval?.topEvidenceIds[Number(match[1]) - 1];
        const evidence = company.evidence.find(
          (item) => item.id === evidenceId,
        );
        return evidence ? (
          <button
            className="inline-citation"
            key={`${lineIndex}-${part}-${index}`}
            onClick={() => onEvidence(evidence)}
            title={evidence.fileName}
          >
            {match[1]}
          </button>
        ) : (
          <span
            className="inline-citation unavailable"
            key={`${lineIndex}-${part}-${index}`}
          >
            {match[1]}
          </span>
        );
      });
  return (
    <div className="answer-copy">
      {text.split(/\n+/).map((rawLine, lineIndex) => {
        const line = rawLine.trim();
        if (!line) return null;
        const heading = line.match(/^#{1,4}\s+(.+)/)?.[1];
        const bullet = line.match(/^[-*•]\s+(.+)/)?.[1];
        if (heading)
          return <h3 key={lineIndex}>{renderInline(heading, lineIndex)}</h3>;
        if (bullet)
          return (
            <p className="answer-bullet" key={lineIndex}>
              {renderInline(bullet, lineIndex)}
            </p>
          );
        return <p key={lineIndex}>{renderInline(line, lineIndex)}</p>;
      })}
    </div>
  );
}

function SignalCarousel() {
  const signals = [
    {
      quote: "把零散 BP、访谈和研究笔记，压缩成一条可追溯的认知链。",
      title: "证据先于结论",
      note: "每条知识都能回到原文、日期与权限边界。",
    },
    {
      quote: "公司不再是一份项目文件，而是持续演进的长期研究对象。",
      title: "知识持续复用",
      note: "修正后的事实、位置和观点会进入下一次研究任务。",
    },
    {
      quote: "沿产业位置向上下游展开，把单点判断放进完整商业语境。",
      title: "产业链驱动发现",
      note: "从公司名定位节点，再关联供给、设施与应用资料。",
    },
  ];
  const [active, setActive] = useState(0);
  const signal = signals[active];
  return (
    <section className="signal-stage" aria-label="机构研究方法">
      <div className="signal-visual" aria-hidden="true">
        <span>{String(active + 1).padStart(2, "0")}</span>
      </div>
      <div className="signal-copy">
        <p>“{signal.quote}”</p>
        <div>
          <strong>{signal.title}</strong>
          <span>{signal.note}</span>
        </div>
        <nav aria-label="切换研究方法">
          {signals.map((item, index) => (
            <button
              key={item.title}
              className={index === active ? "active" : ""}
              onClick={() => setActive(index)}
              aria-label={`查看${item.title}`}
            >
              {String(index + 1).padStart(2, "0")}
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}

function Companies({ data }: { data: Bootstrap }) {
  const [q, setQ] = useState("");
  const [importResult, setImportResult] = useState<
    Array<{ rawName: string; status: string; companyName?: string }>
  >([]);
  const navigate = useNavigate();
  const list = data.companies.filter((c) =>
    [c.standardName, ...c.aliases].some((x) =>
      x.toLowerCase().includes(q.toLowerCase()),
    ),
  );
  return (
    <div className="page">
      <PageTitle
        eyebrow="机构公司底库"
        title="公司认知"
        subtitle="公司是长期认知主体，项目只是某个时间点的一次投资机会。"
      />
      <div className="toolbar">
        <label className="search">
          <Search />
          <input
            placeholder="搜索公司、简称或英文名"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="secondary upload-label">
          <Upload />
          导入公司名单
          <input
            type="file"
            accept=".csv,.txt"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = await api.importCompanyList(f);
              setImportResult(r.result);
            }}
          />
        </label>
      </div>
      {importResult.length > 0 && (
        <div className="import-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">名单处理结果</span>
              <h2>共识别 {importResult.length} 条记录</h2>
            </div>
            <button
              className="close-inline"
              onClick={() => setImportResult([])}
            >
              <X />
            </button>
          </div>
          <div className="import-results">
            {importResult.map((r, i) => (
              <div key={`${r.rawName}-${i}`}>
                <strong>{r.rawName}</strong>
                <span className={r.status}>
                  {r.status === "existing"
                    ? `已存在 · ${r.companyName}`
                    : r.status === "needs-review"
                      ? "同名或模糊匹配 · 待确认"
                      : "新公司 · 待建立认知"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="company-list">
        {list.map((c) => (
          <article key={c.id} onClick={() => navigate(`/companies/${c.id}`)}>
            <div className="company-logo">{c.standardName.slice(0, 2)}</div>
            <div className="company-main">
              <div>
                <h3>{c.standardName}</h3>
                <span className="status-tag">{c.attentionStatus}</span>
              </div>
              <p>{c.description}</p>
              <div className="company-meta">
                <span>{c.aliases.join(" · ")}</span>
                <span>{c.evidence.length} 条可见证据</span>
                <span>
                  更新于 {new Date(c.updatedAt).toLocaleDateString("zh-CN")}
                </span>
              </div>
            </div>
            <ChevronRight />
          </article>
        ))}
      </div>
    </div>
  );
}

function CompanyPage({
  data,
  reload,
}: {
  data: Bootstrap;
  reload: () => void;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const company = data.companies.find((c) => c.id === id) || data.companies[0];
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [edit, setEdit] = useState<Claim | null>(null);
  const [task, setTask] = useState<ResearchTask | null>(
    data.tasks.find((t) => t.companyId === company.id) || null,
  );
  const [industryContext, setIndustryContext] =
    useState<IndustryContext | null>(null);
  const [showPositionHistory, setShowPositionHistory] = useState(false);
  const [positionNode, setPositionNode] = useState("");
  const [positionReason, setPositionReason] = useState("");
  const completeness = Math.min(
    100,
    Math.round(
      (company.evidence.length ? 35 : 0) +
        (company.claims.length ? 35 : 0) +
        (company.positions.some((p) => p.status === "confirmed") ? 22 : 0),
    ),
  );
  useEffect(() => {
    void api.industryContext(company.id).then(setIndustryContext);
  }, [company.id]);
  useEffect(() => {
    setTask(data.tasks.find((t) => t.companyId === company.id) || null);
  }, [company.id, data.tasks]);
  const node = (id: string) =>
    data.industryNodes.find((n) => n.id === id)?.name || id;
  const correct = async (text: string, reason: string) => {
    if (!edit) return;
    await api.correctClaim(edit.id, text, reason);
    setEdit(null);
    reload();
  };
  return (
    <div className="page company-page">
      <div className="company-header">
        <div>
          <button className="back" onClick={() => history.back()}>
            ← 返回公司底库
          </button>
          <span className="eyebrow">公司认知包</span>
          <h1>{company.standardName}</h1>
          <p>
            {company.aliases.join(" · ")}
            {company.englishName ? ` · ${company.englishName}` : ""}
          </p>
        </div>
        <div className="header-actions">
          <select
            className="attention-select"
            value={company.attentionStatus}
            onChange={async (e) => {
              await api.attention(company.id, e.target.value);
              reload();
            }}
          >
            {[
              "机构未关注",
              "个人关注",
              "推荐团队",
              "持续跟踪",
              "储备项目",
              "正式项目",
              "暂不推进",
              "持续观察",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <button
            className="secondary"
            onClick={async () => {
              const payload = await api.exportCompany(company.id);
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(payload, null, 2)], {
                  type: "application/json",
                }),
              );
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `${company.aliases[0] || company.standardName}_认知包.json`;
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            导出认知包
            <FileSearch />
          </button>
          <button
            className="primary"
            onClick={async () => {
              const r = await api.research(
                `继续研究${company.aliases[0]}`,
                company.id,
              );
              setTask(r.task);
              reload();
            }}
          >
            继续研究
            <Sparkles />
          </button>
        </div>
      </div>
      <div className="company-layout">
        <div className="content-column">
          <section className="summary-card">
            <div className="confidence-ring">
              <strong>{completeness}</strong>
              <span>认知完整度</span>
            </div>
            <div>
              <h2>机构当前认知</h2>
              <p>{company.description}</p>
              <div className="summary-tags">
                <span>
                  <BookOpen />
                  {company.evidence.length} 条可见证据
                </span>
                <span>
                  <History />
                  {
                    company.claims.filter((x) => x.status === "disputed").length
                  }{" "}
                  条冲突
                </span>
                <span>
                  <Activity />
                  {company.cognitionStatus}
                </span>
              </div>
            </div>
          </section>
          <Section title="产业坐标" eyebrow="来源与状态分层">
            <div className="position-toolbar">
              <button
                className="secondary"
                onClick={() => setShowPositionHistory(!showPositionHistory)}
              >
                <History />
                {showPositionHistory ? "隐藏历史位置" : "查看历史位置"}
              </button>
            </div>
            <div className="position-list">
              {company.positions
                .filter((p) => showPositionHistory || p.status !== "rejected")
                .map((p, index) => (
                  <div
                    key={`${p.nodeId}-${index}`}
                    className={
                      p.status === "rejected" ? "position-history" : ""
                    }
                  >
                    <div className={`position-source ${p.source}`}>
                      {p.source === "source_map"
                        ? "来源图谱"
                        : p.source === "manual"
                          ? "人工确认"
                          : p.source === "internal_evidence"
                            ? "内部证据"
                            : "AI 推荐"}
                    </div>
                    <div>
                      <strong>{node(p.nodeId)}</strong>
                      <span>
                        {p.positionType === "primary" ? "主要位置" : "关联位置"}{" "}
                        · 置信度 {Math.round(p.confidence * 100)}% · 来源日期{" "}
                        {p.sourceDate}
                      </span>
                      {p.reason && <small>{p.reason}</small>}
                    </div>
                    <em className={p.status}>
                      {p.status === "confirmed"
                        ? "已确认"
                        : p.status === "rejected"
                          ? "历史版本"
                          : "待核验"}
                    </em>
                  </div>
                ))}
            </div>
            <div className="position-editor">
              <select
                value={positionNode}
                onChange={(e) => setPositionNode(e.target.value)}
              >
                <option value="">选择修正后的主要位置</option>
                {data.industryNodes
                  .filter((n) => n.level === 2)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
              </select>
              <input
                value={positionReason}
                onChange={(e) => setPositionReason(e.target.value)}
                placeholder="填写修正原因"
              />
              <button
                className="primary"
                disabled={!positionNode || positionReason.length < 2}
                onClick={async () => {
                  await api.changePosition(
                    company.id,
                    positionNode,
                    positionReason,
                  );
                  setPositionNode("");
                  setPositionReason("");
                  reload();
                }}
              >
                保存位置版本
              </button>
            </div>
          </Section>
          {industryContext && (
            <IndustryContextSection
              context={industryContext}
              navigate={navigate}
            />
          )}
          <Section title="关键知识" eyebrow="证据、版本与冲突">
            <div className="claim-list">
              {company.claims.map((c) => (
                <article
                  key={c.id}
                  className={c.status === "disputed" ? "is-disputed" : ""}
                >
                  <div className="claim-top">
                    <span className={`claim-type ${c.type}`}>
                      {claimLabel[c.type]}
                    </span>
                    <span className={`claim-status ${c.status}`}>
                      {statusLabel[c.status]}
                    </span>
                    <small>v{c.version}</small>
                  </div>
                  <h3>{c.category}</h3>
                  <p>{c.text}</p>
                  {c.status === "disputed" && (
                    <div className="conflict-note">
                      <CircleAlert />
                      存在相互冲突的来源，系统并列保留，未自动选择结论。
                    </div>
                  )}
                  {c.history && c.history.length > 0 && (
                    <details className="version-history">
                      <summary>查看 {c.history.length} 个历史版本</summary>
                      {[...c.history].reverse().map((h, i) => (
                        <div key={`${h.version}-${i}`}>
                          <strong>
                            v{h.version} · {statusLabel[h.status]}
                          </strong>
                          <span>{h.text}</span>
                          <small>
                            {h.reason} ·{" "}
                            {new Date(h.changedAt).toLocaleString("zh-CN")}
                          </small>
                        </div>
                      ))}
                    </details>
                  )}
                  <div className="claim-bottom">
                    {c.evidenceIds.length ? (
                      <button
                        onClick={async () => {
                          const row = company.evidence.find((e) =>
                            c.evidenceIds.includes(e.id),
                          );
                          if (row) setEvidence(await api.viewEvidence(row.id));
                        }}
                      >
                        <FileSearch />
                        查看 {c.evidenceIds.length} 条证据
                      </button>
                    ) : (
                      <span className="no-evidence">
                        <CircleAlert />
                        无证据推断
                      </span>
                    )}
                    <button onClick={() => setEdit(c)}>确认 / 修正</button>
                    <span>置信度 {Math.round(c.confidence * 100)}%</span>
                  </div>
                </article>
              ))}
            </div>
          </Section>
          <Section title="信息缺口" eyebrow="下一步建议">
            <div className="gap-list">
              <div>
                <span>01</span>
                <p>
                  <strong>商业订单兑现</strong>
                  核验在手订单、发射排期及收入确认口径。
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  <strong>规模化制造</strong>
                  补充单星成本、年产能及关键部件自制率。
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  <strong>产业链位置</strong>
                  确认卫星互联网属于当前业务还是长期规划。
                </p>
              </div>
            </div>
          </Section>
        </div>
        <WorkflowPanel task={task} company={company} reload={reload} />
      </div>
      {evidence && (
        <EvidenceDrawer evidence={evidence} onClose={() => setEvidence(null)} />
      )}
      {edit && (
        <CorrectionModal
          claim={edit}
          onClose={() => setEdit(null)}
          onSave={correct}
        />
      )}
    </div>
  );
}

function IndustryContextSection({
  context,
  navigate,
}: {
  context: IndustryContext;
  navigate: (path: string) => void;
}) {
  const Relation = ({
    title,
    items,
  }: {
    title: string;
    items: IndustryContext["upstream"];
  }) => (
    <div className="relation-column">
      <h3>
        {title}
        <span>{items.length} 家关联公司</span>
      </h3>
      {items.length ? (
        items.map((r) => (
          <article key={`${r.edge.id}-${r.company.id}`}>
            <div className="relation-flow">
              <span>{r.node?.name}</span>
              <ArrowRight />
              <strong>{r.company.aliases[0] || r.company.standardName}</strong>
            </div>
            <p>{r.edge.label}</p>
            <div className="related-docs">
              {r.documents.map((d) => (
                <div key={`${r.company.id}-${d.id}`}>
                  <FileSearch />
                  <div>
                    <strong>{d.fileName}</strong>
                    <span>{d.excerpt}</span>
                  </div>
                  <em>Demo 模拟资料</em>
                </div>
              ))}
            </div>
            <button onClick={() => navigate(`/companies/${r.company.id}`)}>
              打开关联公司
              <ChevronRight />
            </button>
          </article>
        ))
      ) : (
        <div className="empty-relation">当前资料中尚未找到可核验的关联公司</div>
      )}
    </div>
  );
  return (
    <Section eyebrow="公司名 → 产业位置 → 关联资料" title="上下游知识关联">
      <div className="chain-center">
        <span>当前公司所在环节</span>
        {context.centerNodes.map((n) => (
          <strong key={n.id}>{n.name}</strong>
        ))}
      </div>
      <div className="relation-grid">
        <Relation title="上游供给与能力" items={context.upstream} />
        <Relation title="下游设施与应用" items={context.downstream} />
      </div>
      <div className="simulation-note">
        <CircleAlert />
        <span>
          本区关联公司与资料用于 Demo
          验证，均已标记为模拟数据；正式上线前需要使用真实内外部证据重新核验。
        </span>
      </div>
    </Section>
  );
}

function WorkflowPanel({
  task,
  company,
  reload,
}: {
  task: ResearchTask | null;
  company: Company;
  reload: () => void;
}) {
  if (!task)
    return (
      <aside className="workflow-panel">
        <span className="eyebrow">工作流</span>
        <h2>尚未开始任务</h2>
        <p>发起研究后，这里会展示每个步骤使用的资料和结果。</p>
      </aside>
    );
  return (
    <aside className="workflow-panel">
      <div className="workflow-title">
        <div>
          <span className="eyebrow">当前工作流</span>
          <h2>{task.status}</h2>
        </div>
        <PanelRight />
      </div>
      <p className="task-query">“{task.query}”</p>
      {task.steps.map((s, i) => (
        <div className="workflow-step" key={s.name}>
          <div className={`step-index ${s.status}`}>
            {s.status === "done" ? <Check /> : i + 1}
          </div>
          <div>
            <strong>{s.name}</strong>
            <p>{s.detail}</p>
          </div>
        </div>
      ))}
      <div className="workflow-note">
        <ShieldCheck />
        <span>
          本任务仅使用当前用户有权限访问的 {company.evidence.length} 条证据。
        </span>
      </div>
      {task.status !== "已完成" && (
        <button
          className="primary full"
          onClick={async () => {
            await api.completeTask(task.id);
            reload();
          }}
        >
          确认并完成
          <Check />
        </button>
      )}
    </aside>
  );
}

function Industry({ data, reload }: { data: Bootstrap; reload: () => void }) {
  const [selected, setSelected] = useState("satellite");
  const [focused, setFocused] = useState("satellite");
  const navigate = useNavigate();
  const roots = data.industryNodes.filter((n) => n.parentId === "space");
  const selectedNode = data.industryNodes.find((n) => n.id === selected)!;
  const focusedNode = data.industryNodes.find((n) => n.id === focused)!;
  const children = data.industryNodes.filter((n) => n.parentId === selected);
  const related = data.companies.filter((c) =>
    c.positions.some(
      (p) =>
        p.nodeId === focused ||
        (focused === selected && children.some((n) => n.id === p.nodeId)),
    ),
  );
  return (
    <div className="page">
      <PageTitle
        eyebrow="内置机构知识"
        title="商业航天产业链"
        subtitle="完整骨架用于导航和候选检索，前台围绕当前任务呈现局部链路。"
      />
      <div className="source-banner">
        <Database />
        <div>
          <strong>【余香斋】【商业航天】图谱</strong>
          <span>PDF 元数据日期 2025-12-03 · 候选企业关系需持续核验</span>
        </div>
        <em>源文件已校验</em>
      </div>
      <div className="industry-tabs">
        {roots.map((n) => (
          <button
            className={selected === n.id ? "active" : ""}
            onClick={() => {
              setSelected(n.id);
              setFocused(n.id);
            }}
            key={n.id}
          >
            {n.name}
          </button>
        ))}
      </div>
      <div className="industry-canvas">
        <div className="node-root">
          <span>商业航天</span>
          <ChevronRight />
          <strong>{selectedNode.name}</strong>
        </div>
        <div className="node-grid">
          {children.length ? (
            children.map((n) => (
              <button
                key={n.id}
                className={`industry-node ${focused === n.id ? "active" : ""}`}
                onClick={() => setFocused(n.id)}
              >
                <Network />
                <strong>{n.name}</strong>
                <span>
                  {
                    data.companies.filter((c) =>
                      c.positions.some((p) => p.nodeId === n.id),
                    ).length
                  }{" "}
                  家演示公司
                </span>
              </button>
            ))
          ) : (
            <div className="empty-node">
              该板块的深层节点将在行业负责人确认后继续导入
            </div>
          )}
        </div>
      </div>
      <Section
        eyebrow="当前局部链路"
        title={`与“${focusedNode.name}”相关的公司`}
      >
        <div className="related-companies">
          {related.length ? (
            related.map((c) => (
              <button key={c.id} onClick={() => navigate(`/companies/${c.id}`)}>
                <div className="company-logo">{c.standardName.slice(0, 2)}</div>
                <div>
                  <strong>{c.standardName}</strong>
                  <span>
                    {c.positions.find(
                      (p) =>
                        p.nodeId === focused ||
                        (focused === selected &&
                          children.some((n) => n.id === p.nodeId)),
                    )?.status === "confirmed"
                      ? "已确认位置"
                      : "来源图谱 · 待核验"}
                  </span>
                </div>
                <ChevronRight />
              </button>
            ))
          ) : (
            <div className="empty-state">
              当前演示数据中暂无公司，完整图谱仍保留为候选知识源。
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

function Tasks({ data, reload }: { data: Bootstrap; reload: () => void }) {
  return (
    <div className="page">
      <PageTitle
        eyebrow="工作即沉淀"
        title="研究任务"
        subtitle="每个任务都保留处理步骤、使用资料、人工确认与知识回写结果。"
      />
      <div className="task-table">
        <div className="table-row head">
          <span>任务</span>
          <span>公司</span>
          <span>状态</span>
          <span>发起时间</span>
          <span>操作</span>
        </div>
        {data.tasks.map((t) => (
          <div className="table-row" key={t.id}>
            <span>
              <strong>{t.query}</strong>
              <small>{t.id.slice(0, 8)}</small>
            </span>
            <span>
              {data.companies.find((c) => c.id === t.companyId)?.aliases[0] ||
                "待识别"}
            </span>
            <span>
              <em
                className={t.status === "已完成" ? "done-pill" : "review-pill"}
              >
                {t.status}
              </em>
            </span>
            <span>{new Date(t.createdAt).toLocaleString("zh-CN")}</span>
            <span>
              {t.status !== "已完成" && (
                <button
                  onClick={async () => {
                    await api.completeTask(t.id);
                    reload();
                  }}
                >
                  确认完成
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Admin({ data, reload }: { data: Bootstrap; reload: () => void }) {
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [candidates, setCandidates] = useState<EntityCandidate[]>([]);
  const [quality, setQuality] = useState<{
    documents: number;
    parseSuccessRate: number;
    companies: number;
    pendingEntities: number;
    pendingPositions: number;
    evidenceCoverage: number;
    citationIntegrityRate: number;
    coreRecallRate: number;
    permissionLeaks: number;
    conflicts: number;
  } | null>(null);
  useEffect(() => {
    void Promise.all([
      api.audits().then(setAudits),
      api.documents().then(setDocuments),
      api.candidates().then(setCandidates),
      api.quality().then(setQuality),
    ]);
  }, [data]);
  const pending = data.companies.flatMap((c) =>
    c.positions.filter((p) => p.status === "candidate"),
  );
  return (
    <div className="page">
      <PageTitle
        eyebrow="质量与安全"
        title="知识管理"
        subtitle="管理知识源、候选主体、权限与审计；系统管理员不自动获得业务原文权限。"
      />
      <div className="admin-metrics">
        <Metric
          icon={<Database />}
          value={String(quality?.documents || documents.length)}
          label="已入库资料"
        />
        <Metric
          icon={<Building2 />}
          value={String(quality?.companies || data.companies.length)}
          label="公司主体"
        />
        <Metric
          icon={<CircleAlert />}
          value={String(
            (quality?.pendingEntities || 0) +
              (quality?.pendingPositions || pending.length),
          )}
          label="待人工处理"
        />
        <Metric
          icon={<ShieldCheck />}
          value={String(quality?.permissionLeaks || 0)}
          label="权限泄漏"
        />
      </div>
      <div className="admin-grid">
        <Section eyebrow="知识源" title="商业航天全景图谱">
          <div className="source-detail">
            <div>
              <span>文件</span>
              <strong>【余香斋】【商业航天】图谱.pdf</strong>
            </div>
            <div>
              <span>完整性</span>
              <strong className="success">SHA-256 已校验</strong>
            </div>
            <div>
              <span>导入策略</span>
              <strong>完整骨架 · 局部核验</strong>
            </div>
            <div>
              <span>当前状态</span>
              <strong className="success">生效中</strong>
            </div>
          </div>
        </Section>
        <Section eyebrow="模型路由" title="外部模型调用">
          <div className="model-setting">
            <div
              className={`toggle ${data.settings.externalModelsEnabled ? "on" : ""}`}
            >
              <span />
            </div>
            <div>
              <strong>
                {data.settings.externalModelsEnabled ? "已开启" : "已关闭"}
              </strong>
              <p>默认使用本地 Demo 推理，敏感资料不离开机构环境。</p>
            </div>
            {data.user.role === "system_admin" ? (
              <button
                className="secondary"
                onClick={async () => {
                  await api.setting(!data.settings.externalModelsEnabled);
                  reload();
                }}
              >
                {data.settings.externalModelsEnabled ? "关闭" : "开启"}
              </button>
            ) : (
              <span className="lock-note">
                <LockKeyhole />
                仅系统管理员可修改
              </span>
            )}
          </div>
        </Section>
      </div>
      <div className="admin-grid">
        <Section eyebrow="资料管线" title="最近入库状态">
          <div className="document-list">
            {documents.slice(0, 6).map((d) => (
              <div key={d.id}>
                <FileSearch />
                <div>
                  <strong>{d.fileName}</strong>
                  <span>
                    {d.detectedCompanies.length
                      ? `关联：${d.detectedCompanies.join("、")}`
                      : "暂未关联公司"}
                  </span>
                  <small>
                    {d.statusTrace?.map((x) => x.status).join(" → ") ||
                      d.status}
                  </small>
                </div>
                <div className="document-actions">
                  <em
                    className={d.status === "解析失败" ? "failed" : "success"}
                  >
                    {d.status}
                  </em>
                  {d.status === "解析失败" && (
                    <button
                      onClick={async () => {
                        await api.retryDocument(d.id);
                        reload();
                      }}
                    >
                      重试
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
        <Section eyebrow="主体消歧" title="待确认候选">
          <div className="candidate-list">
            {candidates.filter((c) => c.status === "pending").length ? (
              candidates
                .filter((c) => c.status === "pending")
                .map((c) => (
                  <div key={c.id}>
                    <div>
                      <strong>{c.rawName}</strong>
                      <span>{c.reason}</span>
                    </div>
                    {c.candidateCompanyIds.map((id) => (
                      <button
                        key={id}
                        disabled={
                          !["knowledge_admin", "system_admin"].includes(
                            data.user.role,
                          )
                        }
                        onClick={async () => {
                          await api.resolveCandidate(c.id, id, "confirm");
                          reload();
                        }}
                      >
                        {data.companies.find((x) => x.id === id)
                          ?.standardName || id}
                        <Check />
                      </button>
                    ))}
                  </div>
                ))
            ) : (
              <div className="empty-state">暂无待处理主体</div>
            )}
          </div>
        </Section>
      </div>
      {quality && (
        <Section eyebrow="验收指标" title="知识质量概览">
          <div className="quality-grid">
            <Metric
              icon={<Check />}
              value={`${Math.round(quality.parseSuccessRate * 100)}%`}
              label="解析成功率"
            />
            <Metric
              icon={<BookOpen />}
              value={`${Math.round(quality.coreRecallRate * 100)}%`}
              label="核心资料召回"
            />
            <Metric
              icon={<FileSearch />}
              value={`${Math.round(quality.citationIntegrityRate * 100)}%`}
              label="引用完整率"
            />
            <Metric
              icon={<BookOpen />}
              value={`${Math.round(quality.evidenceCoverage * 100)}%`}
              label="证据覆盖率"
            />
            <Metric
              icon={<CircleAlert />}
              value={String(quality.conflicts)}
              label="待裁决冲突"
            />
            <Metric
              icon={<ShieldCheck />}
              value={String(quality.permissionLeaks)}
              label="权限泄漏"
            />
          </div>
        </Section>
      )}
      <Section eyebrow="全程留痕" title="最近审计记录">
        <div className="audit-list">
          {audits.slice(0, 8).map((a) => (
            <div key={a.id}>
              <div className="audit-icon">
                <History />
              </div>
              <div>
                <strong>
                  {a.action} · {a.target}
                </strong>
                <p>{a.detail}</p>
              </div>
              <span>
                {a.actor}
                <small>{new Date(a.at).toLocaleString("zh-CN")}</small>
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
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
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>
          <X />
        </button>
        <span className="eyebrow">原始证据</span>
        <h2>{evidence.fileName}</h2>
        <div className="evidence-meta">
          <span>资料时间 {evidence.sourceDate}</span>
          <span>{evidence.page ? `第 ${evidence.page} 页` : "段落证据"}</span>
          <span>
            {evidence.visibility === "organization"
              ? "机构可见"
              : evidence.visibility === "project"
                ? "项目可见"
                : "仅自己可见"}
          </span>
        </div>
        <blockquote>{evidence.excerpt}</blockquote>
        <div className="evidence-check">
          <ShieldCheck />
          <div>
            <strong>引用已通过权限校验</strong>
            <span>打开原文时系统会再次确认当前用户权限。</span>
          </div>
        </div>
        <button className="primary full" onClick={onClose}>
          确认已核验
        </button>
      </aside>
    </div>
  );
}
function CorrectionModal({
  claim,
  onClose,
  onSave,
}: {
  claim: Claim;
  onClose: () => void;
  onSave: (text: string, reason: string) => void;
}) {
  const [text, setText] = useState(claim.text);
  const [reason, setReason] = useState("");
  return (
    <div className="overlay">
      <div className="modal">
        <button className="close" onClick={onClose}>
          <X />
        </button>
        <span className="eyebrow">人工确认</span>
        <h2>修正知识陈述</h2>
        <label>
          当前内容
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label>
          修正原因
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="说明依据或修正原因"
          />
        </label>
        <div className="modal-note">
          修正会生成新版本，原始证据和历史版本不会被删除。
        </div>
        <div className="modal-actions">
          {claim.version > 1 && (
            <button
              className="danger-link"
              onClick={async () => {
                await api.rollbackClaim(claim.id);
                onClose();
                location.reload();
              }}
            >
              撤销最近修正
            </button>
          )}
          <button className="secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            disabled={reason.length < 2}
            onClick={() => onSave(text, reason)}
          >
            保存新版本
          </button>
        </div>
      </div>
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}
function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section-card">
      <div className="section-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}
function Metric({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}
function roleName(role: string) {
  return (
    (
      {
        investor: "投资经理",
        partner: "投资合伙人",
        knowledge_admin: "知识库管理员",
        system_admin: "系统管理员",
      } as Record<string, string>
    )[role] || role
  );
}

export default App;
