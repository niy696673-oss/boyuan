import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AuditEvent,
  Company,
  DocumentRecord,
  EntityCandidate,
  ResearchTask,
  User,
} from "../src/types.js";
import {
  audits,
  companies,
  industryEdges,
  industryNodes,
  tasks,
  users,
} from "./seed-data.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const dataFile = path.join(dataDir, "demo-store.json");

const seededDocuments = (): DocumentRecord[] => {
  const byId = new Map<string, DocumentRecord>();
  for (const company of companies)
    for (const evidence of company.evidence)
      if (!byId.has(evidence.documentId))
        byId.set(evidence.documentId, {
          id: evidence.documentId,
          fileName: evidence.fileName,
          fileType: evidence.fileName.split(".").pop() || "md",
          fileHash: `seed-${evidence.documentId}`,
          size: 1024,
          status: "已索引",
          detectedCompanies: [company.aliases[0] || company.standardName],
          visibility: evidence.visibility,
          uploadedBy: "u-admin",
          uploadedAt: `${evidence.sourceDate}T09:00:00.000Z`,
          statusTrace: [
            { status: "待解析", at: `${evidence.sourceDate}T08:59:57.000Z` },
            { status: "解析中", at: `${evidence.sourceDate}T08:59:58.000Z` },
            { status: "已解析", at: `${evidence.sourceDate}T08:59:59.000Z` },
            { status: "已索引", at: `${evidence.sourceDate}T09:00:00.000Z` },
          ],
        });
  let index = 1;
  while (byId.size < 84) {
    const id = `d-external-${index++}`;
    byId.set(id, {
      id,
      fileName: `Demo模拟外部资料_${index}.md`,
      fileType: "md",
      fileHash: `seed-${id}`,
      size: 768,
      status: "已索引",
      detectedCompanies: [],
      visibility: "organization",
      uploadedBy: "u-admin",
      uploadedAt: "2026-08-01T09:00:00.000Z",
      statusTrace: [
        { status: "待解析", at: "2026-08-01T08:59:57.000Z" },
        { status: "解析中", at: "2026-08-01T08:59:58.000Z" },
        { status: "已解析", at: "2026-08-01T08:59:59.000Z" },
        { status: "已索引", at: "2026-08-01T09:00:00.000Z" },
      ],
    });
  }
  return [...byId.values()];
};

export interface StoreData {
  users: User[];
  companies: Company[];
  industryNodes: typeof industryNodes;
  industryEdges: typeof industryEdges;
  tasks: ResearchTask[];
  audits: AuditEvent[];
  documents: DocumentRecord[];
  entityCandidates: EntityCandidate[];
  settings: {
    externalModelsEnabled: boolean;
    knowledgeSource: string;
    sourceHash: string;
  };
}

export const initialStoreData = (): StoreData => ({
  users: structuredClone(users),
  companies: structuredClone(companies),
  industryNodes: structuredClone(industryNodes),
  industryEdges: structuredClone(industryEdges),
  tasks: structuredClone(tasks),
  audits: structuredClone(audits),
  documents: seededDocuments(),
  entityCandidates: [
    {
      id: "ec-1",
      rawName: "长光",
      candidateCompanyIds: ["c-charming"],
      reason: "名称过短，需要确认是否为长光卫星",
      status: "pending",
      createdAt: "2026-08-06T07:20:00.000Z",
    },
  ],
  settings: {
    externalModelsEnabled: false,
    knowledgeSource:
      "knowledge_sources/商业航天/【余香斋】【商业航天】图谱.pdf",
    sourceHash:
      "fc8f91e129a5a0b2008d2607bb909c1f6d71c0fc68fd776d1934aa7b5db63ef4",
  },
});

export class Store {
  data: StoreData;
  private pendingSave: Promise<void> = Promise.resolve();
  constructor(
    resetOrOptions:
      | boolean
      | {
          initialData?: StoreData;
          persistToDisk?: boolean;
          onSave?: (data: StoreData) => Promise<void>;
        } = false,
  ) {
    const options =
      typeof resetOrOptions === "boolean"
        ? { reset: resetOrOptions, persistToDisk: true }
        : { reset: false, persistToDisk: false, ...resetOrOptions };
    if (options.persistToDisk) fs.mkdirSync(dataDir, { recursive: true });
    this.onSave = options.onSave;
    this.persistToDisk = options.persistToDisk;
    this.data = options.initialData
      ? structuredClone(options.initialData)
      : !options.reset && options.persistToDisk && fs.existsSync(dataFile)
        ? JSON.parse(fs.readFileSync(dataFile, "utf8"))
        : initialStoreData();
    this.save();
  }
  private readonly onSave?: (data: StoreData) => Promise<void>;
  private readonly persistToDisk: boolean;
  save() {
    if (this.persistToDisk)
      fs.writeFileSync(dataFile, JSON.stringify(this.data, null, 2));
    if (this.onSave) {
      const snapshot = structuredClone(this.data);
      this.pendingSave = this.pendingSave.then(() => this.onSave!(snapshot));
    }
  }
  async flush() {
    await this.pendingSave;
  }
  reset() {
    this.data = initialStoreData();
    this.save();
  }
  user(id: string) {
    return this.data.users.find((u) => u.id === id) ?? this.data.users[0];
  }
  canSee(
    user: User,
    item: { visibility: string; ownerId?: string; projectId?: string },
  ) {
    if (item.visibility === "organization") return true;
    if (item.visibility === "private") return item.ownerId === user.id;
    if (item.visibility === "project")
      return !!item.projectId && user.projectIds.includes(item.projectId);
    return false;
  }
  visibleCompany(company: Company, user: User): Company {
    const evidence = company.evidence.filter((e) => this.canSee(user, e));
    const allowedEvidence = new Set(evidence.map((e) => e.id));
    const claims = company.claims.filter(
      (c) =>
        this.canSee(user, c) &&
        c.evidenceIds.every((id) => allowedEvidence.has(id)),
    );
    return { ...company, evidence, claims };
  }
  audit(actor: string, action: string, target: string, detail: string) {
    this.data.audits.unshift({
      id: randomUUID(),
      actor,
      action,
      target,
      detail,
      at: new Date().toISOString(),
    });
    this.save();
  }
}
