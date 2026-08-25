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
// The live local knowledge base is intentionally separate from the tracked,
// empty repository baseline so imported business material can never be pushed.
const dataFile = path.join(dataDir, "runtime-store.json");

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
  documents: [],
  entityCandidates: [],
  settings: {
    externalModelsEnabled: false,
    knowledgeSource: "",
    sourceHash: "",
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
