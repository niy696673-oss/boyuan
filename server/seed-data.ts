import type {
  AuditEvent,
  Company,
  IndustryEdge,
  IndustryNode,
  ResearchTask,
  User,
} from "../src/types.js";

// Operational accounts are retained so the empty platform remains accessible.
// All business, research, evidence, industry, task and audit seed data starts empty.
export const users: User[] = [
  { id: "u-investor", name: "研究员", role: "investor", projectIds: [] },
  { id: "u-partner", name: "合伙人", role: "partner", projectIds: [] },
  { id: "u-admin", name: "知识管理员", role: "knowledge_admin", projectIds: [] },
  { id: "u-system", name: "系统管理员", role: "system_admin", projectIds: [] },
];

export const industryNodes: IndustryNode[] = [];
export const industryEdges: IndustryEdge[] = [];
export const companies: Company[] = [];
export const tasks: ResearchTask[] = [];
export const audits: AuditEvent[] = [];
