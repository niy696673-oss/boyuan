import type {
  AuditEvent,
  Company,
  DocumentRecord,
  EntityCandidate,
  IndustryEdge,
  IndustryNode,
  ResearchTask,
  User,
} from "./types";

let userId = localStorage.getItem("boyuan-user") || "u-investor";
let accessToken = localStorage.getItem("boyuan-access-token") || "";
const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.port === "4173" ? "http://127.0.0.1:4174" : "")
).replace(/\/$/, "");
const apiUrl = (path: string) => `${apiBaseUrl}${path}`;
export const setAccessToken = (token: string) => {
  accessToken = token;
  localStorage.setItem("boyuan-access-token", token);
};
export const setApiUser = (id: string) => {
  userId = id;
  localStorage.setItem("boyuan-user", id);
};
export class ApiError extends Error {
  constructor(
    message: string,
    public payload: Record<string, unknown>,
    public status: number,
  ) {
    super(message);
  }
}
async function call<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(url), {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await res.json()
      : { error: `上传服务返回了非 JSON 响应（${res.status} · ${res.url}）` };
    throw new ApiError(payload.error || "请求失败", payload, res.status);
  }
  return res.json();
}
export interface Bootstrap {
  user: User;
  users: User[];
  companies: Company[];
  industryNodes: IndustryNode[];
  industryEdges: IndustryEdge[];
  tasks: ResearchTask[];
  settings: { externalModelsEnabled: boolean; knowledgeSource: string };
}
export interface IndustryContext {
  companyId: string;
  centerNodes: IndustryNode[];
  upstream: IndustryRelation[];
  downstream: IndustryRelation[];
}
export interface IndustryRelation {
  direction: "upstream" | "downstream";
  edge: IndustryEdge;
  node?: IndustryNode;
  company: Company;
  documents: Array<{
    id: string;
    fileName: string;
    excerpt: string;
    sourceDate: string;
    visibility: string;
  }>;
}
export const api = {
  login: async (email: string, password: string) => {
    const result = await call<{ accessToken: string; user: User }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    setAccessToken(result.accessToken);
    return result;
  },
  bootstrap: () => call<Bootstrap>("/api/bootstrap"),
  industryContext: (companyId: string) =>
    call<IndustryContext>(`/api/companies/${companyId}/industry-context`),
  viewEvidence: (id: string) =>
    call<import("./types").Evidence>(`/api/evidence/${id}/view`),
  exportCompany: (id: string) =>
    call<{ exportedAt: string; company: Company; notice: string }>(
      `/api/companies/${id}/export`,
    ),
  attention: (id: string, status: string) =>
    call<Company>(`/api/companies/${id}/attention`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  research: (input: {
    query: string;
    contextType: "材料" | "公司" | "行业";
    companyId?: string;
    industryId?: string;
  }) =>
    call<{ task: ResearchTask; company?: Company; industry?: IndustryNode }>(
      "/api/research",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
  analyzeIndustries: () =>
    call<{
      formal: boolean;
      provider: string;
      model: string;
      usedConfiguredModel: boolean;
      companies: number;
      industries: number;
      stages: number;
      edges: number;
    }>("/api/industries/analyze", { method: "POST", body: "{}" }),
  completeTask: (id: string) =>
    call<ResearchTask>(`/api/tasks/${id}/complete`, {
      method: "POST",
      body: "{}",
    }),
  correctClaim: (id: string, text: string, reason: string) =>
    call(`/api/claims/${id}/correct`, {
      method: "POST",
      body: JSON.stringify({ text, reason }),
    }),
  reviewClaim: (
    id: string,
    action: "confirm" | "reject",
    text?: string,
    reason?: string,
  ) =>
    call(`/api/claims/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ action, text, reason }),
    }),
  rollbackClaim: (id: string) =>
    call(`/api/claims/${id}/rollback`, { method: "POST", body: "{}" }),
  changePosition: (companyId: string, nodeId: string, reason: string) =>
    call(`/api/positions`, {
      method: "POST",
      body: JSON.stringify({ companyId, nodeId, reason }),
    }),
  audits: () => call<AuditEvent[]>("/api/admin/audits"),
  documents: () => call<DocumentRecord[]>("/api/admin/documents"),
  candidates: () => call<EntityCandidate[]>("/api/admin/candidates"),
  quality: () =>
    call<{
      documents: number;
      parseSuccessRate: number;
      companies: number;
      pendingEntities: number;
      pendingPositions: number;
      evidenceCoverage: number;
      citationIntegrityRate: number;
      coreRecallRate: number;
      permissionLeaks: number;
      conflicts: number;
    }>("/api/admin/quality"),
  resolveCandidate: (
    id: string,
    companyId: string,
    action: "confirm" | "reject",
  ) =>
    call(`/api/admin/candidates/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ companyId, action }),
    }),
  retryDocument: (id: string) =>
    call<DocumentRecord>(`/api/documents/${id}/retry`, {
      method: "POST",
      body: "{}",
    }),
  setting: (externalModelsEnabled: boolean) =>
    call(`/api/admin/settings`, {
      method: "POST",
      body: JSON.stringify({ externalModelsEnabled }),
    }),
  upload: async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(apiUrl("/api/upload"), {
      method: "POST",
      headers: {
        "x-user-id": userId,
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body,
    });
    const contentType = res.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await res.json()
      : {
          error: `上传服务返回了非 JSON 响应（${res.status} · ${res.url}）`,
        };
    if (!res.ok)
      throw new ApiError(
        payload.error || payload.failureReason || "上传失败",
        payload,
        res.status,
      );
    return payload as {
      id: string;
      fileName: string;
      size: number;
      status: string;
      duplicate: boolean;
      detectedCompanies: string[];
      statusTrace?: Array<{ status: string; at: string }>;
      knowledgeChanges?: Array<{
        action: string;
        claimId: string;
        detail: string;
      }>;
    };
  },
  importCompanyList: async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(apiUrl("/api/company-list"), {
      method: "POST",
      headers: {
        "x-user-id": userId,
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body,
    });
    if (!res.ok) throw new Error((await res.json()).error || "名单导入失败");
    return res.json() as Promise<{
      total: number;
      result: Array<{
        rawName: string;
        status: string;
        companyName?: string;
        candidates?: Array<{ id: string; name: string }>;
      }>;
    }>;
  },
};
