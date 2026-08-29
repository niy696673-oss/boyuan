import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  Filter,
  Globe2,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import type { Bootstrap } from "../api";
import {
  createReviewQueueClient,
  type ReviewQueueClient,
} from "../capabilities/review/client";
import { useReviewQueue } from "../capabilities/review/use-review-queue";
import type {
  ReviewDecisionAction,
  ReviewDecisionInput,
  ReviewEvidence,
  ReviewPackageV1,
  ReviewQueueItem,
} from "../../shared/research-platform-v1";
import { AuthenticatedDocumentDownload } from "./AuthenticatedDocumentDownload";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const defaultReviewClient = createReviewQueueClient();

type ConfirmationFilter =
  | "我的待确认"
  | "公司"
  | "行业"
  | "AI 候选"
  | "Web Search 候选"
  | "高影响"
  | "存在冲突";

const confirmationFilters: ConfirmationFilter[] = [
  "我的待确认",
  "公司",
  "行业",
  "AI 候选",
  "Web Search 候选",
  "高影响",
  "存在冲突",
];

export function ConfirmationPage({
  data: _data,
  reload: _reload,
  reviewClient = defaultReviewClient,
  onQueueCountChange,
}: {
  data: Bootstrap;
  reload: () => void;
  reviewClient?: ReviewQueueClient;
  onQueueCountChange?: (count: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<ConfirmationFilter>("我的待确认");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"review" | "edit">("review");
  const [searchParams] = useSearchParams();
  const queue = useReviewQueue(
    reviewClient,
    onQueueCountChange,
    searchParams.get("candidateId") || undefined,
  );
  const {
    items,
    selected: queueSelected,
    selectedId,
    loadError,
    busy,
    notice,
  } = queue;
  const visibleItems = (items || []).filter(
    (item) =>
      candidateMatchesFilter(item, filter) &&
      candidateMatchesQuery(item, query),
  );
  const packages = packageReviewItems(visibleItems);
  const selected =
    visibleItems.find((item) => item.candidateId === selectedId) ||
    visibleItems.find(
      (item) => item.candidateId === queueSelected?.candidateId,
    ) ||
    visibleItems[0];
  const selectedPackage = selected
    ? packages.find(
        (item) => item.company.companyId === selected.company.companyId,
      )
    : undefined;

  useEffect(() => {
    if (!selectedId || !visibleItems.length) return;
    if (!visibleItems.some((item) => item.candidateId === selectedId)) {
      queue.select(visibleItems[0].candidateId);
    }
  }, [filter, items, query, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setDraft(selected.statement);
    setReason("");
  }, [selected?.candidateId]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const cards = gsap.utils.toArray<HTMLElement>(
        ".by-evidence-stack article",
      );
      cards.forEach((card, index) => {
        gsap.fromTo(
          card,
          { y: 22 + index * 8, scale: 0.97, opacity: 0.55 },
          {
            y: 0,
            scale: 1,
            opacity: 1,
            duration: 0.48,
            delay: index * 0.06,
            ease: "power3.out",
          },
        );
      });
    },
    { scope: root, dependencies: [selectedId], revertOnUpdate: true },
  );

  const choose = (item: ReviewQueueItem) => {
    queue.select(item.candidateId);
    setDraft(item.statement);
    setReason("");
    setMode("review");
  };

  const chooseFilter = (nextFilter: ConfirmationFilter) => {
    setFilter(nextFilter);
    keepSelectionVisible(nextFilter, query);
  };

  const search = (nextQuery: string) => {
    setQuery(nextQuery);
    keepSelectionVisible(filter, nextQuery);
  };

  const keepSelectionVisible = (
    nextFilter: ConfirmationFilter,
    nextQuery: string,
  ) => {
    const nextItems = (items || []).filter(
      (item) =>
        candidateMatchesFilter(item, nextFilter) &&
        candidateMatchesQuery(item, nextQuery),
    );
    const currentId = selectedId || queueSelected?.candidateId;
    if (
      nextItems.length &&
      !nextItems.some((item) => item.candidateId === currentId)
    ) {
      queue.select(nextItems[0].candidateId);
    }
  };

  const review = async (action: ReviewDecisionAction, edited = false) => {
    if (!selected || busy) return;
    const input: ReviewDecisionInput = {
      expectedVersion: selected.version,
      action: edited ? "modify" : action,
      ...(edited ? { statement: draft.trim() } : {}),
    };
    await queue.decide(input);
  };

  const batchReview = async (action: "confirm" | "reject") => {
    if (!selectedPackage || busy) return;
    const decisions = action === "confirm"
      ? safePackageConfirmDecisions(selectedPackage)
      : safePackageRejectDecisions(selectedPackage);
    await queue.decideBatch({ decisions });
  };

  if (loadError) return <ConfirmationLoadError message={loadError} />;
  if (!items) return <ConfirmationLoading />;
  if (!items.length) return <ConfirmationEmpty />;

  const supportingEvidences = selected?.evidence || [];
  const evidenceEntries: Array<{
    evidence: ReviewEvidence;
    relation: "supporting" | "unsupported" | "conflicting";
    context?: string;
  }> = [
    ...supportingEvidences.map((evidence) => ({
      evidence,
      relation: "supporting" as const,
    })),
    ...(selected?.unsupportedEvidence || []).map((evidence) => ({
      evidence,
      relation: "unsupported" as const,
    })),
    ...(selected?.conflictingKnowledge || []).flatMap((knowledge) =>
      knowledge.evidence.map((evidence) => ({
        evidence,
        relation: "conflicting" as const,
        context: knowledge.statement,
      })),
    ),
  ];
  const existing = selected?.currentKnowledge || [];
  const safeConfirmCount = selectedPackage
    ? safePackageConfirmDecisions(selectedPackage).length
    : 0;
  const safeRejectCount = selectedPackage
    ? safePackageRejectDecisions(selectedPackage).length
    : 0;

  return (
    <div className="by-confirmation-page" ref={root}>
      <aside className="by-confirm-filter">
        <header>
          <span>待确认中心</span>
          <strong>{items.length} 条候选</strong>
        </header>
        <label>
          <Search />
          <input
            value={query}
            onChange={(event) => search(event.target.value)}
            placeholder="搜索候选内容或公司"
          />
        </label>
        <nav>
          {confirmationFilters.map((label) => (
            <button
              className={filter === label ? "active" : ""}
              key={label}
              onClick={() => chooseFilter(label)}
            >
              <span>{label}</span>
              <em>
                {
                  items.filter((item) => candidateMatchesFilter(item, label))
                    .length
                }
              </em>
            </button>
          ))}
        </nav>
        <section>
          <ShieldCheck />
          <p>候选知识只有经过人工确认后才会进入正式知识。</p>
        </section>
      </aside>

      <section className="by-candidate-list">
        <header>
          <div>
            <span>待处理队列</span>
            <h1>{filter}</h1>
          </div>
          <button>
            <Filter />
            筛选
          </button>
        </header>
        <div>
          {packages.map((reviewPackage) => {
            const first = reviewPackage.groups[0]?.clusters[0]?.candidates?.[0];
            const active = selected?.company.companyId === reviewPackage.company.companyId;
            return (
              <button
                className={active ? "active" : ""}
                key={reviewPackage.packageId}
                onClick={() => first && choose(first)}
              >
                <header>
                  <span className="ai">
                    <Sparkles />
                    主体确认包
                  </span>
                  <time>{reviewPackage.groupCount} 组</time>
                </header>
                <p>{reviewPackage.company.canonicalName}</p>
                <footer>
                  <span>{reviewPackage.candidateCount} 条候选</span>
                  <span>{reviewPackage.safeCandidateCount} 条可安全批量处理</span>
                  <em>{reviewPackage.riskCandidateCount} 条需逐条核验</em>
                  <ChevronRight />
                </footer>
              </button>
            );
          })}
          {!visibleItems.length && (
            <p role="status">
              {filter === "行业"
                ? "当前候选数据仅支持公司对象，暂无行业候选。"
                : "没有符合当前筛选和搜索条件的候选。"}
            </p>
          )}
        </div>
      </section>

      {selected ? (
        <section className="by-confirm-detail">
          <header>
            <div>
              <span>{selected.company.canonicalName}</span>
              <h2>核验候选知识</h2>
            </div>
            <Link to={`/companies/${selected.company.companyId}`}>
              打开公司
              <ExternalLink />
            </Link>
          </header>
          {selectedPackage && (
            <section className="by-existing-knowledge">
              <header>
                <h3>主体候选确认包</h3>
                <span>
                  {selectedPackage.groupCount} 组 · {selectedPackage.candidateCount} 条
                </span>
              </header>
              {selectedPackage.groups.map((group) => (
                <article key={group.groupId}>
                  <div>
                    <strong>{group.sectionTitle}</strong>
                    <small>
                      {knowledgeTypeLabel(group.knowledgeType)} · {group.candidateCount} 条
                    </small>
                  </div>
                  {group.clusters.map((cluster) => {
                    const candidate = cluster.candidates?.[0];
                    if (!candidate) return null;
                    return (
                      <button
                        className={
                          selected.candidateId === candidate.candidateId
                            ? "active"
                            : ""
                        }
                        key={cluster.clusterId}
                        onClick={() => choose(candidate)}
                      >
                        {candidate.statement}
                        {cluster.candidateCount > 1
                          ? ` · ${cluster.candidateCount} 条重复`
                          : ""}
                        {!cluster.safeToConfirm
                          ? ` · ${cluster.riskReasons.join("、")}`
                          : ""}
                      </button>
                    );
                  })}
                </article>
              ))}
              <div>
                <button
                  disabled={busy || safeRejectCount === 0}
                  onClick={() => void batchReview("reject")}
                >
                  批量驳回低风险候选（{safeRejectCount}）
                </button>
                <button
                  disabled={busy || safeConfirmCount === 0}
                  onClick={() => void batchReview("confirm")}
                >
                  批量确认低风险组（{safeConfirmCount}）
                </button>
              </div>
            </section>
          )}
          <div className="by-candidate-content">
            <span>{knowledgeTypeLabel(selected.knowledgeType)}</span>
            {mode === "edit" ? (
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            ) : (
              <p>{selected.statement}</p>
            )}
            <dl>
              <div>
                <dt>来源类型</dt>
                <dd>{hasWebEvidence(selected) ? "Web Search" : "AI 分析"}</dd>
              </div>
              <div>
                <dt>影响级别</dt>
                <dd>{selected.highImpact ? "高影响" : "常规"}</dd>
              </div>
              <div>
                <dt>目标对象</dt>
                <dd>{selected.company.canonicalName}</dd>
              </div>
            </dl>
          </div>
          <section className="by-evidence-section">
            <header>
              <h3>支持与冲突证据</h3>
              <span>{evidenceEntries.length} 条可见证据</span>
            </header>
            <div className="by-evidence-stack">
              {evidenceEntries.length ? (
                evidenceEntries.map((entry, index) => (
                  <EvidenceCard
                    evidence={entry.evidence}
                    index={index}
                    relation={entry.relation}
                    context={entry.context}
                    key={`${entry.relation}:${entry.evidence.evidenceId}`}
                  />
                ))
              ) : (
                <article className="empty">
                  <CircleAlert />
                  <p>当前没有支持证据，因此不能直接确认。</p>
                </article>
              )}
            </div>
          </section>
          <section className="by-existing-knowledge">
            <header>
              <h3>现有正式知识</h3>
              <span>{existing.length} 条同主题内容</span>
            </header>
            {existing.length ? (
              existing.map((knowledge) => (
                <article key={knowledge.knowledgeId}>
                  <Check />
                  <p>{knowledge.statement}</p>
                  <small>版本 {knowledge.version}</small>
                </article>
              ))
            ) : (
              <p className="by-inline-empty">
                该主题暂无正式知识，确认后将创建第一版。
              </p>
            )}
          </section>
          <div className="by-confirm-actions">
            {notice && <p>{notice}</p>}
            {mode === "edit" && (
              <label>
                修改原因
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="说明修改依据"
                />
              </label>
            )}
            <div>
              <button disabled={busy} onClick={() => void review("reject")}>
                <X />
                驳回
              </button>
              <button
                disabled={busy}
                onClick={() => setMode(mode === "edit" ? "review" : "edit")}
              >
                <Pencil />
                {mode === "edit" ? "取消修改" : "修改确认"}
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  !supportingEvidences.length ||
                  (mode === "edit" && (reason.length < 2 || !draft.trim()))
                }
                onClick={() => void review("confirm", mode === "edit")}
              >
                <Check />
                {busy
                  ? "正在提交"
                  : mode === "edit"
                    ? "保存并确认"
                    : "确认并入库"}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="by-confirm-detail by-confirmation-empty">
          <span>
            <Search />
          </span>
          <h2>当前范围没有候选</h2>
          <p>
            {filter === "行业"
              ? "当前候选协议只包含公司对象，因此行业筛选结果为 0。"
              : "请调整筛选条件或搜索关键词。"}
          </p>
        </section>
      )}
    </div>
  );
}

function candidateMatchesFilter(
  item: ReviewQueueItem,
  filter: ConfirmationFilter,
) {
  if (filter === "行业") return false;
  if (filter === "AI 候选") return !hasWebEvidence(item);
  if (filter === "Web Search 候选") return hasWebEvidence(item);
  if (filter === "高影响") return item.highImpact;
  if (filter === "存在冲突") return item.status === "conflicted";
  return true;
}

const sectionTitles: Record<string, string> = {
  company_and_project_stage: "01 公司主体与项目阶段",
  founders_team_and_governance: "02 创始人、团队与治理",
  product_portfolio: "03 产品矩阵",
  core_technology_and_ip: "04 核心技术与知识产权",
  technology_readiness_and_production: "05 技术成熟度与生产能力",
  industry_market_and_policy: "06 行业、市场和政策",
  industry_chain_position: "07 产业链位置",
  customers_orders_and_scenarios: "08 客户、订单与应用场景",
  supply_chain_and_partners: "09 供应链与合作方",
  business_model_and_competition: "10 商业模式和竞争优势",
  financing_valuation_equity_and_use: "11 融资、估值、股权和资金用途",
  financial_operations_plans_risks: "12 财务经营、规划、风险与待验证",
  provenance_versions_conflicts_confirmations:
    "13 来源、时间、版本、冲突和人工确认",
};

function packageReviewItems(items: ReviewQueueItem[]): ReviewPackageV1[] {
  const byCompany = new Map<string, ReviewQueueItem[]>();
  for (const item of items) {
    const bucket = byCompany.get(item.company.companyId) ?? [];
    bucket.push(item);
    byCompany.set(item.company.companyId, bucket);
  }
  return [...byCompany.values()]
    .map((companyItems) => {
      const company = companyItems[0].company;
      const byGroup = new Map<string, ReviewQueueItem[]>();
      for (const item of companyItems) {
        const key = `${item.sectionKey}:${item.knowledgeType}`;
        const bucket = byGroup.get(key) ?? [];
        bucket.push(item);
        byGroup.set(key, bucket);
      }
      const groups = [...byGroup.entries()].map(([key, groupItems]) => {
        const first = groupItems[0];
        const byFingerprint = new Map<string, ReviewQueueItem[]>();
        for (const item of groupItems) {
          const fingerprint = normalizedCandidateFingerprint(item);
          const bucket = byFingerprint.get(fingerprint) ?? [];
          bucket.push(item);
          byFingerprint.set(fingerprint, bucket);
        }
        return {
          groupId: `${company.companyId}:${key}`,
          sectionKey: first.sectionKey,
          sectionTitle: sectionTitles[first.sectionKey] || first.sectionKey,
          knowledgeType: first.knowledgeType,
          candidateCount: groupItems.length,
          clusters: [...byFingerprint.entries()].map(
            ([fingerprint, candidates]) => {
              const riskReasons = candidateRiskReasons(candidates[0]);
              return {
                clusterId: `${company.companyId}:${key}:${fingerprint}`,
                fingerprint,
                candidateIds: candidates.map((candidate) => candidate.candidateId),
                candidates,
                candidateCount: candidates.length,
                safeToConfirm: riskReasons.length === 0,
                riskReasons,
              };
            },
          ),
        };
      });
      const safeCandidateCount = groups.reduce(
        (total, group) =>
          total
          + group.clusters
            .filter((cluster) => cluster.safeToConfirm)
            .reduce((count, cluster) => count + cluster.candidateCount, 0),
        0,
      );
      return {
        packageId: company.companyId,
        company,
        candidateCount: companyItems.length,
        groupCount: groups.length,
        safeCandidateCount,
        riskCandidateCount: companyItems.length - safeCandidateCount,
        groups,
      };
    })
    .sort(
      (left, right) =>
        right.candidateCount - left.candidateCount
        || left.company.canonicalName.localeCompare(
          right.company.canonicalName,
          "zh-CN",
        ),
    );
}

function normalizedCandidateFingerprint(item: ReviewQueueItem): string {
  return [item.statement, item.value || "", item.effectiveAt || ""]
    .map((value) =>
      value
        .normalize("NFKC")
        .toLocaleLowerCase("zh-CN")
        .replace(/[\s\p{P}\p{S}]+/gu, ""),
    )
    .join(":");
}

function candidateRiskReasons(item: ReviewQueueItem): string[] {
  return [
    ...(item.highImpact ? ["高影响"] : []),
    ...(item.sensitive ? ["敏感信息"] : []),
    ...(item.status === "conflicted" ? ["存在冲突"] : []),
    ...(item.evidence.length === 0 ? ["缺少支持证据"] : []),
    ...((item.unsupportedEvidence?.length || 0) > 0
      ? ["存在不支持证据"]
      : []),
    ...((item.conflictingKnowledge?.length || 0) > 0
      ? ["与正式知识冲突"]
      : []),
  ];
}

function safePackageConfirmDecisions(reviewPackage: ReviewPackageV1) {
  const typeCounts = new Map<string, number>();
  for (const group of reviewPackage.groups) {
    typeCounts.set(
      group.knowledgeType,
      (typeCounts.get(group.knowledgeType) || 0) + 1,
    );
  }
  return reviewPackage.groups.flatMap((group) => {
    if (group.clusters.length !== 1 || typeCounts.get(group.knowledgeType) !== 1) {
      return [];
    }
    const cluster = group.clusters[0];
    if (!cluster.safeToConfirm) return [];
    return (cluster.candidates || []).map((candidate, index) => ({
      candidateId: candidate.candidateId,
      expectedVersion: candidate.version,
      action: index === 0 ? "confirm" as const : "reject" as const,
    }));
  });
}

function safePackageRejectDecisions(reviewPackage: ReviewPackageV1) {
  return reviewPackage.groups.flatMap((group) =>
    group.clusters.flatMap((cluster) =>
      cluster.safeToConfirm
        ? (cluster.candidates || []).map((candidate) => ({
            candidateId: candidate.candidateId,
            expectedVersion: candidate.version,
            action: "reject" as const,
          }))
        : [],
    ),
  );
}

function candidateMatchesQuery(item: ReviewQueueItem, query: string) {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return true;
  return [
    item.statement,
    item.company.canonicalName,
    ...item.company.aliases.map((alias) => alias.alias),
  ].some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized));
}

function hasWebEvidence(item: ReviewQueueItem) {
  return item.evidence.some((evidence) => evidence.sourceType === "web");
}

function EvidenceCard({
  evidence,
  index,
  relation,
  context,
}: {
  evidence: ReviewEvidence;
  index: number;
  relation: "supporting" | "unsupported" | "conflicting";
  context?: string;
}) {
  const externalUrl = evidence.sourceType === "web"
    ? safeEvidenceUrl(evidence.url)
    : undefined;
  return (
    <article style={{ zIndex: 10 - index }}>
      <header>
        <span>
          <FileText />
          {evidence.fileName || evidence.title || evidence.site || "研究证据"}
        </span>
        <em>
          {relation === "unsupported"
            ? "不支持候选"
            : relation === "conflicting"
              ? "冲突知识"
              : evidence.sourceType === "web"
                ? "外部来源"
                : "原始材料"}
        </em>
      </header>
      <blockquote>
        {context
          ? `冲突知识：${context}；证据：${evidence.quote}`
          : evidence.quote}
      </blockquote>
      <footer>
        <span>
          {evidence.page
            ? `第 ${evidence.page} 页`
            : evidence.paragraph
              ? `第 ${evidence.paragraph} 段`
              : evidence.retrievedAt || "位置未标注"}
        </span>
        <span>
          <ShieldCheck />
          研究平台证据
        </span>
        {externalUrl && (
          <a href={externalUrl} target="_blank" rel="noreferrer noopener">
            打开外部来源
            <ExternalLink />
          </a>
        )}
        {evidence.sourceType === "material" && evidence.documentId && (
          <AuthenticatedDocumentDownload
            documentId={evidence.documentId}
            fileName={evidence.fileName}
          />
        )}
      </footer>
    </article>
  );
}

function safeEvidenceUrl(value?: string): string | undefined {
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

function ConfirmationLoading() {
  return (
    <section className="by-confirmation-empty">
      <span>
        <ShieldCheck />
      </span>
      <h1>正在读取待确认内容…</h1>
    </section>
  );
}

function ConfirmationLoadError({ message }: { message: string }) {
  return (
    <section className="by-confirmation-empty">
      <span>
        <AlertTriangle />
      </span>
      <h1>无法读取待确认内容</h1>
      <p>{message}</p>
      <Link to="/">
        返回工作台
        <ArrowRight />
      </Link>
    </section>
  );
}

function ConfirmationEmpty() {
  return (
    <section className="by-confirmation-empty">
      <span>
        <Check />
      </span>
      <h1>待确认内容已处理完毕</h1>
      <p>你可以返回工作台继续研究，或查看最近完成的确认记录。</p>
      <Link to="/">
        返回工作台
        <ArrowRight />
      </Link>
    </section>
  );
}

function knowledgeTypeLabel(knowledgeType: string) {
  return (
    {
      company_summary: "公司概览",
      primary_industry: "所属行业",
      industry_chain_position: "产业链位置",
    }[knowledgeType] || knowledgeType
  );
}
