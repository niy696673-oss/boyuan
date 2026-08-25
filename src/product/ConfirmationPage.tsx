import { useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileSearch,
  FileText,
  Filter,
  Globe2,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, type Bootstrap } from "../api";
import type { Claim, Company, Evidence } from "../types";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function ConfirmationPage({ data, reload }: { data: Bootstrap; reload: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const candidates = useMemo(
    () => data.companies.flatMap((company) => company.claims.filter((claim) => ["candidate", "disputed"].includes(claim.status)).map((claim) => ({ claim, company }))),
    [data.companies],
  );
  const [filter, setFilter] = useState("我的待确认");
  const [selectedId, setSelectedId] = useState(candidates[0]?.claim.id || "");
  const selected = candidates.find((item) => item.claim.id === selectedId) || candidates[0];
  const [draft, setDraft] = useState(selected?.claim.text || "");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"review" | "edit">("review");
  const [busy, setBusy] = useState(false);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const cards = gsap.utils.toArray<HTMLElement>(".by-evidence-stack article");
      cards.forEach((card, index) => {
        gsap.fromTo(card, { y: 22 + index * 8, scale: 0.97, opacity: 0.55 }, { y: 0, scale: 1, opacity: 1, duration: 0.48, delay: index * 0.06, ease: "power3.out" });
      });
    },
    { scope: root, dependencies: [selectedId], revertOnUpdate: true },
  );

  const choose = (claim: Claim) => {
    setSelectedId(claim.id);
    setDraft(claim.text);
    setReason("");
    setMode("review");
  };

  const review = async (action: "confirm" | "reject", edited = false) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api.reviewClaim(selected.claim.id, action, edited ? draft : undefined, reason || (action === "confirm" ? "已核验证据" : "证据不足"));
      reload();
      const next = candidates.find((item) => item.claim.id !== selected.claim.id);
      if (next) choose(next.claim);
    } finally {
      setBusy(false);
    }
  };

  if (!selected) return <ConfirmationEmpty />;
  const evidences = selected.company.evidence.filter((evidence) => selected.claim.evidenceIds.includes(evidence.id));
  const existing = selected.company.claims.filter((claim) => claim.status === "confirmed" && claim.category === selected.claim.category);

  return (
    <div className="by-confirmation-page" ref={root}>
      <aside className="by-confirm-filter">
        <header><span>待确认中心</span><strong>{candidates.length} 条候选</strong></header>
        <label><Search /><input placeholder="搜索候选内容或公司" /></label>
        <nav>{[
          ["我的待确认", candidates.length], ["公司", candidates.filter((item) => item.company).length], ["行业", 0], ["AI 候选", candidates.filter((item) => item.claim.type === "ai_inference").length], ["Web Search 候选", candidates.filter((item) => item.claim.type === "external_view").length], ["高影响", candidates.filter((item) => item.claim.confidence >= 0.8).length], ["存在冲突", candidates.filter((item) => item.claim.status === "disputed").length],
        ].map(([label, count]) => <button className={filter === label ? "active" : ""} key={label} onClick={() => setFilter(String(label))}><span>{label}</span><em>{count}</em></button>)}</nav>
        <section><ShieldCheck /><p>仅可确认你有权查看完整证据的候选知识。</p></section>
      </aside>

      <section className="by-candidate-list">
        <header><div><span>待处理队列</span><h1>{filter}</h1></div><button><Filter />筛选</button></header>
        <div>{candidates.map(({ claim, company }) => <button className={selected.claim.id === claim.id ? "active" : ""} key={claim.id} onClick={() => choose(claim)}><header><span className={claim.type === "external_view" ? "external" : "ai"}>{claim.type === "external_view" ? <Globe2 /> : <Sparkles />}{claim.type === "external_view" ? "Web Search 候选" : "AI 候选"}</span><time>{new Date(company.updatedAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</time></header><p>{claim.text}</p><footer><span>{company.aliases[0] || company.standardName}</span><span>{claim.category}</span><em>{Math.round(claim.confidence * 100)}% 置信度</em><ChevronRight /></footer></button>)}</div>
      </section>

      <section className="by-confirm-detail">
        <header><div><span>{selected.company.aliases[0] || selected.company.standardName}</span><h2>核验候选知识</h2></div><Link to={`/companies/${selected.company.id}`}>打开公司<ExternalLink /></Link></header>
        <div className="by-candidate-content"><span>{selected.claim.category}</span>{mode === "edit" ? <textarea value={draft} onChange={(event) => setDraft(event.target.value)} /> : <p>{selected.claim.text}</p>}<dl><div><dt>来源类型</dt><dd>{selected.claim.type === "external_view" ? "Web Search" : "AI 分析"}</dd></div><div><dt>置信度</dt><dd>{Math.round(selected.claim.confidence * 100)}%</dd></div><div><dt>目标对象</dt><dd>{selected.company.aliases[0] || selected.company.standardName}</dd></div></dl></div>
        <section className="by-evidence-section"><header><h3>支持与冲突证据</h3><span>{evidences.length} 条可见证据</span></header><div className="by-evidence-stack">{evidences.length ? evidences.map((evidence, index) => <EvidenceCard evidence={evidence} index={index} key={evidence.id} />) : <article className="empty"><CircleAlert /><p>当前没有可见的完整证据，因此不能直接确认。</p></article>}</div></section>
        <section className="by-existing-knowledge"><header><h3>现有正式知识</h3><span>{existing.length} 条同主题内容</span></header>{existing.length ? existing.map((claim) => <article key={claim.id}><Check /><p>{claim.text}</p><small>版本 {claim.version}</small></article>) : <p className="by-inline-empty">该主题暂无正式知识，确认后将创建第一版。</p>}</section>
        <div className="by-confirm-actions">
          {mode === "edit" && <label>修改原因<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明修改依据" /></label>}
          <div><button disabled={busy} onClick={() => void review("reject")}><X />驳回</button><button disabled={busy} onClick={() => setMode(mode === "edit" ? "review" : "edit")}><Pencil />{mode === "edit" ? "取消修改" : "修改确认"}</button><button className="primary" disabled={busy || !evidences.length || (mode === "edit" && reason.length < 2)} onClick={() => void review("confirm", mode === "edit")}><Check />{busy ? "正在提交" : mode === "edit" ? "保存并确认" : "确认并入库"}</button></div>
        </div>
      </section>
    </div>
  );
}

function EvidenceCard({ evidence, index }: { evidence: Evidence; index: number }) {
  return <article style={{ zIndex: 10 - index }}><header><span><FileText />{evidence.fileName}</span><em>原始材料</em></header><blockquote>{evidence.excerpt}</blockquote><footer><span>{evidence.page ? `第 ${evidence.page} 页` : evidence.sourceDate}</span><span><ShieldCheck />{evidence.visibility}</span><button>打开原文<ExternalLink /></button></footer></article>;
}

function ConfirmationEmpty() {
  return <section className="by-confirmation-empty"><span><Check /></span><h1>待确认内容已处理完毕</h1><p>你可以返回工作台继续研究，或查看最近完成的确认记录。</p><Link to="/">返回工作台<ArrowRight /></Link></section>;
}
