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
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Bootstrap, type IndustryContext } from "../api";
import type { Claim, Company } from "../types";

export function CompaniesPage({ data }: { data: Bootstrap }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const [sort, setSort] = useState("最近更新");
  const [view, setView] = useState<"cards" | "rows">("cards");
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(".by-company-card", { opacity: 0, y: 24, duration: 0.5, stagger: 0.045, ease: "power3.out" });
    },
    { scope: root, dependencies: [filter, query, view], revertOnUpdate: true },
  );

  const companies = useMemo(() => {
    return data.companies
      .filter((company) => {
        const pending = company.claims.some((claim) => ["candidate", "disputed"].includes(claim.status));
        const matchesQuery = [company.standardName, ...company.aliases, company.englishName || ""].join(" ").toLowerCase().includes(query.toLowerCase());
        const matchesFilter =
          filter === "全部" ||
          (filter === "已关注" && company.attentionStatus !== "未关注") ||
          (filter === "有 BP" && company.evidence.some((item) => /BP|商业计划/.test(item.fileName))) ||
          (filter === "待确认" && pending) ||
          (filter === "有冲突" && company.claims.some((claim) => claim.status === "disputed"));
        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => {
        if (sort === "材料数量") return b.evidence.length - a.evidence.length;

        // Keep incomplete auto-created shells available without letting them
        // dominate the default demo view ahead of researched companies.
        const aIsResearched = Number(a.evidence.length > 0 || a.claims.length > 0);
        const bIsResearched = Number(b.evidence.length > 0 || b.claims.length > 0);
        return bIsResearched - aIsResearched || +new Date(b.updatedAt) - +new Date(a.updatedAt);
      });
  }, [data.companies, filter, query, sort]);

  return (
    <div className="by-directory-page" ref={root}>
      <aside className="by-filter-rail">
        <header><span>公司目录</span><strong>{data.companies.length} 家已建档</strong></header>
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、简称或英文名" /></label>
        <nav>
          {["全部", "已关注", "有 BP", "待确认", "有冲突"].map((item) => (
            <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>
              <span>{item}</span>
              <em>{countCompanies(data.companies, item)}</em>
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
        </div>
      </section>
    </div>
  );
}

function CompanyCard({ company, data, onOpen }: { company: Company; data: Bootstrap; onOpen: () => void }) {
  const pending = company.claims.filter((claim) => ["candidate", "disputed"].includes(claim.status)).length;
  const positions = company.positions.filter((item) => item.status !== "rejected").map((position) => data.industryNodes.find((node) => node.id === position.nodeId)?.name).filter(Boolean).slice(0, 2);
  return (
    <article className="by-company-card" tabIndex={0} onClick={onOpen} onKeyDown={(event) => event.key === "Enter" && onOpen()}>
      <header><CompanyMark company={company} /><div><h2>{company.aliases[0] || company.standardName}</h2><p>{company.englishName || company.standardName}</p></div><button aria-label="关注公司"><Star /></button></header>
      <p className="by-company-description">{company.description || "基础档案，等待补充已确认认知。"}</p>
      <div className="by-company-tags">{positions.length ? positions.map((item) => <span key={item}>{item}</span>) : <span>产业位置待确认</span>}</div>
      <dl><div><dt>材料</dt><dd>{company.evidence.length}</dd></div><div><dt>已确认知识</dt><dd>{company.claims.filter((claim) => claim.status === "confirmed").length}</dd></div><div><dt>最近更新</dt><dd>{new Date(company.updatedAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</dd></div></dl>
      <footer><span className={pending ? "warning" : "success"}>{pending ? `待确认 ${pending}` : "知识已确认"}</span><button>打开公司<ArrowRight /></button></footer>
    </article>
  );
}

export function CompanyDetailPage({ data, reload }: { data: Bootstrap; reload: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const company = data.companies.find((item) => item.id === id) || data.companies[0];
  const [tab, setTab] = useState("概览");
  const [context, setContext] = useState<IndustryContext | null>(null);
  const [feedbackIndex, setFeedbackIndex] = useState(0);
  const confirmed = company.claims.filter((claim) => claim.status === "confirmed");
  const pending = company.claims.filter((claim) => ["candidate", "disputed"].includes(claim.status));
  const conflicts = company.claims.filter((claim) => claim.status === "disputed");
  const companyName = company.aliases[0] || company.standardName;

  useEffect(() => {
    api.industryContext(company.id).then(setContext).catch(() => setContext(null));
  }, [company.id]);

  const tabs = [
    ["概览", ""], ["材料", company.evidence.length], ["已确认知识", confirmed.length], ["待确认", pending.length], ["研究记录", data.tasks.filter((task) => task.companyId === company.id).length], ["产业关系", ""],
  ] as const;

  const updateAttention = async () => {
    await api.attention(company.id, company.attentionStatus === "未关注" ? "持续跟踪" : "未关注");
    reload();
  };

  return (
    <div className="by-company-detail-page">
      <CompanyDirectory data={data} activeId={company.id} />
      <section className="by-company-detail-main">
        <header className="by-company-hero">
          <div className="by-company-title-line">
            <span className="by-company-inline-image"><CompanyMark company={company} /></span>
            <div><h1>{companyName}</h1><p>{company.englishName || "GalaxySpace"}<span />别名：{company.standardName}</p><div>{company.positions.slice(0, 3).map((position) => <span key={position.nodeId}>{data.industryNodes.find((node) => node.id === position.nodeId)?.name}</span>)}</div></div>
          </div>
          <p>{company.description}</p>
          <div className="by-company-actions"><button onClick={() => navigate("/")}><Sparkles />发起研究</button><button><Upload />上传材料</button><button onClick={updateAttention}><Star />{company.attentionStatus === "未关注" ? "关注" : company.attentionStatus}</button></div>
          <dl><div><dt>归档状态</dt><dd><Check />已自动归档</dd></div><div><dt>负责人</dt><dd>{data.user.name}</dd></div><div><dt>最后更新</dt><dd>{relativeDate(company.updatedAt)}</dd></div></dl>
        </header>

        {(pending.length > 0 || conflicts.length > 0) && <button className="by-company-warning" onClick={() => setTab("待确认")}><AlertTriangle />{pending.length} 条待确认知识需要验证<span />{conflicts.length} 条知识冲突需要处理<ChevronRight /></button>}

        <nav className="by-detail-tabs">{tabs.map(([name, count]) => <button className={tab === name ? "active" : ""} key={name} onClick={() => setTab(name)}>{name}{count !== "" && <em>{count}</em>}</button>)}</nav>

        {tab === "概览" && (
          <div className="by-company-overview-grid">
            <div className="by-company-primary-column">
              <section className="by-confirmed-overview">
                <header><h2>机构已确认认知</h2><span><ShieldCheck />仅展示正式知识</span></header>
                {["公司身份", "产品与技术", "商业与融资", "风险与待验证"].map((category, index) => {
                  const claim = confirmed[index] || confirmed[0];
                  return <KnowledgeRow key={category} icon={index === 0 ? <Building2 /> : index === 1 ? <Sparkles /> : index === 2 ? <Globe2 /> : <ShieldCheck />} category={category} claim={claim} evidenceCount={claim?.evidenceIds.length || 0} />;
                })}
              </section>
              <IndustryLane company={company} context={context} />
            </div>
            <aside className="by-company-support-column">
              <SupportList title="最近材料" action="查看全部" rows={company.evidence.slice(0, 3).map((item) => ({ icon: <FileText />, title: item.fileName, meta: `${item.sourceDate} · 原始材料` }))} />
              <FeedbackCarousel tasks={data.tasks.filter((task) => task.companyId === company.id)} index={feedbackIndex} onIndex={setFeedbackIndex} />
              <SupportList title="信息缺口" rows={[{ icon: <CircleAlert />, title: "星座组网实际进度与发射成功率如何？", meta: "证据不足" }, { icon: <CircleAlert />, title: "终端产品路线与性能参数是否明确？", meta: "等待外部核验" }, { icon: <CircleAlert />, title: "未来收入与订单规模依据是什么？", meta: "待访谈" }]} />
            </aside>
          </div>
        )}
        {tab === "材料" && <CompanyMaterials company={company} />}
        {tab === "已确认知识" && <CompanyClaims claims={confirmed} title="已确认知识" />}
        {tab === "待确认" && <CompanyClaims claims={pending} title="待确认候选知识" />}
        {tab === "研究记录" && <CompanyResearch data={data} company={company} />}
        {tab === "产业关系" && <IndustryLane company={company} context={context} expanded />}
      </section>
    </div>
  );
}

function CompanyDirectory({ data, activeId }: { data: Bootstrap; activeId: string }) {
  return (
    <aside className="by-company-directory">
      <Link to="/companies"><ArrowLeft />返回公司列表</Link>
      <label><Search /><input placeholder="搜索公司" /></label>
      <div className="by-company-mini-list">{data.companies.map((company) => {
        const pending = company.claims.filter((claim) => ["candidate", "disputed"].includes(claim.status)).length;
        return <Link className={company.id === activeId ? "active" : ""} to={`/companies/${company.id}`} key={company.id}><CompanyMark company={company} /><span><strong>{company.aliases[0] || company.standardName}</strong><small>{company.cognitionStatus} · {company.evidence.length} 份材料</small></span>{pending > 0 && <em>{pending}</em>}</Link>;
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

function IndustryLane({ company, context, expanded = false }: { company: Company; context: IndustryContext | null; expanded?: boolean }) {
  const upstream = context?.upstream.slice(0, expanded ? 5 : 3) || [];
  const downstream = context?.downstream.slice(0, expanded ? 5 : 3) || [];
  return (
    <section className={`by-industry-lane ${expanded ? "expanded" : ""}`}>
      <header><div><h2>产业位置</h2><p>实线为已确认关系，虚线为待确认建议</p></div><button><Network />查看完整关系</button></header>
      <div className="by-lane-grid">
        <div><span>上游供应商 · 已确认</span>{upstream.length ? upstream.map((item) => <button key={item.company.id}>{item.company.aliases[0] || item.company.standardName}<small>{item.node?.name || "供应环节"}</small></button>) : <button>星载元器件供应商<small>关键部件</small></button>}</div>
        <ArrowRight />
        <div className="center"><strong>{company.aliases[0] || company.standardName}</strong><span>卫星平台系统</span><small>低轨宽带通信卫星</small></div>
        <ArrowRight />
        <div><span>下游客户 / 生态 · 已确认</span>{downstream.length ? downstream.map((item) => <button key={item.company.id}>{item.company.aliases[0] || item.company.standardName}<small>{item.node?.name || "应用环节"}</small></button>) : <button>卫星互联网运营商<small>商业应用</small></button>}</div>
        <div className="candidate"><span>潜在关联 · 待确认</span><button>云服务与数据平台</button><button>手机直连服务商</button></div>
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

function CompanyMaterials({ company }: { company: Company }) {
  return <section className="by-tab-panel"><header><div><h2>公司材料</h2><p>原始材料按权限归档，抽取内容仍需确认。</p></div><button className="primary"><Upload />上传材料</button></header><div className="by-material-table"><div className="head"><span>文件</span><span>来源</span><span>时间</span><span>权限</span><span>状态</span></div>{company.evidence.map((item) => <button key={item.id}><span><FileText /><strong>{item.fileName}</strong></span><span>机构材料</span><span>{item.sourceDate}</span><span><ShieldCheck />{item.visibility}</span><span className="success">已归档</span></button>)}</div></section>;
}

function CompanyClaims({ claims, title }: { claims: Claim[]; title: string }) {
  return <section className="by-tab-panel"><header><div><h2>{title}</h2><p>每条陈述都保留来源、版本和处理记录。</p></div></header><div className="by-claim-table">{claims.length ? claims.map((claim) => <article key={claim.id}><header><span>{claim.category}</span><em className={claim.status}>{claim.status}</em></header><p>{claim.text}</p><footer><span><FileSearch />{claim.evidenceIds.length} 条证据</span><span>版本 {claim.version}</span><button>{claim.status === "confirmed" ? "查看证据" : "开始确认"}<ChevronRight /></button></footer></article>) : <div className="by-inline-empty">暂无符合条件的知识陈述</div>}</div></section>;
}

function CompanyResearch({ data, company }: { data: Bootstrap; company: Company }) {
  const tasks = data.tasks.filter((task) => task.companyId === company.id);
  return <section className="by-tab-panel"><header><div><h2>研究记录</h2><p>复用历史任务上下文，减少重复上传和解释。</p></div><button className="primary"><Sparkles />发起公司研究</button></header><div className="by-research-list">{tasks.map((task) => <button key={task.id}><span><Sparkles /></span><div><strong>{task.query}</strong><small>{task.createdBy} · {relativeDate(task.createdAt)}</small></div><em>{task.status}</em><ChevronRight /></button>)}</div></section>;
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

function countCompanies(companies: Company[], filter: string) {
  if (filter === "全部") return companies.length;
  if (filter === "已关注") return companies.filter((company) => company.attentionStatus !== "未关注").length;
  if (filter === "有 BP") return companies.filter((company) => company.evidence.some((item) => /BP|商业计划/.test(item.fileName))).length;
  if (filter === "待确认") return companies.filter((company) => company.claims.some((claim) => ["candidate", "disputed"].includes(claim.status))).length;
  if (filter === "有冲突") return companies.filter((company) => company.claims.some((claim) => claim.status === "disputed")).length;
  return 0;
}

function relativeDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
