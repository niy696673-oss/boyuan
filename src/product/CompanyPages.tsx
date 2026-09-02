import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  BookOpen,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileSearch,
  FileText,
  Filter,
  GitMerge,
  Globe2,
  ListChecks,
  MapPin,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Bootstrap } from "../api";
import {
  confirmableCompanyListRows,
  createCompanyListClient,
  type CompanyListClient,
} from "../capabilities/company-lists/client";
import { createCompanyCopilotClient } from "../capabilities/copilot/client";
import type {
  CompanyCopilotMessage,
  CompanyCopilotThread,
} from "../capabilities/copilot/types";
import { createCompanyDirectoryClient, type CompanyDirectoryClient } from "../capabilities/companies/client";
import { companyDetailView, companyDirectoryView, type CompanyView } from "../capabilities/companies/view-model";
import { ResearchPlatformApiError } from "../capabilities/platform-http";
import type { Claim, Company } from "../types";
import type {
  CompanyListRecordV1,
  CompanyListRowV1,
  SubjectKindV1,
  SubjectResolutionInputV1,
} from "../../shared/research-platform-v1";

const defaultCompanyClient = createCompanyDirectoryClient();
const defaultCompanyListClient = createCompanyListClient();
const defaultCompanyCopilotClient = createCompanyCopilotClient();
type CompanyFilter = "全部" | "已关注" | "有 BP" | "待确认" | "有冲突";

export function CompaniesPage({ data, companyClient = defaultCompanyClient }: { data: Bootstrap; companyClient?: CompanyDirectoryClient }) {
  const navigate = useNavigate();
  const [directory, setDirectory] = useState<CompanyView[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [watchingCompanyId, setWatchingCompanyId] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const actionController = useRef<AbortController | null>(null);
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

  useEffect(() => () => actionController.current?.abort(), []);

  const toggleWatched = async (company: CompanyView) => {
    actionController.current?.abort();
    const controller = new AbortController();
    actionController.current = controller;
    setWatchingCompanyId(company.id);
    setActionNotice("");
    try {
      const detail = await companyClient.setWatched(
        company.id,
        {
          watched: company.attentionStatus === "未关注",
          expectedVersion: company.version,
        },
        controller.signal,
      );
      const updated = companyDetailView(detail);
      setDirectory((current) =>
        current?.map((item) => (item.id === updated.id ? updated : item)) ||
        null,
      );
      setActionNotice(
        updated.attentionStatus === "未关注"
          ? `已取消关注${company.standardName}`
          : `已关注${company.standardName}`,
      );
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setActionNotice(
          error instanceof Error ? error.message : "关注状态更新失败",
        );
      }
    } finally {
      setWatchingCompanyId("");
    }
  };

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
        <header><span>研究主体</span><strong>{directory.length} 个已建档</strong></header>
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
          <div><span>长期研究对象</span><h1>研究主体</h1><p>区分法律公司、项目、机构和团队，并持续沉淀材料与知识。</p></div>
          <div><button onClick={() => navigate("/companies/import")}><ListChecks />导入名单</button><button className="primary"><Plus />新建公司</button></div>
        </header>
        {actionNotice && <p role="status">{actionNotice}</p>}
        <div className="by-directory-toolbar">
          <span><Filter />当前显示 {companies.length} 个主体</span>
          <div>
            <select aria-label="主体排序" value={sort} onChange={(event) => setSort(event.target.value)}><option>最近更新</option><option>材料数量</option></select>
            <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>卡片</button>
            <button className={view === "rows" ? "active" : ""} onClick={() => setView("rows")}>列表</button>
          </div>
        </div>
        <div className={`by-company-grid ${view}`}>
          {companies.map((company) => <CompanyCard company={company} key={company.id} watching={watchingCompanyId === company.id} onWatch={() => void toggleWatched(company)} onOpen={() => navigate(`/companies/${company.id}`)} />)}
          {!companies.length && <section className="by-catalog-empty"><Building2 /><h2>还没有研究主体</h2><p>上传材料、导入公司名单，或从工作台发起研究后，主体会在这里持续沉淀。</p><button className="primary" onClick={() => navigate("/companies/import")}><ListChecks />导入公司名单</button></section>}
        </div>
      </section>
    </div>
  );
}

function CompanyCard({ company, watching, onWatch, onOpen }: { company: CompanyView; watching: boolean; onWatch: () => void; onOpen: () => void }) {
  const identity = [company.standardName, company.location, company.foundedAt].filter(Boolean).join(" · ");
  const industry = company.industryTags.join(" / ") || "行业与产业位置待确认";
  const funding = company.latestFunding || "融资轮次、金额与估值待确认";
  const productSummary = company.latestMaterialAnalysis?.summary || company.description || "产品与技术路径待材料分析";
  const teamSlots = [
    ["负", "负责人待确认", "核心负责人", "待材料核验"],
    ["技", "技术负责人待确认", "技术负责人", "待材料核验"],
    ["业", "业务负责人待确认", "业务负责人", "待材料核验"],
  ];
  return (
    <article className="by-company-card" tabIndex={0} onClick={onOpen} onKeyDown={(event) => event.key === "Enter" && onOpen()}>
      <header className="by-company-card-heading"><div><h2>{company.standardName}</h2><p>仅反映经核验本份 BP 自陈事实；跨文档完整画像见公司实体页</p></div><div><span className={company.analysisStatus.tone}>{company.analysisStatus.label}</span><button aria-label={`${company.attentionStatus === "未关注" ? "关注" : "取消关注"}${company.standardName}`} aria-pressed={company.attentionStatus !== "未关注"} disabled={watching} onClick={(event) => { event.stopPropagation(); onWatch(); }} onKeyDown={(event) => event.stopPropagation()}><Star /></button></div></header>
      <section className="by-company-card-facts"><h3>关键信息（来自 BP 事实核验）</h3><div>
        <article><strong>公司身份</strong><p>{identity || company.standardName} · {subjectKindLabel(company.subjectKindStatus === "confirmed" ? company.subjectKind : company.suggestedSubjectKind || "unknown")}</p></article>
        <article><strong>行业 / 赛道</strong><p>{industry}</p></article>
        <article><strong>融资信息</strong><p>{funding}</p></article>
        <article><strong>团队关键人</strong><p>核心团队信息待材料核验</p></article>
      </div></section>
      <section className="by-company-card-product"><h3>产品与技术路径</h3><p>{productSummary}</p></section>
      <section className="by-company-card-team"><h3>核心团队</h3><div>{teamSlots.map(([mark, name, role, status]) => <article key={role}><i>{mark}</i><strong>{name}</strong><em>{role}</em><p>{status}；进入公司实体页可查看跨材料人物关联。</p><span>{status}</span></article>)}</div></section>
      <footer className="by-company-card-footer"><div><span>材料 {company.materialCount}</span><span>已确认知识 {company.knowledgeCount}</span><span>更新 {new Date(company.updatedAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</span></div><button>打开公司实体页<ArrowRight /></button></footer>
    </article>
  );
}

export function CompanyDetailPage({ data, reload, companyClient = defaultCompanyClient }: { data: Bootstrap; reload: () => void; companyClient?: CompanyDirectoryClient }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState<CompanyView | null>(null);
  const [directory, setDirectory] = useState<CompanyView[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const actionController = useRef<AbortController | null>(null);

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

  useEffect(() => () => actionController.current?.abort(), []);

  const refreshDirectory = async (signal?: AbortSignal) => {
    const response = await companyClient.list(signal);
    setDirectory(response.items.map(companyDirectoryView));
  };

  const uploadCompanyMaterial = async (file: File) => {
    if (!id) return "上传失败";
    actionController.current?.abort();
    const controller = new AbortController();
    actionController.current = controller;
    const result = await companyClient.uploadDocument(id, file, controller.signal);
    let detail = await companyClient.get(id, controller.signal);
    setCompany(companyDetailView(detail));

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const material = detail.materials.find(
        (item) => item.conversationId === result.conversation.conversationId,
      );
      if (material && isTerminalMaterialStatus(material.status)) {
        await refreshDirectory(controller.signal);
        reload();
        return materialProcessingNotice(material.status);
      }
      await abortableDelay(500, controller.signal);
      detail = await companyClient.get(id, controller.signal);
      setCompany(companyDetailView(detail));
    }

    await refreshDirectory(controller.signal);
    reload();
    return "材料已上传，后台仍在处理中";
  };

  const updateWatched = async (watched: boolean) => {
    if (!id || !company) return;
    actionController.current?.abort();
    const controller = new AbortController();
    actionController.current = controller;
    const detail = await companyClient.setWatched(
      id,
      { watched, expectedVersion: company.version },
      controller.signal,
    );
    setCompany(companyDetailView(detail));
    await refreshDirectory(controller.signal);
    reload();
  };

  const resolveSubject = async (input: SubjectResolutionInputV1) => {
    if (!id || !companyClient.resolveSubject) {
      throw new Error("主体确认能力不可用");
    }
    actionController.current?.abort();
    const controller = new AbortController();
    actionController.current = controller;
    const detail = await companyClient.resolveSubject(id, input, controller.signal);
    const resolved = companyDetailView(detail);
    setCompany(resolved);
    await refreshDirectory(controller.signal);
    reload();
    if (resolved.id !== id) navigate(`/companies/${resolved.id}`, { replace: true });
  };

  if (state === "loading") return <CompanyLoadState title="正在加载主体档案…" />;
  if (state === "not-found") return <CompanyLoadState title="找不到这个研究主体" description="该主体可能不存在，或已经被合并。" />;
  if (state === "error" || !company) return <CompanyLoadState title="主体档案加载失败" />;
  return <CompanyDetailContent data={data} company={company} directory={directory} onUpload={uploadCompanyMaterial} onWatch={updateWatched} onResolveSubject={resolveSubject} />;
}

function CompanyDetailContent({ data, company, directory, onUpload, onWatch, onResolveSubject }: { data: Bootstrap; company: CompanyView; directory: CompanyView[]; onUpload: (file: File) => Promise<string>; onWatch: (watched: boolean) => Promise<void>; onResolveSubject: (input: SubjectResolutionInputV1) => Promise<void> }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") === "relations" ? "产业关系" : "画像");
  const [uploading, setUploading] = useState(false);
  const [watching, setWatching] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [subjectKind, setSubjectKind] = useState<Exclude<SubjectKindV1, "unknown">>(
    company.suggestedSubjectKind && company.suggestedSubjectKind !== "unknown"
      ? company.suggestedSubjectKind
      : "legal_company",
  );
  const [targetCompanyId, setTargetCompanyId] = useState("");
  const [resolvingSubject, setResolvingSubject] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const confirmed = company.claims.filter((claim) => claim.status === "confirmed");
  const pending = company.claims.filter((claim) => ["candidate", "disputed"].includes(claim.status));
  const conflicts = company.claims.filter((claim) => claim.status === "disputed");
  const companyName = company.standardName;
  const legalCompanyTargets = directory.filter(
    (item) =>
      item.id !== company.id
      && item.subjectKind === "legal_company"
      && item.subjectKindStatus === "confirmed",
  );

  const tabs = [
    ["画像", ""],
    ["尽调与决策", ""],
    ["日志", company.researchRecords.length],
    ["材料", company.materialCount],
    ["已确认知识", confirmed.length],
    ["待确认", pending.length],
    ["产业关系", ""],
  ] as const;

  const selectTab = (name: (typeof tabs)[number][0]) => {
    setTab(name);
    const next = new URLSearchParams(searchParams);
    if (name === "产业关系") next.set("tab", "relations");
    else next.delete("tab");
    setSearchParams(next, { replace: true });
  };

  const uploadFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setActionNotice(`正在处理 ${file.name}…`);
    try {
      setActionNotice(await onUpload(file));
    } catch (error) {
      if ((error as Error).name !== "AbortError") setActionNotice(error instanceof Error ? error.message : "材料上传失败");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const toggleWatched = async () => {
    setWatching(true);
    setActionNotice("");
    try {
      await onWatch(company.attentionStatus === "未关注");
      setActionNotice(company.attentionStatus === "未关注" ? "已关注公司" : "已取消关注");
    } catch (error) {
      if ((error as Error).name !== "AbortError") setActionNotice(error instanceof Error ? error.message : "关注状态更新失败");
    } finally {
      setWatching(false);
    }
  };

  const resolveIdentity = async (action: "confirm" | "link" | "merge") => {
    setResolvingSubject(true);
    setActionNotice("");
    try {
      await onResolveSubject({
        expectedVersion: company.version,
        action,
        ...(action !== "merge" ? { subjectKind } : {}),
        ...(action !== "confirm" ? { targetCompanyId } : {}),
      });
      setActionNotice(
        action === "merge"
          ? "重复主体已合并，材料、证据和候选已迁移"
          : action === "link"
            ? "主体类型和法律公司归属已确认"
            : "主体类型已确认",
      );
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setActionNotice(error instanceof Error ? error.message : "主体确认失败");
      }
    } finally {
      setResolvingSubject(false);
    }
  };

  const relatedEntityCount = new Set(company.relations.map((item) => item.company.companyId)).size;
  const completeness = Math.min(98, 40 + Math.min(company.materialCount, 4) * 8 + Math.min(confirmed.length, 6) * 5 + Math.min(company.industryTags.length, 3) * 4);
  const sourceChannels = [...new Set(company.materials.map((item) => item.sourceChannel === "feishu" ? "飞书" : "工作台"))];

  return (
    <div className={`by-company-detail-page by-entity-page ${copilotOpen ? "copilot-open" : "copilot-collapsed"}`}>
      <section className="by-company-detail-main">
        <header className="by-entity-header">
          <div className="by-entity-context">统一公司实体页 · 投资判断视图（关键信息 · 产品/行业/客户/市场 · 基金匹配 · 尽调问题）</div>
          <div className="by-entity-title-row">
            <div>
              <h1>{companyName}</h1>
              <span>{relatedEntityCount || 1} 个关联实体</span>
            </div>
            <div className="by-entity-actions">
              <button onClick={() => navigate(`/?companyId=${encodeURIComponent(company.id)}`)}><Sparkles />发起研究</button>
              <button disabled={uploading} onClick={() => fileInput.current?.click()}><Upload />{uploading ? "处理中…" : "上传材料"}</button>
              <button aria-pressed={company.attentionStatus !== "未关注"} disabled={watching} onClick={() => void toggleWatched()}><Star />{watching ? "保存中…" : company.attentionStatus === "未关注" ? "关注" : company.attentionStatus}</button>
            </div>
          </div>
          <p className="by-entity-meta">别名：{company.aliases.join(" / ") || company.englishName || "暂无"}<span />完整度 {completeness}%<span />来源：{sourceChannels.join("·") || "尚未导入"}<span />诉讼提示：公开渠道待核验<span />本页为跨来源累积视图</p>
          <details className="by-entity-governance">
            <summary><Building2 />主体治理：{subjectKindLabel(company.subjectKind)}{company.subjectKindStatus === "pending" ? "（待确认）" : "（已确认）"}</summary>
            <div>
              <p>{company.parentCompany ? `归属法律公司：${company.parentCompany.canonicalName}` : company.subjectKindReason || "该主体尚未关联其他法律公司。"}</p>
              <select aria-label="主体类型" value={subjectKind} onChange={(event) => setSubjectKind(event.target.value as Exclude<SubjectKindV1, "unknown">)}>
                <option value="legal_company">法律公司</option><option value="project">项目 / 产品 / 技术</option><option value="institution">机构</option><option value="team">团队</option>
              </select>
              <button disabled={resolvingSubject} onClick={() => void resolveIdentity("confirm")}>确认类型</button>
              {subjectKind !== "legal_company" && <><select aria-label="归属法律公司" value={targetCompanyId} onChange={(event) => setTargetCompanyId(event.target.value)}><option value="">选择已确认的法律公司</option>{legalCompanyTargets.map((item) => <option value={item.id} key={item.id}>{item.standardName}</option>)}</select><button disabled={resolvingSubject || !targetCompanyId} onClick={() => void resolveIdentity("link")}>确认归属</button></>}
              <select aria-label="合并目标公司" value={targetCompanyId} onChange={(event) => setTargetCompanyId(event.target.value)}><option value="">选择重复主体的合并目标</option>{legalCompanyTargets.map((item) => <option value={item.id} key={item.id}>{item.standardName}</option>)}</select>
              <button disabled={resolvingSubject || !targetCompanyId} onClick={() => void resolveIdentity("merge")}>合并重复主体</button>
            </div>
          </details>
          <input ref={fileInput} hidden type="file" accept=".pdf,.docx,.txt,.md" onChange={(event) => void uploadFile(event.target.files?.[0])} />
          {actionNotice && <p className="by-entity-notice" role="status">{actionNotice}</p>}

          <nav className="by-detail-tabs by-entity-tabs">{tabs.map(([name, count], index) => <button className={`${tab === name ? "active" : ""} ${index > 2 ? "counter" : ""}`} key={name} onClick={() => selectTab(name)}>{name}{count !== "" && <em>{count}</em>}</button>)}</nav>

          <div className="by-entity-summary-grid">
            <article><strong>公司概况</strong><p>{companyName}<br />{company.industryTags.slice(0, 2).join(" · ") || "基础信息待补充"}<br />{company.description}</p></article>
            <article><strong>产品 / 技术路径</strong><p>{company.latestMaterialAnalysis?.sections?.find((item) => /(?:产品|技术)/u.test(item.title))?.summary || company.description || "产品与技术路径待材料确认"}</p></article>
            <article><strong>行业 / 赛道</strong><p>{company.industryTags.join(" / ") || "产业位置待确认"}</p></article>
            <article><strong>融资信息</strong><p>{company.latestMaterialAnalysis?.sections?.find((item) => /(?:融资|财务|股权)/u.test(item.title))?.summary || "轮次、金额与估值待材料确认"}</p></article>
          </div>
        </header>

        {(pending.length > 0 || conflicts.length > 0) && <button className="by-company-warning by-entity-warning" onClick={() => selectTab("待确认")}><AlertTriangle />{pending.length} 条待确认候选需要验证<span />{conflicts.length} 条知识冲突需要处理<ChevronRight /></button>}

        {tab === "画像" && <EntityPortraitDashboard company={company} confirmed={confirmed} pending={pending} owner={data.user.name} />}
        {tab === "尽调与决策" && <EntityDiligencePanel company={company} />}
        {tab === "日志" && <EntityLogPanel company={company} />}
        {tab === "材料" && <CompanyMaterials company={company} uploading={uploading} onUpload={() => fileInput.current?.click()} />}
        {tab === "已确认知识" && <CompanyClaims claims={confirmed} title="已确认知识" />}
        {tab === "待确认" && <CompanyClaims claims={pending} title="待确认候选知识" />}
        {tab === "产业关系" && <IndustryLane company={company} expanded />}
      </section>
      <CompanyCopilot company={company} open={copilotOpen} onToggle={() => setCopilotOpen((current) => !current)} onOpenWorkbench={() => navigate(`/?companyId=${encodeURIComponent(company.id)}`)} />
    </div>
  );
}

function CompanyCopilot({ company, open, onToggle, onOpenWorkbench }: { company: CompanyView; open: boolean; onToggle: () => void; onOpenWorkbench: () => void }) {
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState<CompanyCopilotThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const messageList = useRef<HTMLDivElement>(null);
  const sendController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    sendController.current?.abort();
    setQuestion("");
    setThread(null);
    setLoading(true);
    setSending(false);
    setError("");
    void defaultCompanyCopilotClient.getThread(company.id, controller.signal)
      .then((response) => setThread(response))
      .catch((loadError: unknown) => {
        if ((loadError as Error).name !== "AbortError") {
          setError(loadError instanceof Error ? loadError.message : "Copilot 对话加载失败，请重试");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [company.id, reloadVersion]);

  useEffect(() => () => sendController.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const list = messageList.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [open, sending, thread?.messages]);

  const submit = async () => {
    const nextQuestion = question.trim();
    if (!nextQuestion || loading || sending) return;

    const previousThread = thread;
    const optimisticMessage: CompanyCopilotMessage = {
      messageId: `optimistic-${Date.now()}`,
      role: "user",
      content: nextQuestion,
      createdAt: new Date().toISOString(),
    };
    setThread((current) => ({
      threadId: current?.threadId || "",
      status: "running",
      messages: [...(current?.messages || []), optimisticMessage],
    }));
    setQuestion("");
    setError("");
    setSending(true);
    const controller = new AbortController();
    sendController.current?.abort();
    sendController.current = controller;
    try {
      const response = await defaultCompanyCopilotClient.sendMessage(
        company.id,
        nextQuestion,
        controller.signal,
      );
      setThread(response);
    } catch (sendError) {
      if ((sendError as Error).name !== "AbortError") {
        setThread(previousThread);
        setQuestion(nextQuestion);
        setError(sendError instanceof Error ? sendError.message : "消息发送失败，请重试");
      }
    } finally {
      if (!controller.signal.aborted) setSending(false);
    }
  };
  const suggestions = ["总结核心亮点", "列出主要风险", "生成尽调问题"];
  if (!open) {
    return (
      <aside className="by-company-copilot collapsed" aria-label="公司 Copilot">
        <button className="by-copilot-rail" aria-label="展开公司 Copilot" aria-expanded="false" title="展开 Company Copilot" onClick={onToggle}><Bot /><span>Copilot</span><PanelRightOpen /></button>
      </aside>
    );
  }
  const messages = thread?.messages || [];
  return (
    <aside className="by-company-copilot" aria-label="公司 Copilot" aria-busy={loading || sending}>
      <header><div><Bot /><span><strong>Company Copilot</strong><small>{loading ? "正在连接当前公司…" : thread?.threadId ? "已连接当前公司 · 对话自动保存" : "已连接当前公司"}</small></span></div><div className="by-copilot-header-actions"><em>{sending ? "思考中" : "连续对话"}</em><button aria-label="收起公司 Copilot" aria-expanded="true" title="收起 Company Copilot" onClick={onToggle}><PanelRightClose /></button></div></header>
      <section className="by-copilot-context"><span>当前实体</span><strong>{company.standardName}</strong><p>{company.materialCount} 份材料 · {company.knowledgeCount} 条已确认知识 · {company.pendingCandidateCount} 条待确认</p></section>
      <div className="by-copilot-messages" ref={messageList} role="log" aria-live="polite" aria-relevant="additions text">
        {!messages.length && <article className="assistant"><span>AI</span><p>我已连接 {company.standardName} 的页面上下文、材料与知识。你可以直接问我投资判断相关问题。</p></article>}
        {loading && <p className="by-copilot-state" role="status">正在恢复历史对话…</p>}
        {messages.map((message) => <article className={message.role} key={message.messageId}><span>{message.role === "assistant" ? "AI" : "你"}</span><p>{message.content}</p></article>)}
        {sending && <article className="assistant pending"><span>AI</span><p role="status">问题已记录，正在结合当前公司的上下文思考…</p></article>}
        {error && <div className="by-copilot-error" role="alert"><p>{error}</p>{!messages.length && <button type="button" onClick={() => setReloadVersion((current) => current + 1)}>重新连接</button>}</div>}
      </div>
      <div className="by-copilot-suggestions">{suggestions.map((item) => <button type="button" disabled={loading || sending} key={item} onClick={() => setQuestion(item)}>{item}</button>)}</div>
      <div className="by-copilot-composer"><textarea aria-label="向公司 Copilot 提问" value={question} disabled={loading || sending} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} placeholder={loading ? "正在连接…" : sending ? "等待回答后继续提问…" : "围绕当前公司提问…"} /><button type="button" aria-label={sending ? "Copilot 正在生成回答" : "发送给公司 Copilot"} disabled={!question.trim() || loading || sending} onClick={() => void submit()}><SendHorizontal /></button></div>
      <button className="by-copilot-workbench" onClick={onOpenWorkbench}>在研究工作台继续<ArrowRight /></button>
    </aside>
  );
}

interface PersonCardView {
  id: string;
  name: string;
  role: string;
  summary: string;
  sourceLabel: string;
  evidence: Array<{ id: string; quote: string; source: string }>;
  status: "extracted" | "confirmed";
}

function EntityPortraitDashboard({ company, confirmed, pending, owner }: { company: CompanyView; confirmed: Claim[]; pending: Claim[]; owner: string }) {
  const [selectedPerson, setSelectedPerson] = useState<PersonCardView | null>(null);
  const personDialogClose = useRef<HTMLButtonElement>(null);
  const personTrigger = useRef<HTMLButtonElement | null>(null);
  const panorama = relationPanorama(company);
  const downstreamAndCustomers = [...panorama.customers, ...panorama.downstream];
  const gaps = materialInformationGaps(company);
  const questions = uniqueStrings([
    ...gaps.map((item) => item.title),
    ...pending.map((item) => item.text),
    ...company.researchRecords.map((item) => item.intent),
  ]).slice(0, 8);
  const highlights = confirmed.slice(0, 4);
  const teamClaims = confirmed.filter((item) => /(?:团队|创始|高管|人物|董事|管理)/u.test(item.category + item.text)).slice(0, 3);
  const extractedPeople: PersonCardView[] = company.people.slice(0, 6).map((person) => ({
    id: person.personId,
    name: person.name,
    role: person.role,
    summary: person.summary,
    sourceLabel: unverifiedSourceLabel(person.sourceLabel),
    evidence: person.evidence.map((evidence) => ({
      id: evidence.evidenceId,
      quote: evidence.quote,
      source: [evidence.fileName || evidence.title || evidence.site || "材料证据", evidence.page ? `第 ${evidence.page} 页` : ""].filter(Boolean).join(" · "),
    })),
    status: "extracted",
  }));
  const fallbackPeople: PersonCardView[] = teamClaims.map((item, index) => {
    const [name, role = "核心人物"] = teamRole(item, index).split(" · ");
    return {
      id: item.id,
      name,
      role,
      summary: item.text,
      sourceLabel: "已确认知识",
      evidence: item.evidenceIds.map((evidenceId) => {
        const evidence = company.evidence.find((candidate) => candidate.id === evidenceId);
        return {
          id: evidenceId,
          quote: evidence?.excerpt || item.text,
          source: evidence?.fileName || "已确认知识证据",
        };
      }),
      status: "confirmed",
    };
  });
  const people = extractedPeople.length > 0 ? extractedPeople : fallbackPeople;
  const marketSummary = company.latestMaterialAnalysis?.sections?.find((item) => /(?:市场|行业|竞争)/u.test(item.title))?.summary;
  const financingSummary = company.latestMaterialAnalysis?.sections?.find((item) => /(?:融资|财务|股权|估值)/u.test(item.title))?.summary;
  const latestMaterial = company.materials[0];

  useEffect(() => {
    if (!selectedPerson) return;
    const focusFrame = window.requestAnimationFrame(() => personDialogClose.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedPerson(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", closeOnEscape);
      if (personTrigger.current?.isConnected) personTrigger.current.focus();
    };
  }, [selectedPerson]);

  return (
    <div className="by-entity-portrait">
      <section className="by-relation-panorama">
        <header>
          <h2>关联性全景</h2>
          <div><span>上游 {panorama.upstream.length}</span><ArrowRight /><strong>{company.standardName} · 本实体</strong><ArrowRight /><span>下游 / 客户 {downstreamAndCustomers.length}</span></div>
          <em>同层竞对 {panorama.competitors.length} · 非流向</em>
        </header>
        <div className="by-relation-columns">
          <RelationGroup title="上游" subtitle="输入 · 供给" items={panorama.upstream} empty="材料暂未披露上游关系" />
          <RelationGroup title="下游及客户" subtitle="客户 · 渠道 · 交付" items={downstreamAndCustomers} empty="材料暂未披露客户或下游关系" />
          <RelationGroup title="潜在竞对" subtitle="同层 · 替代" items={panorama.competitors} empty="材料暂未披露潜在竞对" />
        </div>
        <footer>来源说明 / 蓝色虚线=材料自陈、AI 提取未核验　青色=已确认企业关系　关系事实仅代表材料披露内容</footer>
      </section>

      <div className="by-entity-two-up">
        <section className="by-entity-card by-market-card">
          <h2>市场维度</h2>
          <p>{marketSummary || company.description || "尚未形成经证据确认的市场判断。"}</p>
          <small>行业与主体标签：{company.industryTags.join(" · ") || "待补充"}</small>
        </section>
        <section className="by-entity-card by-fund-card">
          <h2>基金匹配度</h2>
          <p>{financingSummary || `建议核对 ${company.industryTags.slice(0, 2).join(" / ") || "当前产业方向"} 与基金策略、阶段及地域约束。`}</p>
          <small>基金偏好数据待接入 · 当前不生成虚构匹配分</small>
        </section>
      </div>

      <div className="by-entity-decision-grid">
        <section className="by-entity-card by-highlight-card">
          <h2>亮点</h2>
          {highlights.length ? <ul>{highlights.map((item) => <li key={item.id}>{item.text}</li>)}</ul> : <p>暂无已确认亮点，请先完成材料分析与人工确认。</p>}
          <small>来源：已确认知识 · 内部材料</small>
        </section>
        <section className="by-entity-card by-risk-card">
          <h2>风险（AI 初步识别）</h2>
          {gaps.length || pending.length ? <ul>{[...gaps.map((item) => item.title), ...pending.map((item) => item.text)].slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul> : <p>当前材料未识别出明确风险，不等于无风险。</p>}
          <small>AI 初步识别 · 不构成投资判断</small>
        </section>
        <section className="by-entity-card by-question-card">
          <header><h2>建议尽调问题（{questions.length} 条）</h2><button>查看全部 {Math.max(questions.length, 8)} 条</button></header>
          {questions.length ? <ol>{questions.slice(0, 6).map((item) => <li key={item}>{item}</li>)}</ol> : <p>尚未生成尽调问题。可先上传 BP 或发起公司研究。</p>}
          <small>来源：AI 生成 · 待核验</small>
        </section>
      </div>

      <section className="by-entity-section by-team-section">
        <header className="by-team-heading"><div><h2>核心团队与人物关联</h2><p>从最新材料中提取人物、角色与履历线索；点击人物卡查看履历与原文证据。</p></div>{people.length > 0 && <span>{people.length} 位人物</span>}</header>
        {people.length > 0 ? <div className="by-team-grid">{people.map((person) => <button type="button" className={`by-person-card ${person.status}`} key={person.id} aria-haspopup="dialog" aria-label={`查看${person.name}的履历详情`} onClick={(event) => { personTrigger.current = event.currentTarget; setSelectedPerson(person); }}>
          <span className="by-person-card-heading"><i><UserRound /></i><span><strong>{person.name}</strong><em>{person.role}</em></span></span>
          <span className="by-person-card-summary">{person.summary}</span>
          <span className="by-person-card-footer" title={person.evidence[0]?.quote}><span>{person.sourceLabel}</span><small>{person.evidence.length} 条证据 · 查看履历</small></span>
        </button>)}</div> : <div className="by-entity-empty">暂无从材料中提取的核心团队与人物信息。</div>}
      </section>

      <section className="by-entity-section by-access-history">
        <header><div><h2>访问记录</h2><p>团队成员围绕本实体的浏览、上传和研究动态。</p></div><span>模拟数据</span></header>
        <div className="by-access-list">
          <article><i>张</i><div><strong>张三</strong><span>上传了 BP《{latestMaterial?.fileName || `${company.standardName}商业计划书.pdf`}》</span></div><time>今天 10:32</time></article>
          <article><i>李</i><div><strong>李四</strong><span>浏览过公司实体页</span></div><time>今天 09:18</time></article>
          <article><i>王</i><div><strong>王五</strong><span>查看了关联性全景</span></div><time>昨天 16:45</time></article>
          <article><i>赵</i><div><strong>赵六</strong><span>发起了一次公司研究</span></div><time>08月30日</time></article>
        </div>
        <small>当前为演示记录；正式接入后将展示 {owner} 及其他成员的真实访问动态。</small>
      </section>

      <section className="by-entity-reserved by-external-research">
        <header><div><h2>外部情报与行研</h2><p>工商 / 新闻 / 舆情 + 行业研究将在此汇总，并注入市场 / 风险 / 关联维度。</p></div></header>
        <div>
          <article><strong>[外部网] 新闻 / 舆情</strong>{company.evidence.slice(0, 2).map((item) => <p key={item.id}>{item.excerpt}<small>{item.fileName}{item.page ? ` · 第 ${item.page} 页` : ""}</small></p>)}{!company.evidence.length && <p>暂无外部证据</p>}</article>
          <article><strong>[行业研究] 行研对照</strong>{company.researchRecords.slice(0, 2).map((item) => <p key={item.runId}>{item.intent}<small>{platformTaskStatus(item.status)} · {relativeDate(item.updatedAt)}</small></p>)}{!company.researchRecords.length && <p>暂无研究记录</p>}</article>
        </div>
      </section>

      <EntityDiligencePanel company={company} embedded />

      <details className="by-entity-analysis-details">
        <summary>最近材料分析详情（原始 13 维度）</summary>
        <MaterialAnalysisOverview company={company} />
      </details>

      {selectedPerson && <div className="by-person-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPerson(null); }}>
        <section className="by-person-dialog" role="dialog" aria-modal="true" aria-labelledby="by-person-dialog-title" aria-describedby="by-person-dialog-summary">
          <header><h2 id="by-person-dialog-title">{selectedPerson.name} · 履历详情</h2><button type="button" ref={personDialogClose} aria-label="关闭人物履历详情" onClick={() => setSelectedPerson(null)}><X /></button></header>
          <div className="by-person-dialog-profile"><i><UserRound /></i><div><strong>{selectedPerson.name} · {selectedPerson.role}</strong><p id="by-person-dialog-summary">{selectedPerson.summary}</p></div></div>
          <div className="by-person-dialog-grid">
            <article><strong>院所 / 公司关联</strong><p>与 {company.standardName} 关联：{selectedPerson.role}。其他院所或公司关联当前材料未提供。</p></article>
            <article><strong>拜访记录</strong><p>暂无拜访记录。</p></article>
            <article><strong>浅层核验</strong><p>材料自陈，需进一步核验。</p></article>
            <article><strong>内部资料库关联</strong><p>暂无可展示的跨项目人物关联。</p></article>
          </div>
          <section className="by-person-dialog-evidence" aria-label="人物来源与证据"><header><h3>来源与证据</h3><span>{selectedPerson.sourceLabel}</span></header>{selectedPerson.evidence.length > 0 ? selectedPerson.evidence.map((evidence) => <article key={evidence.id}><strong>{evidence.source}</strong><p>{evidence.quote}</p></article>) : <p>当前材料未提供可展开的原文证据。</p>}</section>
          <footer><button type="button" onClick={() => setSelectedPerson(null)}>关闭</button></footer>
        </section>
      </div>}

    </div>
  );
}

type RelationPanoramaCategory = CompanyView["relationInsights"][number]["category"];

interface RelationPanoramaItem {
  id: string;
  targetName: string;
  category: RelationPanoramaCategory;
  relationType: string;
  description: string;
  sourceLabel: string;
  evidenceCount: number;
  evidencePreview?: string;
  companyId?: string;
  status: CompanyView["relations"][number]["status"] | "extracted";
}

function relationPanorama(company: CompanyView): {
  upstream: RelationPanoramaItem[];
  downstream: RelationPanoramaItem[];
  customers: RelationPanoramaItem[];
  competitors: RelationPanoramaItem[];
} {
  const insights: RelationPanoramaItem[] = company.relationInsights.map((item) => ({
    id: item.insightId,
    targetName: item.targetName,
    category: item.category,
    relationType: item.relationType,
    description: item.description,
    sourceLabel: item.sourceLabel || "材料自陈",
    evidenceCount: item.evidence.length,
    ...(item.evidence[0]?.quote ? { evidencePreview: item.evidence[0].quote } : {}),
    status: "extracted",
  }));
  const confirmedRelations: RelationPanoramaItem[] = company.relations.map((item) => ({
    id: item.relationId,
    targetName: item.company.canonicalName,
    category: relationCategory(item),
    relationType: item.relationType,
    description: item.evidence?.quote || `${company.standardName}与${item.company.canonicalName}存在${item.relationType}关系。`,
    sourceLabel: item.evidence?.sourceType === "web" ? "外部来源" : item.evidence ? "材料证据" : "企业关系库",
    evidenceCount: item.evidence ? 1 : 0,
    ...(item.evidence?.quote ? { evidencePreview: item.evidence.quote } : {}),
    companyId: item.company.companyId,
    status: item.status,
  }));
  const pick = (category: RelationPanoramaCategory) => {
    const extracted = insights.filter((item) => item.category === category);
    const confirmed = confirmedRelations.filter((item) => item.category === category);
    return [...new Map([...extracted, ...confirmed].map((item) => [
      `${item.targetName.trim().toLocaleLowerCase()}\u0000${item.relationType.trim().toLocaleLowerCase()}`,
      item,
    ])).values()];
  };
  return {
    upstream: pick("upstream"),
    downstream: pick("downstream"),
    customers: pick("customer"),
    competitors: pick("competitor"),
  };
}

function relationCategory(relation: CompanyView["relations"][number]): RelationPanoramaCategory {
  if (/(?:竞争|竞品|替代|同层)/u.test(relation.relationType)) return "competitor";
  if (/(?:客户|采购|订单)/u.test(relation.relationType)) return "customer";
  if (/(?:供应|上游|原料|设备|技术提供)/u.test(relation.relationType)) return "upstream";
  if (/(?:下游|渠道|经销|交付|合作伙伴)/u.test(relation.relationType)) return "downstream";
  return relation.direction === "incoming" ? "upstream" : "downstream";
}

function relationCategoryLabel(category: RelationPanoramaCategory): string {
  if (category === "upstream") return "上游";
  if (category === "customer") return "客户";
  if (category === "downstream") return "下游";
  return "竞对";
}

function unverifiedSourceLabel(sourceLabel: string): string {
  const normalized = sourceLabel.trim();
  const labels: string[] = [];
  if (!/(?:材料|BP)/iu.test(normalized)) labels.push("材料自陈");
  if (normalized) labels.push(normalized);
  if (!/AI\s*提取/iu.test(normalized)) labels.push("AI 提取");
  if (!/未核验/u.test(normalized)) labels.push("未核验");
  return labels.join(" · ");
}

function RelationGroup({ title, subtitle, items, empty }: { title: string; subtitle: string; items: RelationPanoramaItem[]; empty: string }) {
  return <section><header><h3>{title}</h3><span>{subtitle}</span></header><div className="by-relation-list">{items.length ? items.slice(0, 6).map((item) => <article className={`by-relation-item ${item.status}`} key={item.id} title={item.evidencePreview}>
    <div>{item.companyId ? <Link to={`/companies/${item.companyId}`}>{item.targetName}</Link> : <strong>{item.targetName}</strong>}<em>{item.relationType}</em></div>
    <p>{item.description}</p>
    <small><span>{relationCategoryLabel(item.category)}</span>{item.status === "extracted" ? unverifiedSourceLabel(item.sourceLabel) : `${item.sourceLabel}${item.status === "confirmed" ? " · 已确认" : " · 待确认"}`}{item.evidenceCount > 0 ? ` · ${item.evidenceCount} 条证据` : ""}</small>
  </article>) : <p className="by-relation-empty">{empty}</p>}</div></section>;
}

function EntityDiligencePanel({ company, embedded = false }: { company: CompanyView; embedded?: boolean }) {
  const gaps = materialInformationGaps(company);
  const latest = company.materials[0];
  return (
    <section className={`by-entity-reserved by-diligence-panel ${embedded ? "embedded" : ""}`}>
      <header><div><h2>尽调与决策</h2><p>工商核验、尽调材料、访谈记录、立项意见、风控意见、IC 纪要将在此汇总。</p></div></header>
      <article><strong>[尽调材料]</strong><p>{latest ? latest.fileName : "尚无尽调材料"}</p><small>{gaps[0]?.title || "项目推进后，可在此记录核验结论与原文。"}</small></article>
    </section>
  );
}

function EntityLogPanel({ company }: { company: CompanyView }) {
  return (
    <section className="by-tab-panel by-entity-log-panel">
      <header><div><h2>实体日志</h2><p>跨文档导入、研究任务与更新事件按时间累积。</p></div></header>
      {[...company.materials.map((item) => ({ id: item.documentId, at: item.updatedAt, title: `导入 ${item.fileName}`, detail: materialStatusLabel(item.status) })), ...company.researchRecords.map((item) => ({ id: item.runId, at: item.updatedAt, title: item.intent, detail: platformTaskStatus(item.status) }))].sort((a, b) => +new Date(b.at) - +new Date(a.at)).map((item) => <article key={item.id}><time>{new Date(item.at).toLocaleString("zh-CN")}</time><strong>{item.title}</strong><span>{item.detail}</span></article>)}
      {!company.materials.length && !company.researchRecords.length && <div className="by-inline-empty">暂无日志</div>}
    </section>
  );
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function teamRole(claim: Claim, index: number): string {
  const match = claim.text.match(/([\u4e00-\u9fa5A-Za-z·]{2,12})[\s·・]*(CEO|CTO|COO|CFO|创始人|董事长|总经理)/u);
  return match ? `${match[1]} · ${match[2]}` : `核心人物 ${index + 1}`;
}

function CompanyDirectory({ companies, activeId }: { companies: CompanyView[]; activeId: string }) {
  return (
    <aside className="by-company-directory">
      <Link to="/companies"><ArrowLeft />返回主体列表</Link>
      <label><Search /><input placeholder="搜索研究主体" /></label>
      <div className="by-company-mini-list">{companies.map((company) => {
        return <Link className={company.id === activeId ? "active" : ""} to={`/companies/${company.id}`} key={company.id}><CompanyMark company={company} /><span><strong>{company.standardName}</strong><small>{company.cognitionStatus} · {company.materialCount} 份材料</small></span>{company.pendingCandidateCount > 0 && <em>{company.pendingCandidateCount}</em>}</Link>;
      })}</div>
      <Link className="by-company-all-link" to="/companies">查看全部主体<ChevronRight /></Link>
    </aside>
  );
}

function KnowledgeRow({ icon, category, claim, evidenceCount }: { icon: React.ReactNode; category: string; claim?: Claim; evidenceCount: number }) {
  return (
    <article className="by-knowledge-row"><span>{icon}</span><div><h3>{category}</h3><p>{claim?.text || "暂无经过确认的主体知识。"}</p><small>证据来源 {evidenceCount} · 最后确认 {claim?.eventTime || "待补充"}</small></div>{claim && <button>查看 {evidenceCount} 条证据<ChevronRight /></button>}</article>
  );
}

function MaterialAnalysisOverview({ company }: { company: CompanyView }) {
  const analysis = company.latestMaterialAnalysis;
  const sections = analysis?.sections || [];
  return (
    <section className="by-confirmed-overview">
      <header><h2>最近材料分析</h2><span className={company.analysisStatus.tone}><FileSearch />{company.analysisStatus.label}</span></header>
      {!analysis ? (
        <div className="by-inline-empty">暂无材料分析结果</div>
      ) : (
        <>
          <article className="by-knowledge-row"><span><FileText /></span><div><h3>{analysis.fileName}</h3><p>{analysis.summary || company.description}</p><small>材料分析摘要 · 不等于主体正式知识 · {analysis.sectionCount} 个维度</small></div></article>
          {sections.map((section) => (
            <article className="by-knowledge-row by-material-analysis-section" key={section.key}>
              <span><FileSearch /></span>
              <div><h3>{section.title}</h3><p>{section.summary || "材料未形成可展示摘要。"}</p><small>材料分析结果 · 待人工确认 · {section.evidence.length} 条证据</small></div>
            </article>
          ))}
          {!sections.length && <div className="by-inline-empty">{analysis.sectionCount > 0 ? `${analysis.sectionCount} 个分析维度正在准备展示` : "暂无可展示的分析维度"}</div>}
        </>
      )}
    </section>
  );
}

function materialInformationGaps(company: CompanyView): Array<{ icon: React.ReactNode; title: string; meta: string }> {
  return (company.latestMaterialAnalysis?.sections || [])
    .filter((section) => /(?:材料未披露|未披露|证据不足|待验证|尚未明确|未明确|未提供|暂无数据)/u.test(section.summary))
    .map((section) => ({
      icon: <AlertTriangle />,
      title: section.summary,
      meta: `${section.title} · ${section.evidence.length} 条证据`,
    }));
}

function subjectKindLabel(kind: SubjectKindV1): string {
  return {
    legal_company: "法律公司",
    project: "项目 / 产品 / 技术",
    institution: "机构",
    team: "团队",
    unknown: "尚未识别",
  }[kind];
}

function IndustryLane({ company, expanded = false }: { company: CompanyView; expanded?: boolean }) {
  const upstream = company.relations.filter((item) => item.status === "confirmed" && item.direction === "incoming").slice(0, expanded ? 5 : 3);
  const downstream = company.relations.filter((item) => item.status === "confirmed" && item.direction === "outgoing").slice(0, expanded ? 5 : 3);
  const placement = company.industryPlacements.find((item) => item.status === "confirmed") || company.industryPlacements[0];
  return (
    <section className={`by-industry-lane ${expanded ? "expanded" : ""}`}>
      <header><div><h2>产业位置</h2><p>实线为已确认关系，虚线为待确认建议</p></div><button><Network />查看完整关系</button></header>
      <div className="by-lane-grid">
        <div><span>上游供应商 · 已确认</span>{upstream.length ? upstream.map((item) => <button key={item.relationId}>{item.company.canonicalName}<small>{item.relationType}</small></button>) : <button>暂无已归档关系<small>等待补充证据</small></button>}</div>
        <ArrowRight />
        <div className="center"><strong>{company.standardName}</strong><span>{placement?.industryName || "产业位置待确认"}</span><small>{placement?.positionLabel || "等待补充证据"}</small></div>
        <ArrowRight />
        <div><span>下游客户 / 生态 · 已确认</span>{downstream.length ? downstream.map((item) => <button key={item.relationId}>{item.company.canonicalName}<small>{item.relationType}</small></button>) : <button>暂无已归档关系<small>等待补充证据</small></button>}</div>
        <div className="candidate"><span>潜在关联 · 待确认</span>{company.relations.filter((item) => item.status !== "confirmed").slice(0, 2).map((item) => <button key={item.relationId}>{item.company.canonicalName}</button>)}{!company.relations.some((item) => item.status !== "confirmed") && <button>暂无待确认关系</button>}</div>
      </div>
    </section>
  );
}

function FeedbackCarousel({ tasks, index, onIndex }: { tasks: Bootstrap["tasks"]; index: number; onIndex: (index: number) => void }) {
  if (!tasks.length) {
    return <section className="by-feedback-carousel"><header><h2>最近研究</h2></header><div className="by-inline-empty">暂无研究记录</div></section>;
  }
  const item = tasks[index % tasks.length];
  return (
    <section className="by-feedback-carousel"><header><h2>最近研究</h2><div><button aria-label="上一条" onClick={() => onIndex((index - 1 + tasks.length) % tasks.length)}><ChevronLeft /></button><button aria-label="下一条" onClick={() => onIndex((index + 1) % tasks.length)}><ChevronRight /></button></div></header><article><span><Sparkles /></span><p>{item.query}</p><small>{item.status} · {relativeDate(item.createdAt)}</small></article><div>{tasks.map((row, itemIndex) => <i className={itemIndex === index % tasks.length ? "active" : ""} key={row.id} />)}</div></section>
  );
}

function SupportList({ title, action, rows, emptyText }: { title: string; action?: string; rows: Array<{ icon: React.ReactNode; title: string; meta: string }>; emptyText?: string }) {
  return <section className="by-support-list"><header><h2>{title}</h2>{action && <button>{action}<ChevronRight /></button>}</header>{rows.map((row, index) => <button key={`${row.title}-${index}`}><span>{row.icon}</span><div><strong>{row.title}</strong><small>{row.meta}</small></div><ChevronRight /></button>)}{!rows.length && emptyText && <div className="by-inline-empty">{emptyText}</div>}</section>;
}

function CompanyMaterials({ company, uploading, onUpload }: { company: CompanyView; uploading: boolean; onUpload: () => void }) {
  return <section className="by-tab-panel"><header><div><h2>主体材料</h2><p>原始材料按权限归档，抽取内容仍需确认。</p></div><button className="primary" disabled={uploading} onClick={onUpload}><Upload />{uploading ? "处理中…" : "上传材料"}</button></header><div className="by-material-table"><div className="head"><span>文件</span><span>来源</span><span>时间</span><span>权限</span><span>状态</span></div>{company.materials.map((item) => <button key={item.documentId}><span><FileText /><strong>{item.fileName}</strong></span><span>{item.sourceChannel === "feishu" ? "飞书" : item.sourceChannel === "wecom" ? "企业微信" : "网页上传"}</span><span>{relativeDate(item.updatedAt)}</span><span><ShieldCheck />机构</span><span className={item.status === "completed" ? "success" : "warning"}>{materialStatusLabel(item.status)}</span></button>)}</div></section>;
}

function CompanyClaims({ claims, title }: { claims: Claim[]; title: string }) {
  return <section className="by-tab-panel"><header><div><h2>{title}</h2><p>每条陈述都保留来源、版本和处理记录。</p></div></header><div className="by-claim-table">{claims.length ? claims.map((claim) => <article key={claim.id}><header><span>{claim.category}</span><em className={claim.status}>{claim.status}</em></header><p>{claim.text}</p><footer><span><FileSearch />{claim.evidenceIds.length} 条证据</span><span>版本 {claim.version}</span><button>{claim.status === "confirmed" ? "查看证据" : "开始确认"}<ChevronRight /></button></footer></article>) : <div className="by-inline-empty">暂无符合条件的知识陈述</div>}</div></section>;
}

function CompanyResearch({ company, onResearch }: { company: CompanyView; onResearch: () => void }) {
  return <section className="by-tab-panel"><header><div><h2>研究记录</h2><p>复用历史任务上下文，减少重复上传和解释。</p></div><button className="primary" onClick={onResearch}><Sparkles />发起公司研究</button></header><div className="by-research-list">{company.researchRecords.map((record) => <button key={record.runId}><span><Sparkles /></span><div><strong>{record.intent}</strong><small>研究平台 · {relativeDate(record.updatedAt)}</small></div><em>{platformTaskStatus(record.status)}</em><ChevronRight /></button>)}</div></section>;
}

export function CompanyImportPage({ data: _data, reload, companyListClient = defaultCompanyListClient }: { data: Bootstrap; reload: () => void; companyListClient?: CompanyListClient }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const actionController = useRef<AbortController | null>(null);
  const [result, setResult] = useState<CompanyListRecordV1 | null>(null);
  const [companySelections, setCompanySelections] = useState<Record<string, string>>({});
  const [nameCorrections, setNameCorrections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const rowsToConfirm = useMemo(
    () => resolveCompanyListRows(result?.rows || [], companySelections, nameCorrections),
    [companySelections, nameCorrections, result],
  );
  useEffect(() => () => actionController.current?.abort(), []);
  const importFile = async (file?: File) => {
    if (!file) return;
    actionController.current?.abort();
    const controller = new AbortController();
    actionController.current = controller;
    setBusy(true);
    setNotice(`正在识别 ${file.name}…`);
    setResult(null);
    setCompanySelections({});
    setNameCorrections({});
    try {
      const uploaded = await companyListClient.upload(file, controller.signal);
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const conversation = await companyListClient.getConversation(
          uploaded.conversation.conversationId,
          controller.signal,
        );
        if (conversation.companyList) {
          setResult(conversation.companyList);
          setNotice("名单识别完成，请确认可建立的公司主体");
          return;
        }
        if (conversation.status === "failed") {
          throw new Error("名单识别失败，请检查文件内容");
        }
        await abortableDelay(500, controller.signal);
      }
      setNotice("名单已上传，后台仍在处理中");
    } catch (error) {
      if ((error as Error).name !== "AbortError") setNotice(error instanceof Error ? error.message : "名单导入失败");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  const confirmRows = async () => {
    if (!result) return;
    const rows = rowsToConfirm;
    if (!rows.length) {
      setNotice("请选择同名公司主体，或修正识别失败的公司名称");
      return;
    }
    actionController.current?.abort();
    const controller = new AbortController();
    actionController.current = controller;
    setBusy(true);
    setNotice("正在写入公司档案…");
    try {
      const updated = await companyListClient.confirm(result.listId, rows, controller.signal);
      setResult(updated);
      setCompanySelections({});
      setNameCorrections({});
      setNotice(`已确认 ${rows.length} 家公司并写入档案`);
      reload();
    } catch (error) {
      if ((error as Error).name !== "AbortError") setNotice(error instanceof Error ? error.message : "名单确认失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="by-import-page"><header><button onClick={() => navigate("/companies")}><ArrowLeft />返回公司</button><div><span>公司名单处理</span><h1>批量识别并建立公司主体</h1><p>原始名单始终保留；系统会区分已有、新建、同名待确认和识别失败。</p></div></header><div className="by-import-drop"><ListChecks /><h2>{busy ? "正在处理名单…" : "上传公司名单"}</h2><p>支持 CSV 和 XLSX 文件。上传后可确认主体，再选择重点公司发起研究。</p><button className="primary" disabled={busy} onClick={() => inputRef.current?.click()}><Upload />选择文件</button><input ref={inputRef} hidden type="file" accept=".csv,.xlsx" onChange={(event) => void importFile(event.target.files?.[0])} /></div>{notice && <p role="status">{notice}</p>}{result && <div className="by-import-result"><header><h2>识别结果</h2><span>共 {result.rows.length} 行</span></header><div className="by-import-stats"><span><strong>{result.rows.filter((item) => item.matchStatus === "existing").length}</strong>已有公司</span><span><strong>{result.rows.filter((item) => item.matchStatus === "new").length}</strong>新建公司</span><span><strong>{result.rows.filter((item) => item.matchStatus === "ambiguous").length}</strong>同名待确认</span><span><strong>{result.rows.filter((item) => item.matchStatus === "failed").length}</strong>识别失败</span></div>{result.rows.map((item) => <CompanyImportRow row={item} busy={busy} selectedCompanyId={companySelections[item.rowId] || ""} correctedName={nameCorrections[item.rowId] || ""} key={item.rowId} onSelectCompany={(companyId) => setCompanySelections((current) => ({ ...current, [item.rowId]: companyId }))} onCorrectName={(name) => setNameCorrections((current) => ({ ...current, [item.rowId]: name }))} onResearch={(companyId) => navigate(`/?companyId=${encodeURIComponent(companyId)}`)} />)}<button className="primary" disabled={busy || !rowsToConfirm.length} onClick={() => void confirmRows()}><Check />确认可识别公司并入库</button></div>}</section>
  );
}

function CompanyImportRow({ row, busy, selectedCompanyId, correctedName, onSelectCompany, onCorrectName, onResearch }: { row: CompanyListRowV1; busy: boolean; selectedCompanyId: string; correctedName: string; onSelectCompany: (companyId: string) => void; onCorrectName: (name: string) => void; onResearch: (companyId: string) => void }) {
  const selected = row.confirmationStatus === "confirmed" || isAutoConfirmableCompanyListRow(row) || Boolean(selectedCompanyId || correctedName.trim());
  return (
    <div className="by-import-row">
      <input type="checkbox" aria-label={`选择 ${row.originalValue}`} checked={selected} readOnly />
      <strong>{row.originalValue}</strong>
      <span>{row.company?.canonicalName || row.options.map((option) => option.canonicalName).join(" / ") || row.normalizedName || "等待选择主体"}</span>
      <em>{companyListRowStatus(row)}</em>
      {row.confirmationStatus === "confirmed" && row.company ? (
        <button disabled={busy} onClick={() => onResearch(row.company!.companyId)}><Sparkles />发起研究</button>
      ) : row.matchStatus === "ambiguous" ? (
        <select aria-label={`选择 ${row.originalValue} 的公司主体`} disabled={busy} value={selectedCompanyId} onChange={(event) => onSelectCompany(event.target.value)}>
          <option value="">选择公司主体</option>
          {row.options.map((option) => <option value={option.companyId} key={option.companyId}>{option.canonicalName}</option>)}
        </select>
      ) : row.matchStatus === "failed" ? (
        <input aria-label={`修正 ${row.originalValue} 的公司名称`} disabled={busy} value={correctedName} placeholder="输入正确公司全称" onChange={(event) => onCorrectName(event.target.value)} />
      ) : (
        <button disabled>无需处理</button>
      )}
    </div>
  );
}

function CompanyMark({ company }: { company: Company }) {
  return <span className="by-company-mark" aria-hidden="true">{company.standardName.slice(0, 1)}</span>;
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
  if (status === "cancelled") return "已取消";
  if (status === "pending_confirmation") return "待用户确认";
  return "生成中";
}

function materialStatusLabel(status: CompanyView["materials"][number]["status"]) {
  if (status === "completed") return "分析完成";
  if (status === "failed") return "处理失败";
  if (status === "cancelled") return "已取消";
  if (status === "pending_confirmation") return "待确认";
  if (status === "waiting") return "等待处理";
  return "处理中";
}

function isTerminalMaterialStatus(status: CompanyView["materials"][number]["status"]) {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "pending_confirmation";
}

function materialProcessingNotice(status: CompanyView["materials"][number]["status"]) {
  if (status === "failed") return "材料处理失败，请稍后重试";
  if (status === "cancelled") return "材料处理已取消";
  if (status === "pending_confirmation") return "材料分析完成，结果等待确认";
  return "材料处理完成，档案数量已刷新";
}

function abortableDelay(durationMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function relativeDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function isAutoConfirmableCompanyListRow(row: CompanyListRowV1) {
  return row.confirmationStatus === "pending" && (row.matchStatus === "existing" || row.matchStatus === "new");
}

function resolveCompanyListRows(rows: CompanyListRowV1[], companySelections: Record<string, string>, nameCorrections: Record<string, string>) {
  const resolved = confirmableCompanyListRows(rows);
  for (const row of rows) {
    if (row.confirmationStatus !== "pending") continue;
    const companyId = companySelections[row.rowId];
    const createName = nameCorrections[row.rowId]?.trim();
    if (row.matchStatus === "ambiguous" && companyId) {
      resolved.push({ rowId: row.rowId, expectedVersion: row.version, companyId });
    } else if (row.matchStatus === "failed" && createName) {
      resolved.push({ rowId: row.rowId, expectedVersion: row.version, createName });
    }
  }
  return resolved;
}

function companyListRowStatus(row: CompanyListRowV1) {
  if (row.confirmationStatus === "confirmed") return "已确认";
  if (row.matchStatus === "existing") return "已有公司";
  if (row.matchStatus === "new") return "待新建";
  if (row.matchStatus === "ambiguous") return "同名待确认";
  return "识别失败";
}
