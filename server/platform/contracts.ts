import type { Request } from "express";
import type { Store } from "../store.js";
import type { Database } from "./database.js";
import type { User, Visibility } from "../../src/types.js";

export interface ObjectMetadata {
  contentType: string;
  fileName: string;
  uploadedBy: string;
  visibility: Visibility;
  projectId?: string;
}

export interface ObjectStorage {
  ensureBucket(): Promise<void>;
  put(key: string, content: Buffer, metadata: ObjectMetadata): Promise<void>;
  get(key: string): Promise<Buffer>;
  signedGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export interface ParseJobPayload {
  documentId: string;
  objectKey: string;
  fileName: string;
  fileType: string;
  uploadedBy: string;
}

export interface DocumentJobs {
  enqueue(payload: ParseJobPayload): Promise<string>;
  close(): Promise<void>;
}

export interface SearchHit {
  id: string;
  companyId: string;
  documentId: string;
  fileName: string;
  excerpt: string;
  visibility: Visibility;
  keywordScore: number;
  vectorScore: number;
  score: number;
}

export interface HybridSearch {
  search(
    query: string,
    user: User,
    companyId?: string,
    limit?: number,
  ): Promise<SearchHit[]>;
  indexEvidence(input: {
    evidenceId: string;
    companyId: string;
    documentId: string;
    fileName: string;
    text: string;
    visibility: Visibility;
    ownerId?: string;
    projectId?: string;
  }): Promise<void>;
}

export interface ModelRequest {
  taskId: string;
  prompt: string;
  context: SearchHit[];
  user: User;
  externalAllowed: boolean;
}

export interface ModelResult {
  provider: "local" | "external" | "deterministic";
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface ModelGateway {
  generate(request: ModelRequest): Promise<ModelResult>;
}

export interface PlatformTelemetry {
  observeSearch(input: {
    route: string;
    hits: number;
    latencyMs: number;
  }): void;
  observeModel(input: ModelResult & { success: boolean }): void;
  observeCitation(input: { valid: number; total: number }): void;
  metrics(): Promise<string>;
  contentType(): string;
}

export interface Authenticator {
  authenticate(req: Request, store: Store): Promise<User>;
  login(
    email: string,
    password: string,
    store: Store,
  ): Promise<{ accessToken: string; user: User }>;
}

export interface PlatformServices {
  storage: ObjectStorage;
  jobs: DocumentJobs;
  search: HybridSearch;
  models: ModelGateway;
  telemetry: PlatformTelemetry;
  auth: Authenticator;
  mode: "demo" | "production";
  database?: Database;
  close(): Promise<void>;
}
