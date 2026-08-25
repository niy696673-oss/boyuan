import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  Filter,
  GitMerge,
  Globe2,
  ListChecks,
  MapPin,
  Network,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  UserRound,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, type Bootstrap } from "../api";
import { createCompanyDirectoryClient, type CompanyDirectoryClient } from "../capabilities/companies/client";
import { companyDetailView, companyDirectoryView, type CompanyView } from "../capabilities/companies/view-model";
import { ResearchPlatformApiError } from "../capabilities/platform-http";
import type { Claim, Company } from "../types";

const defaultCompanyClient = createCompanyDirectoryClient();
type CompanyFilter = "全部" | "已关注" | "有 BP" | "待确认" | "有冲突";

export function CompaniesPage({ data, companyClient = defaultCompanyClient }: { data: Bootstrap; companyClient?: CompanyDirectoryClient }) {
  const navigate = useNavigate();
  const [directory, setDirectory] = useState<CompanyView[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CompanyFilter>("全部");
  const [sort, setSort] = useState("最近更新");
  const [view, setView] = useState<"cards" | "rows">("cards");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void companyClient.list(controller.signal)
      .then((response) => setDirectory(response.items.map(companyDirectoryView)))
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [companyClient]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(".by-company-card", { opacity: 0, y: 24, duration: 0.5, stagger: 0.045, ease: "power3.out" });
    },
    { scope: root, dependencies: [filter, query, view], revertOnUpdate: true },
  );

  const companies = useMemo(() => {
    return (directory || [])
      .filter((company) => {
        const matchesQuery = [company.standardName, ...company.aliases, company.englishName || ""].join(" ").toLowerCase().includes(query.toLowerCase());
        return matchesQuery && companyMatchesFilter(company, filter);
      })
      .sort((a, b) => {
        if (sort === "材料数量") return b.materialCount - a.materialCount;

        // Keep incomplete auto-created shells available without letting them
        // dominate the default view ahead of researched companies.
        const aIsResearched = Number(a.materialCount > 0 || a.knowledgeCount > 0);
        const bIsResearched = Number(b.materialCount > 0 || b.knowledgeCount > 0);
        return bIsResearched - aIsResearched || +new Date(b.updatedAt) - +new Date(a.updatedAt);
      });
  }, [directory, filter, query, sort]);

  if (loadError) return <CompanyLoadState title="公司目录加载失败" />;
  if (!directory) return <CompanyLoadState title="正在加载公司目录…" />;

  return (
    <div className="by-directory-page" ref={root}>
      <aside className="by-filter-rail">
        <header><span>公司目录</span><strong>{directory.length} 家已建档</strong></header>
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、简称或英文名" /></label>
        <nav>
          {(["全部", "已关注", "有 BP", "待确认", "有冲突"] satisfies CompanyFilter[]).map((item) => (
            <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>
              <span>{item}</span>
              <em>{countCompanies(directory, item)}</em>
            </button>
          ))}
        </nav>
        <section>
          <h3>按产业位置</h3>
          {data.industryNodes.filter((node) => node.level >= 2).slice(0, 6).map((node) => <button key={node.id}>{node.name}<ChevronRight /></button>)}
        </section>
      </aside>

      <section className="by-directory-main">
        <header className="by-page-heading">
          <div><span>机构公司主体</span><h1>公司</h1><p>浏览已接触、研究或由材料自动建档的长期公司主体。</p></div>
          <div><button onClick={() => navigate("/companies/import")}><ListChecks />导入名单</button><button className="primary"><Plus />新建公司</button></div>
        </header>
        <div className="by-directory-toolbar">
          <span><Filter />当前显示 {companies.length} 家公司</span>
          <div>
            <select aria-label="公司排序" value={sort} onChange={(event) => setSort(event.target.value)}><option>最近更新</option><option>材料数量</option></select>
            <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>卡片</button>
            <button className={view === "rows" ? "active" : ""} onClick={() => setView("rows")}>列表</button>
          </div>
        </div>
        <div className={`by-company-grid ${view}`}>
          {companies.map((company) => <CompanyCard company={company} data={data} key={company.id} onOpen={() => navigate(`/companies/${company.id}`)} />)}
          {!companies.length && <section className="by-catalog-empty"><Building2 /><h2>还没有公司档案</h2><p>上传材料、导入公司名单，或从工作台发起研究后，公司会在这里持续沉淀。</p><button className="primary" onClick={() => navigate("/companies/import")}><ListChecks />导入公司名单</button></section>}
        </div>
      </section>
    </div>
  );
}

function CompanyCard({ company, data: _data, onOpen }: { company: CompanyView; data: Bootstrap; onOpen: () => void }) {
  const pending = company.pendingCandidateCount;
  const positions = company.industryTags.slice(0, 2);
  return (
    <article className="by-company-card" tabIndex={0} onClick={onOpen} onKeyDown={(event) => event.key === "Enter" && onOpen()}>
      <header><CompanyMark company={company} /><div><h2>{company.aliases[0] || company.standardName}</h2><p>{company.englishName || company.standardName}</p></div><button aria-label="关注公司"><Star /></button></header>
      <p className="by-company-description">{company.description || "基础档案，等待补充已确认认知。"}</p>
      <div className="by-company-tags">{positions.length ? positions.map((item) => <span key={item}>{item}</span>) : <span>产业位置待确认</span>}</div>
      <dl><div><dt>材料</dt><dd>{company.materialCount}</dd></div><div><dt>已确认知识</dt><dd>{company.knowledgeCount}</dd></div><div><dt>最近更新</dt><dd>{new Date(company.updatedAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</dd></div></dl>
      <footer><span className={pending ? "warning" : "success"}>{pending ? `待确认 ${pending}` : "知识已确认"}</span><button>打开公司<ArrowRight /></button></footer>
    </article>
  );
}

export function CompanyDetailPage({ data, reload, companyClient = defaultCompanyClient }: { data: Bootstrap; reload: () => void; companyClient?: CompanyDirectoryClient }) {
  const { id } = useParams();
  const [company, setCompany] = useState<CompanyView | null>(null);
  const [directory, setDirectory] = useState<CompanyView[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");

  useEffect(() => {
    if (!id) {
      setState("not-found");
      return;
    }
    const controller = new AbortController();
    setState("loading");
    void Promise.all([companyClient.get(id, controller.signal), companyClient.list(controller.signal)])
      .then(([detail, response]) => {
        setCompany(companyDetailView(detail));
        setDirectory(response.items.map(companyDirectoryView));
        setState("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState(error instanceof ResearchPlatformApiError && error.status === 404 ? "not-found" : "error");
      });
    return () => controller.abort();
  }, [companyClient, id]);

  if (state === "loading") return <CompanyLoadState title="正在加载公司档案…" />;
  if (state === "not-found") return <CompanyLoadState title="找不到这家公司" description="该公司可能不存在，或已经被合并。" />;
  if (state === "error" || !company) return <CompanyLoadState title="公司档案加载失败" />;
  return <CompanyDetailContent data={data} reload={reload} company={company} directory={directory} />;
}

function CompanyDetailContent({ data, reload: _reload, company, directory }: { data: Bootstrap; reload: () => void; company: CompanyView; directory: CompanyView[] }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") === "relations" ? "产业关系" : "概览");
  const [feedbackIndex, setFeedbackIndex] = useState(0);
  const confirmed = company.claims.filter((claim) => claim.status === "confirmed");
  const pending = company.claims.filter((claim) => ["candidate", "disputed"].includes(claim.status));
  const conflicts = company.claims.filter((claim) => claim.status === "disputed");
  const companyName = company.aliases[0] || company.standardName;

  const tabs = [
    ["概览", ""], ["材料", company.materialCount], ["已确认知识", confirmed.length], ["待确认", pending.length], ["研究记录", company.researchRecords.length], ["产业关系", ""],
  ] as const;

  const selectTab = (name: (typeof tabs)[number][0]) => {
    setTab(name);
    const next = new URLSearchParams(searchParams);
    if (name === "产业关系") next.set("tab", "relations");
    else next.delete("tab");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="by-company-detail-page">
      <CompanyDirectory companies={directory} activeId={company.id} />
      <section className="by-company-detail-main">
        <header className="by-company-hero">
          <div className="by-company-title-line">
            <span className="by-company-inline-image"><CompanyMark company={company} /></span>
            <div><h1>{companyName}</h1><p>{company.englishName || company.standardName}<span />标准名称：{company.standardName}</p><div>{company.industryTags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div></div>
          </div>
          <p>{company.description}</p>
          <div className="by-company-actions"><button onClick={() => navigate("/")}><Sparkles />发起研究</button><button><Upload />上传材料</button><button><Star />{company.attentionStatus === "未关注" ? "关注" : company.attentionStatus}</button></div>
          <dl><div><dt>归档状态</dt><dd><Check />已自动归档</dd></div><div><dt>负责人</dt><dd>{data.user.name}</dd></div><div><dt>最后更新</dt><dd>{relativeDate(company.updatedAt)}</dd></div></dl>
        </header>

        {(pending.length > 0 || conflicts.length > 0) && <button className="by-company-warning" onClick={() => selectTab("待确认")}><AlertTriangle />{pending.length} 条待确认知识需要验证<span />{conflicts.length} 条知识冲突需要处理<ChevronRight /></button>}

        <nav className="by-detail-tabs">{tabs.map(([name, count]) => <button className={tab === name ? "active" : ""} key={name} onClick={() => selectTab(name)}>{name}{count !== "" && <em>{count}</em>}</button>)}</nav>

        {tab === "概览" && (
          <div className="by-company-overview-grid">
            <div className="by-company-primary-column">
              <section className="by-confirmed-overview">
                <header><h2>机构已确认认知</h2><span><ShieldCheck />仅展示正式知识</span></header>
                {["公司身份", "产品与技术", "商业与融资", "风险与待验证"].map((category, index) => {
                  const claim = confirmed[index];
                  return <KnowledgeRow key={category} icon={index === 0 ? <Building2 /> : index === 1 ? <Sparkles /> : index === 2 ? <Globe2 /> : <ShieldCheck />} category={category} claim={claim} evidenceCount={claim?.evidenceIds.length || 0} />;
                })}
              </section>
              <IndustryLane company={company} />
            </div>
            <aside className="by-company-support-column">
              <SupportList title="最近材料" action="查看全部" rows={company.materials.slice(0, 3).map((item) => ({ icon: <FileText />, title: item.fileName, meta: `${relativeDate(item.updatedAt)} · 原始材料` }))} />
              <SupportList title="最近证据" rows={company.evidence.slice(0, 3).map((item) => ({ icon: <FileSearch />, title: item.excerpt, meta: `${item.fileName}${item.page ? ` · 第 ${item.page} 页` : ""}` }))} />
              <FeedbackCarousel tasks={company.researchRecords.map((record) => ({ id: record.runId, query: record.intent, status: platformTaskStatus(record.status), createdBy: "研究平台", createdAt: record.updatedAt, steps: [] }))} index={feedbackIndex} onIndex={setFeedbackIndex} />
              <SupportList title="信息缺口" rows={[{ icon: <CircleAlert />, title: "星座组网实际进度与发射成功率如何？", meta: "证据不足" }, { icon: <CircleAlert />, title: "终端产品路线与性能参数是否明确？", meta: "等待外部核验" }, { icon: <CircleAlert />, title: "未来收入与订单规模依据是什么？", meta: "待访谈" }]} />
            </aside>
          </div>
        )}
        {tab === "材料" && <CompanyMaterials company={company} />}
        {tab === "已确认知识" && <CompanyClaims claims={confirmed} title="已确认知识" />}
        {tab === "待确认" && <CompanyClaims claims={pending} title="待确认候选知识" />}
        {tab === "研究记录" && <CompanyResearch company={company} />}
        {tab === "产业关系" && <IndustryLane company={company} expanded />}
      </section>
    </div>
  );
}

function CompanyDirectory({ companies, activeId }: { companies: CompanyView[]; activeId: string }) {
  return (
    <aside className="by-company-directory">
      <Link to="/companies"><ArrowLeft />返回公司列表</Link>
      <label><Search /><input placeholder="搜索公司" /></label>
      <div className="by-company-mini-list">{companies.map((company) => {
        return <Link className={company.id === activeId ? "active" : ""} to={`/companies/${company.id}`} key={company.id}><CompanyMark company={company} /><span><strong>{company.aliases[0] || company.standardName}</strong><small>{company.cognitionStatus} · {company.materialCount} 份材料</small></span>{company.pendingCandidateCount > 0 && <em>{company.pendingCandidateCount}</em>}</Link>;
      })}</div>
      <Link className="by-company-all-link" to="/companies">查看全部公司<ChevronRight /></Link>
    </aside>
  );
}

function KnowledgeRow({ icon, category, claim, evidenceCount }: { icon: React.ReactNode; category: string; claim?: Claim; evidenceCount: number }) {
  return (
    <article className="by-knowledge-row"><span>{icon}</span><div><h3>{category}</h3><p>{claim?.text || "暂无经过确认的机构知识。"}</p><small>证据来源 {evidenceCount} · 最后确认 {claim?.eventTime || "待补充"}</small></div>{claim && <button>查看 {evidenceCount} 条证据<ChevronRight /></button>}</article>
  );
}

function IndustryLane({ company, expanded = false }: { company: CompanyView; expanded?: boolean }) {
  const upstream = company.relations.filter((item) => item.direction === "incoming").slice(0, expanded ? 5 : 3);
  const downstream = company.relations.filter((item) => item.direction === "outgoing").slice(0, expanded ? 5 : 3);
  const placement = company.industryPlacements.find((item) => item.status === "confirmed") || company.industryPlacements[0];
  return (
    <section className={`by-industry-lane ${expanded ? "expanded" : ""}`}>
      <header><div><h2>产业位置</h2><p>实线为已确认关系，虚线为待确认建议</p></div><button><Network />查看完整关系</button></header>
      <div className="by-lane-grid">
        <div><span>上游供应商 · 已确认</span>{upstream.length ? upstream.map((item) => <button key={item.relationId}>{item.company.aliases[0]?.alias || item.company.canonicalName}<small>{item.relationType}</small></button>) : <button>暂无已归档关系<small>等待补充证据</small></button>}</div>
        <ArrowRight />
        <div className="center"><strong>{company.aliases[0] || company.standardName}</strong><span>{placement?.industryName || "产业位置待确认"}</span><small>{placement?.positionLabel || "等待补充证据"}</small></div>
        <ArrowRight />
        <div><span>下游客户 / 生态 · 已确认</span>{downstream.length ? downstream.map((item) => <button key={item.relationId}>{item.company.aliases[0]?.alias || item.company.canonicalName}<small>{item.relationType}</small></button>) : <button>暂无已归档关系<small>等待补充证据</small></button>}</div>
        <div className="candidate"><span>潜在关联 · 待确认</span>{company.relations.filter((item) => item.status !== "confirmed").slice(0, 2).map((item) => <button key={item.relationId}>{item.company.aliases[0]?.alias || item.company.canonicalName}</button>)}{!company.relations.some((item) => item.status !== "confirmed") && <button>暂无待确认关系</button>}</div>
      </div>
    </section>
  );
}

function FeedbackCarousel({ tasks, index, onIndex }: { tasks: Bootstrap["tasks"]; index: number; onIndex: (index: number) => void }) {
  const items = tasks.length ? tasks : [{ id: "empty", query: "尚无研究记录", status: "已完成", createdAt: new Date().toISOString() } as Bootstrap["tasks"][number]];
  const item = items[index % items.length];
  return (
    <section className="by-feedback-carousel"><header><h2>最近研究</h2><div><button aria-label="上一条" onClick={() => onIndex((index - 1 + items.length) % items.length)}><ChevronLeft /></button><button aria-label="下一条" onClick={() => onIndex((index + 1) % items.length)}><ChevronRight /></button></div></header><article><span><Sparkles /></span><p>{item.query}</p><small>{item.status} · {relativeDate(item.createdAt)}</small></article><div>{items.map((row, itemIndex) => <i className={itemIndex === index % items.length ? "active" : ""} key={row.id} />)}</div></section>
  );
}

function SupportList({ title, action, rows }: { title: string; action?: string; rows: Array<{ icon: React.ReactNode; title: string; meta: string }> }) {
  return <section className="by-support-list"><header><h2>{title}</h2>{action && <button>{action}<ChevronRight /></button>}</header>{rows.map((row, index) => <button key={`${row.title}-${index}`}><span>{row.icon}</span><div><strong>{row.title}</strong><small>{row.meta}</small></div><ChevronRight /></button>)}</section>;
}

function CompanyMaterials({ company }: { company: CompanyView }) {
  return <section className="by-tab-panel"><header><div><h2>公司材料</h2><p>原始材料按权限归档，抽取内容仍需确认。</p></div><button className="primary"><Upload />上传材料</button></header><div className="by-material-table"><div className="head"><span>文件</span><span>来源</span><span>时间</span><span>权限</span><span>状态</span></div>{company.materials.map((item) => <button key={item.documentId}><span><FileText /><strong>{item.fileName}</strong></span><span>{item.sourceChannel}</span><span>{relativeDate(item.updatedAt)}</span><span><ShieldCheck />机构</span><span className="success">已归档</span></button>)}</div></section>;
}

function CompanyClaims({ claims, title }: { claims: Claim[]; title: string }) {
  return <section className="by-tab-panel"><header><div><h2>{title}</h2><p>每条陈述都保留来源、版本和处理记录。</p></div></header><div className="by-claim-table">{claims.length ? claims.map((claim) => <article key={claim.id}><header><span>{claim.category}</span><em className={claim.status}>{claim.status}</em></header><p>{claim.text}</p><footer><span><FileSearch />{claim.evidenceIds.length} 条证据</span><span>版本 {claim.version}</span><button>{claim.status === "confirmed" ? "查看证据" : "开始确认"}<ChevronRight /></button></footer></article>) : <div className="by-inline-empty">暂无符合条件的知识陈述</div>}</div></section>;
}

function CompanyResearch({ company }: { company: CompanyView }) {
  return <section className="by-tab-panel"><header><div><h2>研究记录</h2><p>复用历史任务上下文，减少重复上传和解释。</p></div><button className="primary"><Sparkles />发起公司研究</button></header><div className="by-research-list">{company.researchRecords.map((record) => <button key={record.runId}><span><Sparkles /></span><div><strong>{record.intent}</strong><small>研究平台 · {relativeDate(record.updatedAt)}</small></div><em>{platformTaskStatus(record.status)}</em><ChevronRight /></button>)}</div></section>;
}

export function CompanyImportPage({ data: _data, reload }: { data: Bootstrap; reload: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.importCompanyList>> | null>(null);
  const [busy, setBusy] = useState(false);
  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { setResult(await api.importCompanyList(file)); reload(); } finally { setBusy(false); }
  };
  return (
    <section className="by-import-page"><header><button onClick={() => navigate("/companies")}><ArrowLeft />返回公司</button><div><span>公司名单处理</span><h1>批量识别并建立公司主体</h1><p>原始名单始终保留；系统会区分已有、新建、同名待确认和识别失败。</p></div></header><div className="by-import-drop"><ListChecks /><h2>{busy ? "正在识别名单…" : "上传公司名单"}</h2><p>支持 CSV 文件。上传后可逐行确认主体并选择重点公司发起研究。</p><button className="primary" onClick={() => inputRef.current?.click()}><Upload />选择文件</button><input ref={inputRef} hidden type="file" accept=".csv" onChange={(event) => void importFile(event.target.files?.[0])} /></div>{result && <div className="by-import-result"><header><h2>识别结果</h2><span>共 {result.total} 行</span></header><div className="by-import-stats"><span><strong>{result.result.filter((item) => item.status.includes("已有")).length}</strong>已有公司</span><span><strong>{result.result.filter((item) => item.status.includes("新建")).length}</strong>新建公司</span><span><strong>{result.result.filter((item) => item.status.includes("确认")).length}</strong>同名待确认</span><span><strong>{result.result.filter((item) => item.status.includes("失败")).length}</strong>识别失败</span></div>{result.result.map((item, index) => <div className="by-import-row" key={`${item.rawName}-${index}`}><input type="checkbox" aria-label={`选择 ${item.rawName}`} /><strong>{item.rawName}</strong><span>{item.companyName || "等待选择主体"}</span><em>{item.status}</em><button><Pencil />处理</button></div>)}</div>}</section>
  );
}

function CompanyMark({ company }: { company: Company }) {
  return <span className="by-company-mark" aria-hidden="true">{(company.aliases[0] || company.standardName).slice(0, 1)}</span>;
}

function countCompanies(companies: CompanyView[], filter: CompanyFilter) {
  return companies.filter((company) => companyMatchesFilter(company, filter)).length;
}

function companyMatchesFilter(company: CompanyView, filter: CompanyFilter) {
  if (filter === "全部") return true;
  if (filter === "已关注") return company.attentionStatus !== "未关注";
  if (filter === "有 BP") return company.materialCount > 0;
  if (filter === "待确认") return company.pendingCandidateCount > 0;
  return company.hasConflict;
}

function CompanyLoadState({ title, description = "请稍后重试，或返回公司目录。" }: { title: string; description?: string }) {
  return <section className="by-empty-page"><Building2 /><h1>{title}</h1><p>{description}</p><Link to="/companies">返回公司</Link></section>;
}

function platformTaskStatus(status: CompanyView["researchRecords"][number]["status"]): Bootstrap["tasks"][number]["status"] {
  if (status === "completed") return "已完成";
  if (status === "failed") return "执行失败";
  if (status === "pending_confirmation" || status === "waiting") return "待用户确认";
  return "生成中";
}

function relativeDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
