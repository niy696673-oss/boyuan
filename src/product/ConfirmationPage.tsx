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
  const selected =
    visibleItems.find((item) => item.candidateId === selectedId) ||
    visibleItems.find(
      (item) => item.candidateId === queueSelected?.candidateId,
    ) ||
    visibleItems[0];

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
          {visibleItems.map((item) => {
            const web = hasWebEvidence(item);
            return (
              <button
                className={
                  selected?.candidateId === item.candidateId ? "active" : ""
                }
                key={item.candidateId}
                onClick={() => choose(item)}
              >
                <header>
                  <span className={web ? "external" : "ai"}>
                    {web ? <Globe2 /> : <Sparkles />}
                    {web ? "Web Search 候选" : "AI 候选"}
                  </span>
                  <time>
                    {new Date(item.updatedAt).toLocaleDateString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </time>
                </header>
                <p>{item.statement}</p>
                <footer>
                  <span>{item.company.canonicalName}</span>
                  <span>{knowledgeTypeLabel(item.knowledgeType)}</span>
                  <em>{item.highImpact ? "高影响" : "常规候选"}</em>
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
