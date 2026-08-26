import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  Check,
  ChevronRight,
  FileSearch,
  FileText,
  Filter,
  FolderTree,
  Globe2,
  Network,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError, type Bootstrap } from "../api";
import {
  createIndustryDirectoryClient,
  type IndustryDirectoryClient,
} from "../capabilities/industries/client";
import { ResearchPlatformApiError } from "../capabilities/platform-http";
import type { Company, IndustryNode } from "../types";
import type {
  IndustryDetailResponseV1,
  IndustryMaterialV1,
  ReviewEvidence,
} from "../../shared/research-platform-v1";

const defaultIndustryClient = createIndustryDirectoryClient();

export function IndustriesPage({
  data,
  reload,
  industryClient = defaultIndustryClient,
}: {
  data: Bootstrap;
  reload: () => void;
  industryClient?: IndustryDirectoryClient;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("最近更新");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisNotice, setAnalysisNotice] = useState("");
  const [details, setDetails] = useState<IndustryDetailResponseV1[] | null>(null);
  const [unclassifiedMaterialCount, setUnclassifiedMaterialCount] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    void industryClient.list(controller.signal)
      .then(async (directory) => {
        setUnclassifiedMaterialCount(directory.unclassifiedMaterialCount);
        return Promise.all(
          directory.items.map((item) => industryClient.get(item.industryId, controller.signal)),
        );
      })
      .then(setDetails)
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [industryClient, refreshKey]);

  const catalogData = useMemo(
    () => industryBootstrap(data, details || []),
    [data, details],
  );
  const roots = catalogData.industryNodes.filter(
    (node) => node.parentId === null || node.level === 0,
  );
  const visibleRoots = roots.length
    ? roots
    : catalogData.industryNodes.filter((node) => node.level === 1);
  const detailsById = new Map((details || []).map((detail) => [detail.industryId, detail]));
  const industries = visibleRoots
    .filter((node) => node.name.includes(query))
    .sort((a, b) => {
      const left = detailsById.get(a.id);
      const right = detailsById.get(b.id);
      if (sort === "材料数量") return (right?.materialCount || 0) - (left?.materialCount || 0);
      if (sort === "公司数量") return (right?.companyCount || 0) - (left?.companyCount || 0);
      return +new Date(right?.updatedAt || 0) - +new Date(left?.updatedAt || 0);
    });
  const pendingPositions = (details || []).flatMap((detail) => detail.companies)
    .filter((placement) => placement.status !== "confirmed").length;
  const canAnalyze = ["partner", "knowledge_admin", "system_admin"].includes(
    data.user.role,
  );
  const analyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalysisNotice("");
    try {
      const result = await api.analyzeIndustries();
      setAnalysisNotice(
        `${result.companies} 家公司已正式归类，形成 ${result.industries} 个行业和 ${result.stages} 个产业环节。${result.usedConfiguredModel ? `模型：${result.model}` : "当前未配置 GPT 密钥，本次使用 BP 证据规则完成正式初分。"}`,
      );
      reload();
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setAnalysisNotice(
        error instanceof ApiError
          ? error.message
          : "产业链分析失败，请稍后重试",
      );
    } finally {
      setAnalyzing(false);
    }
  };
  if (loadError) return <IndustryLoadState title="行业目录加载失败" />;
  if (!details) return <IndustryLoadState title="正在加载行业目录…" />;
  return (
    <div className="by-industry-index">
      <aside className="by-industry-sidebar">
        <header>
          <span>行业目录</span>
          <strong>{visibleRoots.length} 个一级行业</strong>
        </header>
        <label>
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索行业或产业节点"
          />
        </label>
        <nav>
          {visibleRoots.map((node) => (
            <button
              key={node.id}
              onClick={() => navigate(`/industry/${node.id}`)}
            >
              <span>{node.name}</span>
              <em>{detailsById.get(node.id)?.companyCount || 0}</em>
              <ChevronRight />
            </button>
          ))}
        </nav>
        <section>
          <h3>待处理</h3>
          <button>
            <FileSearch />
            待分类材料<em>{unclassifiedMaterialCount}</em>
          </button>
          <button>
            <Network />
            位置待确认<em>{pendingPositions}</em>
          </button>
        </section>
      </aside>
      <section className="by-industry-main">
        <header className="by-page-heading">
          <div>
            <span>行业知识入口</span>
            <h1>行业与产业链</h1>
            <p>基于已有 BP 建立正式行业分类、产业环节和公司映射。</p>
          </div>
          <div>
            <button>
              <Upload />
              上传行业材料
            </button>
            {canAnalyze && (
              <button
                className="primary"
                disabled={analyzing}
                onClick={() => void analyze()}
              >
                {analyzing ? <RefreshCw /> : <Sparkles />}
                {analyzing
                  ? "正在分析"
                  : details.length
                    ? "重新分析"
                    : "生成产业链"}
              </button>
            )}
          </div>
        </header>
        {analysisNotice && (
          <div className="by-industry-analysis-notice">
            <ShieldCheck />
            {analysisNotice}
          </div>
        )}
        <div className="by-directory-toolbar">
          <span>
            <Filter />
            按材料与公司活跃度浏览
          </span>
          <select
            aria-label="行业排序"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option>最近更新</option>
            <option>材料数量</option>
            <option>公司数量</option>
          </select>
        </div>
        <div className="by-industry-cards">
          {industries.map((industry) => (
            <IndustryCard
              key={industry.id}
              industry={industry}
              data={catalogData}
              detail={detailsById.get(industry.id)}
              onOpen={() => navigate(`/industry/${industry.id}`)}
            />
          ))}
          {!industries.length && (
            <section className="by-catalog-empty">
              <Globe2 />
              <h2>还没有行业资料</h2>
              <p>使用已有 BP 生成正式行业分类和产业链。</p>
              {canAnalyze ? (
                <button className="primary" onClick={() => void analyze()}>
                  <Sparkles />
                  生成产业链
                </button>
              ) : (
                <button className="primary">
                  <Upload />
                  上传行业材料
                </button>
              )}
            </section>
          )}
        </div>
        <section className="by-latest-materials">
          <header>
            <div>
              <h2>最新行业材料</h2>
              <p>材料是行业研究的一期主要入口。</p>
            </div>
            <button>
              查看全部
              <ChevronRight />
            </button>
          </header>
          <div>
            {details
              .flatMap((detail) =>
                detail.materials.map((material) => ({ material, industry: detail })),
              )
              .slice(0, 6)
              .map(({ material, industry }) => (
                <button key={`${industry.industryId}-${material.documentId}`}>
                  <FileText />
                  <span>
                    <strong>{material.fileName}</strong>
                    <small>
                      {industry.name} · {new Date(material.updatedAt).toLocaleDateString("zh-CN")}
                    </small>
                  </span>
                  <em>已分析</em>
                  <ChevronRight />
                </button>
              ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function IndustryCard({
  industry,
  data,
  detail,
  onOpen,
}: {
  industry: IndustryNode;
  data: Bootstrap;
  detail?: IndustryDetailResponseV1;
  onOpen: () => void;
}) {
  const children = data.industryNodes.filter(
    (node) => node.parentId === industry.id,
  );
  const companies = companiesForNode(data, industry.id);
  const materials = detail?.materialCount || 0;
  return (
    <article
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(event) => event.key === "Enter" && onOpen()}
    >
      <header>
        <span>
          <Globe2 />
        </span>
        <button aria-label="订阅行业">
          <Bell />
        </button>
      </header>
      <h2>{industry.name}</h2>
      <p>
        {industry.description ||
          "聚合 BP、公司和产业链位置，形成可持续研究的行业知识。"}
      </p>
      <div>
        {children.slice(0, 4).map((node) => (
          <span key={node.id}>{node.name}</span>
        ))}
      </div>
      <dl>
        <div>
          <dt>材料</dt>
          <dd>{materials}</dd>
        </div>
        <div>
          <dt>公司</dt>
          <dd>{detail?.companyCount || companies.length}</dd>
        </div>
        <div>
          <dt>产业环节</dt>
          <dd>{children.length}</dd>
        </div>
      </dl>
      <footer>
        <span>
          <ShieldCheck />
          正式知识
        </span>
        <button>
          进入行业
          <ArrowRight />
        </button>
      </footer>
    </article>
  );
}

export function IndustryDetailPage({ data, industryClient = defaultIndustryClient }: { data: Bootstrap; industryClient?: IndustryDirectoryClient }) {
  const { id } = useParams();
  const [detail, setDetail] = useState<IndustryDetailResponseV1 | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");

  useEffect(() => {
    if (!id) {
      setState("not-found");
      return;
    }
    const controller = new AbortController();
    setState("loading");
    void industryClient.get(id, controller.signal)
      .then((response) => {
        setDetail(response);
        setState("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState(error instanceof ResearchPlatformApiError && error.status === 404 ? "not-found" : "error");
      });
    return () => controller.abort();
  }, [id, industryClient]);

  if (state === "loading") return <IndustryLoadState title="正在加载行业资料…" />;
  if (state === "not-found") return <IndustryLoadState title="找不到这个行业" description="该行业可能不存在，或已经被合并。" />;
  if (state === "error" || !detail) return <IndustryLoadState title="行业资料加载失败" />;
  const persistentData = industryBootstrap(data, [detail]);
  return <IndustryDetailContent data={persistentData} detail={detail} industry={persistentData.industryNodes[0]} />;
}

function IndustryDetailContent({
  data,
  detail,
  industry,
}: {
  data: Bootstrap;
  detail: IndustryDetailResponseV1;
  industry: IndustryNode;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") === "chain" ? "产业链" : "概览");
  const descendants = useMemo(
    () => collectDescendants(data.industryNodes, industry.id),
    [data.industryNodes, industry.id],
  );
  const companies = data.companies.filter((company) =>
    company.positions.some((position) =>
      [industry.id, ...descendants.map((node) => node.id)].includes(
        position.nodeId,
      ),
    ),
  );
  const materials = detail.materials.map((material) => ({
    material,
    company: material.evidence
      ? companies.find((company) =>
          company.evidence.some(
            (evidence) => evidence.id === material.evidence?.evidenceId,
          ),
        )
      : undefined,
  }));
  const tabs = [
    ["概览", ""],
    ["材料", materials.length],
    ["产业链", descendants.length],
    ["公司", companies.length],
  ] as const;
  const selectTab = (name: (typeof tabs)[number][0]) => {
    setTab(name);
    const next = new URLSearchParams(searchParams);
    if (name === "产业链") next.set("tab", "chain");
    else next.delete("tab");
    setSearchParams(next, { replace: true });
  };
  return (
    <div className="by-industry-detail">
      <header>
        <button onClick={() => navigate("/industry")}>
          <ArrowLeft />
          返回行业
        </button>
        <div className="by-industry-title">
          <span>
            <Globe2 />
          </span>
          <div>
            <h1>{industry.name}</h1>
            <p>
              {industry.description ||
                "基于 BP 证据形成的正式行业知识与产业链。"}
            </p>
          </div>
        </div>
        <dl>
          <div>
            <dt>材料</dt>
            <dd>{materials.length}</dd>
          </div>
          <div>
            <dt>公司</dt>
            <dd>{companies.length}</dd>
          </div>
          <div>
            <dt>产业环节</dt>
            <dd>{descendants.filter((node) => node.level === 1).length}</dd>
          </div>
        </dl>
        <div>
          <button>
            <Bell />
            订阅更新
          </button>
          <button>
            <Upload />
            上传材料
          </button>
          <button className="primary">
            <Sparkles />
            发起研究
          </button>
        </div>
      </header>
      <nav className="by-detail-tabs">
        {tabs.map(([name, count]) => (
          <button
            className={tab === name ? "active" : ""}
            key={name}
            onClick={() => selectTab(name)}
          >
            {name}
            {count !== "" && <em>{count}</em>}
          </button>
        ))}
      </nav>
      {tab === "概览" && (
        <IndustryOverview
          industry={industry}
          data={data}
          companies={companies}
          materials={materials}
          onOpenTree={() => selectTab("产业链")}
        />
      )}
      {tab === "材料" && <IndustryMaterials materials={materials} />}
      {tab === "产业链" && (
        <IndustryTree industry={industry} nodes={descendants} data={data} />
      )}
      {tab === "公司" && <IndustryCompanies companies={companies} />}
    </div>
  );
}

function IndustryOverview({
  industry,
  data,
  companies,
  materials,
  onOpenTree,
}: {
  industry: IndustryNode;
  data: Bootstrap;
  companies: Company[];
  materials: Array<{ material: IndustryMaterialV1; company?: Company }>;
  onOpenTree: () => void;
}) {
  const children = data.industryNodes.filter(
    (node) => node.parentId === industry.id,
  );
  return (
    <div className="by-industry-overview">
      <section className="by-industry-material-focus">
        <header>
          <div>
            <h2>最近新增材料</h2>
            <p>点击材料进入对应分析对话。</p>
          </div>
          <button>
            查看全部
            <ChevronRight />
          </button>
        </header>
        {materials.slice(0, 5).map(({ material, company }) => (
          <button key={`${material.conversationId}-${material.documentId}`}>
            <FileText />
            <span>
              <strong>{material.fileName}</strong>
              <small>
                {company ? company.aliases[0] || company.standardName : "未关联公司"} ·{" "}
                {material.updatedAt}
              </small>
            </span>
            <em>
              <Check />
              已分析
            </em>
            <ChevronRight />
          </button>
        ))}
      </section>
      <aside>
        <section>
          <header>
            <h2>行业骨架</h2>
            <button onClick={onOpenTree}>查看产业链</button>
          </header>
          {children.slice(0, 6).map((node) => (
            <div key={node.id}>
              <FolderTree />
              <span>
                <strong>{node.name}</strong>
                <small>
                  {
                    companies.filter((company) =>
                      company.positions.some(
                        (position) => position.nodeId === node.id,
                      ),
                    ).length
                  }{" "}
                  家公司
                </small>
              </span>
            </div>
          ))}
        </section>
        <section>
          <header>
            <h2>重点公司</h2>
            <button>查看全部</button>
          </header>
          {companies.slice(0, 5).map((company) => (
            <Link to={`/companies/${company.id}`} key={company.id}>
              <Building2 />
              <span>
                <strong>{company.aliases[0] || company.standardName}</strong>
                <small>{company.evidence.length} 份材料</small>
              </span>
              <ChevronRight />
            </Link>
          ))}
        </section>
      </aside>
    </div>
  );
}

function IndustryMaterials({
  materials,
}: {
  materials: Array<{ material: IndustryMaterialV1; company?: Company }>;
}) {
  return (
    <section className="by-industry-material-page">
      <header>
        <label>
          <Search />
          <input placeholder="搜索行业材料" />
        </label>
        <button>
          <Filter />
          筛选
        </button>
        <button className="primary">
          <Upload />
          上传材料
        </button>
      </header>
      <div className="by-material-table">
        <div className="head">
          <span>材料</span>
          <span>类型</span>
          <span>来源</span>
          <span>关联公司</span>
          <span>处理状态</span>
        </div>
        {materials.map(({ material, company }) => (
          <button key={`${material.conversationId}-${material.documentId}`}>
            <span>
              <FileText />
              <strong>{material.fileName}</strong>
            </span>
            <span>行业材料</span>
            <span>{material.updatedAt}</span>
            <span>{company ? company.aliases[0] || company.standardName : "未关联公司"}</span>
            <span className="success">已分析</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function IndustryTree({
  industry,
  nodes,
  data,
}: {
  industry: IndustryNode;
  nodes: IndustryNode[];
  data: Bootstrap;
}) {
  const stages = nodes.filter((node) => node.level === 1);
  return (
    <section className="by-industry-tree">
      <header>
        <div>
          <h2>{industry.name}产业链</h2>
          <p>以下环节与公司位置来自已有 BP，已作为正式知识写入。</p>
        </div>
        <span className="by-formal-knowledge">
          <ShieldCheck />
          BP 正式知识
        </span>
      </header>
      <div className="by-chain-flow">
        {stages.map((node, index) => (
          <div className="by-chain-stage-wrap" key={node.id}>
            <article className="by-chain-stage">
              <header>
                <Network />
                <div>
                  <strong>{node.name}</strong>
                  <small>{node.description}</small>
                </div>
              </header>
              <div>
                {companiesForNode(data, node.id)
                  .slice(0, 8)
                  .map((company) => (
                    <Link to={`/companies/${company.id}`} key={company.id}>
                      <span>
                        {(company.aliases[0] || company.standardName).slice(
                          0,
                          1,
                        )}
                      </span>
                      <strong>
                        {company.aliases[0] || company.standardName}
                      </strong>
                      <ChevronRight />
                    </Link>
                  ))}
                {!companiesForNode(data, node.id).length && <p>暂无关联公司</p>}
              </div>
            </article>
            {index < stages.length - 1 && (
              <ArrowRight className="by-chain-arrow" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function IndustryCompanies({ companies }: { companies: Company[] }) {
  return (
    <section className="by-industry-company-list">
      <header>
        <div>
          <h2>行业公司</h2>
          <p>按产业位置、关注状态和材料数量浏览。</p>
        </div>
        <button>
          <Filter />
          筛选
        </button>
      </header>
      {companies.map((company) => (
        <Link to={`/companies/${company.id}`} key={company.id}>
          <span>
            <Building2 />
          </span>
          <div>
            <strong>{company.aliases[0] || company.standardName}</strong>
            <small>{company.description}</small>
          </div>
          <em>{company.evidence.length} 份材料</em>
          <ChevronRight />
        </Link>
      ))}
    </section>
  );
}

function companiesForNode(data: Bootstrap, nodeId: string) {
  const descendants = collectDescendants(data.industryNodes, nodeId).map(
    (node) => node.id,
  );
  return data.companies.filter((company) =>
    company.positions.some((position) =>
      [nodeId, ...descendants].includes(position.nodeId),
    ),
  );
}

function collectDescendants(nodes: IndustryNode[], id: string): IndustryNode[] {
  const children = nodes.filter((node) => node.parentId === id);
  return children.flatMap((child) => [
    child,
    ...collectDescendants(nodes, child.id),
  ]);
}

function industryBootstrap(
  data: Bootstrap,
  details: IndustryDetailResponseV1[],
): Bootstrap {
  const industryNodes = details.flatMap((detail) => [
    {
      id: detail.industryId,
      name: detail.name,
      parentId: null,
      level: 0,
      source: "研究平台 SQLite",
      status: detail.status === "active" ? "confirmed" as const : "candidate" as const,
      description: detail.summary,
      updatedAt: detail.updatedAt,
    },
    ...detail.nodes.map((node) => ({
      id: node.nodeId,
      name: node.name,
      parentId: detail.industryId,
      level: 1,
      source: "研究平台 SQLite",
      status: detail.status === "active" ? "confirmed" as const : "candidate" as const,
      description: node.description,
      updatedAt: detail.updatedAt,
    })),
  ]);
  const companies = new Map<string, Company>();

  for (const detail of details) {
    for (const placement of detail.companies) {
      const placementEvidence = placement.evidence;
      const relatedMaterials = placementEvidence
        ? detail.materials.filter(
            (material) =>
              material.evidence?.evidenceId === placementEvidence.evidenceId,
          )
        : [];
      const existing = companies.get(placement.company.companyId);
      const position = {
        nodeId: placement.nodeId || detail.industryId,
        positionType: "primary" as const,
        status: placement.status === "confirmed" ? "confirmed" as const : "candidate" as const,
        confidence: placement.status === "confirmed" ? 1 : 0,
        source: placementEvidence
          ? "internal_evidence" as const
          : "ai_recommendation" as const,
        sourceDate: detail.updatedAt,
        reason: placement.positionLabel,
      };
      const evidence = placementEvidence
        ? relatedMaterials.map((material) =>
            industryMaterialEvidence(material, placementEvidence),
          )
        : [];
      if (existing) {
        existing.positions.push(position);
        existing.evidence = uniqueCompanyEvidence([...existing.evidence, ...evidence]);
        existing.updatedAt = [existing.updatedAt, placement.company.updatedAt].sort().at(-1)!;
        continue;
      }
      companies.set(placement.company.companyId, {
        id: placement.company.companyId,
        standardName: placement.company.canonicalName,
        aliases: placement.company.aliases.map((alias) => alias.alias),
        description: placement.positionLabel || "等待补充行业公司档案。",
        cognitionStatus: placement.company.status === "provisional" ? "待完善" : "已建档",
        attentionStatus: "未关注",
        positions: [position],
        claims: [],
        evidence,
        updatedAt: placement.company.updatedAt,
      });
    }
  }

  return {
    ...data,
    companies: [...companies.values()],
    industryNodes,
    industryEdges: [],
  };
}

function industryMaterialEvidence(
  material: IndustryMaterialV1,
  placementEvidence: ReviewEvidence,
): Company["evidence"][number] {
  const evidence = material.evidence || placementEvidence;
  return {
    id: evidence.evidenceId,
    documentId: material.documentId,
    fileName: material.fileName,
    excerpt: evidence.quote,
    ...(evidence.page === undefined ? {} : { page: evidence.page }),
    sourceDate:
      evidence.publishedAt || evidence.retrievedAt || material.updatedAt,
    visibility: "organization",
  };
}

function uniqueCompanyEvidence(items: Company["evidence"]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function IndustryLoadState({
  title,
  description = "请稍后重试，或返回行业目录。",
}: {
  title: string;
  description?: string;
}) {
  return (
    <section className="by-empty-page">
      <Globe2 />
      <h1>{title}</h1>
      <p>{description}</p>
      <Link to="/industry">返回行业</Link>
    </section>
  );
}
