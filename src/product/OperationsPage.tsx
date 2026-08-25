import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronRight,
  CircleAlert,
  Database,
  FileText,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { Bootstrap } from "../api";
import { api } from "../api";
import type { DocumentRecord } from "../types";

export function OperationsPage({ data, mode, reload }: { data: Bootstrap; mode: "tasks" | "admin"; reload: () => void }) {
  if (mode === "tasks") return <TaskArchive data={data} />;
  return <AdminOperations data={data} reload={reload} />;
}

function TaskArchive({ data }: { data: Bootstrap }) {
  return <section className="by-operations-page"><header className="by-page-heading"><div><span>研究过程</span><h1>全部研究任务</h1><p>查看任务目的、执行步骤、状态和候选知识产出。</p></div></header><label className="by-operations-search"><Search /><input placeholder="搜索任务或公司" /></label><div className="by-operations-table"><div className="head"><span>研究任务</span><span>公司</span><span>发起时间</span><span>状态</span><span>产出</span></div>{data.tasks.map((task) => { const company = data.companies.find((item) => item.id === task.companyId); return <button key={task.id}><span><FileText /><strong>{task.query}</strong></span><span>{company?.aliases[0] || "待识别"}</span><span>{new Date(task.createdAt).toLocaleString("zh-CN")}</span><span className={task.status === "执行失败" ? "danger" : task.status === "已完成" ? "success" : "warning"}>{task.status}</span><span>{task.answer ? `${task.answer.citationCount} 条引用` : "等待生成"}</span><ChevronRight /></button>; })}</div></section>;
}

function AdminOperations({ data, reload }: { data: Bootstrap; reload: () => void }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [quality, setQuality] = useState<{ documents: number; parseSuccessRate: number; companies: number; pendingEntities: number; evidenceCoverage: number; permissionLeaks: number; conflicts: number } | null>(null);
  useEffect(() => { api.documents().then(setDocuments).catch(() => setDocuments([])); api.quality().then(setQuality).catch(() => setQuality(null)); }, []);
  const documentCount = quality?.documents ?? documents.length;
  const companyCount = quality?.companies ?? data.companies.length;
  return <section className="by-operations-page"><header className="by-page-heading"><div><span>系统运行与知识质量</span><h1>管理后台</h1><p>默认只展示异常元数据，不自动暴露敏感材料正文。</p></div><div><button onClick={() => reload()}><RefreshCw />刷新状态</button></div></header><div className="by-admin-metrics"><article><Database /><span><strong>{documentCount}</strong><small>材料总数</small></span></article><article><Activity /><span><strong>{documentCount ? `${Math.round((quality?.parseSuccessRate || 0) * 100)}%` : "—"}</strong><small>解析成功率</small></span></article><article><UsersRound /><span><strong>{companyCount}</strong><small>公司主体</small></span></article><article><ShieldCheck /><span><strong>{companyCount ? `${Math.round((quality?.evidenceCoverage || 0) * 100)}%` : "—"}</strong><small>证据覆盖率</small></span></article><article className="warning"><AlertTriangle /><span><strong>{quality?.pendingEntities ?? 0}</strong><small>主体待确认</small></span></article><article className="danger"><CircleAlert /><span><strong>{quality?.conflicts ?? 0}</strong><small>知识冲突</small></span></article></div><div className="by-admin-grid"><section><header><div><h2>材料处理异常</h2><p>解析失败、重复材料和归档异常。</p></div><button>查看全部</button></header>{documents.filter((document) => ["解析失败", "重复文件"].includes(document.status)).slice(0, 7).map((document) => <article key={document.id}><FileText /><span><strong>{document.fileName}</strong><small>{document.failureReason || "检测到可能重复的材料"}</small></span><em>{document.status}</em><button onClick={async () => { await api.retryDocument(document.id); reload(); }}><RefreshCw />重试</button></article>)}</section><aside><section><ServerCog /><div><h2>模型与搜索</h2><p>{data.settings.externalModelsEnabled ? "外部模型已启用" : "仅使用内部模型"}</p></div><span className={data.settings.externalModelsEnabled ? "success" : "warning"}>{data.settings.externalModelsEnabled ? <Check /> : <AlertTriangle />}{data.settings.externalModelsEnabled ? "运行正常" : "受限模式"}</span></section><section><ShieldCheck /><div><h2>权限审计</h2><p>未发现跨权限证据泄露</p></div><strong>{quality?.permissionLeaks ?? 0}</strong></section></aside></div></section>;
}
