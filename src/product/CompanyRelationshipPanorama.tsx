import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  CompanyRelationshipPanoramaItemV1,
  ReviewEvidence,
} from "../../shared/research-platform-v1";
import {
  buildRelationshipPanorama,
  relationshipCategoryLabel,
  relationshipVerificationLabel,
  RELATIONSHIP_SOURCE_KINDS,
  RELATIONSHIP_SOURCE_META,
  type RelationshipSourceFilter,
} from "../capabilities/companies/relationship-panorama";

interface CompanyRelationshipPanoramaProps {
  companyId: string;
  companyName: string;
  items: CompanyRelationshipPanoramaItemV1[];
}

export function CompanyRelationshipPanorama({
  companyId,
  companyName,
  items,
}: CompanyRelationshipPanoramaProps) {
  const [sourceFilter, setSourceFilter] =
    useState<RelationshipSourceFilter>("all");
  const panorama = useMemo(
    () => buildRelationshipPanorama(items, sourceFilter),
    [items, sourceFilter],
  );
  const downstreamAndCustomers = [
    ...panorama.byCategory.customer,
    ...panorama.byCategory.downstream,
  ];

  useEffect(() => setSourceFilter("all"), [companyId]);

  return (
    <section
      className="by-relation-panorama"
      aria-labelledby="relationship-panorama-title"
    >
      <header>
        <h2 id="relationship-panorama-title">关联性全景</h2>
        <div>
          <span>上游 {panorama.byCategory.upstream.length}</span>
          <ArrowRight />
          <strong>{companyName} · 本实体</strong>
          <ArrowRight />
          <span>下游 / 客户 {downstreamAndCustomers.length}</span>
        </div>
        <em>同层竞对 {panorama.byCategory.competitor.length} · 非流向</em>
      </header>

      <div className="by-relation-source-toolbar">
        <div
          className="by-relation-source-legend"
          aria-label="关联关系来源图例"
        >
          {RELATIONSHIP_SOURCE_KINDS.map((sourceKind) => (
            <span
              className={`source-${sourceKind}`}
              key={sourceKind}
              title={RELATIONSHIP_SOURCE_META[sourceKind].description}
            >
              <i aria-hidden="true" />
              {RELATIONSHIP_SOURCE_META[sourceKind].label}
            </span>
          ))}
        </div>
        <div
          className="by-relation-source-filter"
          role="group"
          aria-label="按关系来源筛选"
        >
          <button
            type="button"
            aria-pressed={sourceFilter === "all"}
            onClick={() => setSourceFilter("all")}
          >
            全部 <span>{panorama.allItems.length}</span>
          </button>
          {RELATIONSHIP_SOURCE_KINDS.map((sourceKind) => (
            <button
              type="button"
              aria-pressed={sourceFilter === sourceKind}
              onClick={() => setSourceFilter(sourceKind)}
              key={sourceKind}
            >
              {RELATIONSHIP_SOURCE_META[sourceKind].label}{" "}
              <span>{panorama.sourceCounts[sourceKind]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="by-relation-columns">
        <RelationshipGroup
          title="上游"
          subtitle="输入 · 供给"
          items={panorama.byCategory.upstream}
          empty="当前筛选下暂无上游关系"
        />
        <RelationshipGroup
          title="下游及客户"
          subtitle="客户 · 渠道 · 交付"
          items={downstreamAndCustomers}
          empty="当前筛选下暂无客户或下游关系"
        />
        <RelationshipGroup
          title="潜在竞对"
          subtitle="同层 · 替代"
          items={panorama.byCategory.competitor}
          empty="当前筛选下暂无潜在竞对"
        />
      </div>
      <footer>
        当前显示 {panorama.visibleItems.length} 条，共{" "}
        {panorama.allItems.length} 条；跨来源的同一关系分别保留，不互相覆盖。
      </footer>
    </section>
  );
}

function RelationshipGroup({
  title,
  subtitle,
  items,
  empty,
}: {
  title: string;
  subtitle: string;
  items: CompanyRelationshipPanoramaItemV1[];
  empty: string;
}) {
  return (
    <section>
      <header>
        <h3>{title}</h3>
        <span>{subtitle}</span>
      </header>
      <div className="by-relation-list">
        {items.length ? (
          items.map((item) => (
            <RelationshipCard
              item={item}
              key={`${item.sourceKind}:${item.relationshipId}`}
            />
          ))
        ) : (
          <p className="by-relation-empty">{empty}</p>
        )}
      </div>
    </section>
  );
}

function RelationshipCard({
  item,
}: {
  item: CompanyRelationshipPanoramaItemV1;
}) {
  const source = RELATIONSHIP_SOURCE_META[item.sourceKind];
  return (
    <article
      className={`by-relation-item source-${item.sourceKind} verification-${item.verificationStatus}`}
      aria-label={`${item.targetName} · ${source.label}`}
    >
      <div>
        {item.targetCompanyId ? (
          <Link to={`/companies/${item.targetCompanyId}`}>
            {item.targetName}
          </Link>
        ) : (
          <strong>{item.targetName}</strong>
        )}
        <em>{item.relationType}</em>
      </div>
      <p>{item.description}</p>
      <div className="by-relation-meta">
        <span className="by-relation-category-badge">
          {relationshipCategoryLabel(item.category)}
        </span>
        <span className={`by-relation-source-badge source-${item.sourceKind}`}>
          {source.label}
        </span>
        <span
          className={`by-relation-verification-badge verification-${item.verificationStatus}`}
        >
          {relationshipVerificationLabel(item.verificationStatus)}
        </span>
      </div>
      {item.evidence.length > 0 ? (
        <RelationshipEvidence evidence={item.evidence} />
      ) : (
        <p className="by-relation-no-evidence">暂无可展示证据</p>
      )}
    </article>
  );
}

function RelationshipEvidence({ evidence }: { evidence: ReviewEvidence[] }) {
  return (
    <details className="by-relation-evidence">
      <summary>查看 {evidence.length} 条证据</summary>
      <div>
        {evidence.map((item) => (
          <article key={item.evidenceId}>
            <strong>{evidenceSourceLabel(item)}</strong>
            {item.url && isWebUrl(item.url) ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.url}
                <ExternalLink />
              </a>
            ) : null}
            <p>{item.quote}</p>
          </article>
        ))}
      </div>
    </details>
  );
}

function evidenceSourceLabel(evidence: ReviewEvidence): string {
  return [
    evidence.fileName ||
      evidence.title ||
      evidence.site ||
      (evidence.sourceType === "web" ? "外部来源" : "材料证据"),
    evidence.page ? `第 ${evidence.page} 页` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function isWebUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}
