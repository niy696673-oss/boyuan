import { useMemo, useState } from "react";
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
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Bootstrap } from "../api";
import type { Company, IndustryNode } from "../types";

export function IndustriesPage({
  data,
  reload,
}: {
  data: Bootstrap;
  reload: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("最近更新");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisNotice, setAnalysisNotice] = useState("");
  const roots = data.industryNodes.filter(
    (node) => node.parentId === null || node.level === 0,
  );
  const visibleRoots = roots.length
    ? roots
    : data.industryNodes.filter((node) => node.level === 1);
  const industries = visibleRoots.filter((node) => node.name.includes(query));
  const unclassifiedMaterials = data.companies
    .flatMap((company) => company.evidence)
    .filter((evidence) => !evidence.documentId).length;
  const pendingPositions = data.companies.filter(
    (company) =>
      !company.positions.some((position) => position.status === "confirmed"),
  ).length;
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
              <em>{companiesForNode(data, node.id).length}</em>
              <ChevronRight />
            </button>
          ))}
        </nav>
        <section>
          <h3>待处理</h3>
          <button>
            <FileSearch />
            待分类材料<em>{unclassifiedMaterials}</em>
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
                  : data.industryNodes.length
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
              data={data}
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
            {data.companies
              .flatMap((company) =>
                company.evidence.map((evidence) => ({ evidence, company })),
              )
              .slice(0, 6)
              .map(({ evidence, company }) => (
                <button key={evidence.id}>
                  <FileText />
                  <span>
                    <strong>{evidence.fileName}</strong>
                    <small>
                      {company.aliases[0] || company.standardName} ·{" "}
                      {evidence.sourceDate}
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
  onOpen,
}: {
  industry: IndustryNode;
  data: Bootstrap;
  onOpen: () => void;
}) {
  const children = data.industryNodes.filter(
    (node) => node.parentId === industry.id,
  );
  const companies = companiesForNode(data, industry.id);
  const materials = companies.reduce(
    (sum, company) => sum + company.evidence.length,
    0,
  );
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
          <dd>{companies.length}</dd>
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

export function IndustryDetailPage({ data }: { data: Bootstrap }) {
  const { id } = useParams();
  const industry =
    data.industryNodes.find((node) => node.id === id) || data.industryNodes[0];
  if (!industry)
    return (
      <section className="by-empty-page">
        <Globe2 />
        <h1>还没有行业资料</h1>
        <p>请先上传行业材料，或从工作台发起行业研究。</p>
        <Link to="/industry">返回行业</Link>
      </section>
    );
  return <IndustryDetailContent data={data} industry={industry} />;
}

function IndustryDetailContent({
  data,
  industry,
}: {
  data: Bootstrap;
  industry: IndustryNode;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("概览");
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
  const materials = companies.flatMap((company) =>
    company.evidence.map((evidence) => ({ evidence, company })),
  );
  const tabs = [
    ["概览", ""],
    ["材料", materials.length],
    ["产业链", descendants.length],
    ["公司", companies.length],
  ] as const;
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
            onClick={() => setTab(name)}
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
          onOpenTree={() => setTab("产业链")}
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
  materials: Array<{ evidence: Company["evidence"][number]; company: Company }>;
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
        {materials.slice(0, 5).map(({ evidence, company }) => (
          <button key={evidence.id}>
            <FileText />
            <span>
              <strong>{evidence.fileName}</strong>
              <small>
                {company.aliases[0] || company.standardName} ·{" "}
                {evidence.sourceDate}
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
  materials: Array<{ evidence: Company["evidence"][number]; company: Company }>;
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
        {materials.map(({ evidence, company }) => (
          <button key={evidence.id}>
            <span>
              <FileText />
              <strong>{evidence.fileName}</strong>
            </span>
            <span>行业材料</span>
            <span>{evidence.sourceDate}</span>
            <span>{company.aliases[0] || company.standardName}</span>
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
