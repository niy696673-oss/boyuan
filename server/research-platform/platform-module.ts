import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AnalysisAdapterError, type MaterialAnalysisPort } from './analysis/contracts.js';
import { BP_SECTION_TITLES } from './analysis/contracts.js';
import { createDeterministicCompanyListExtractionAdapter } from './company-list-extraction/deterministic-company-list-extraction.js';
import type { CompanyListExtractionPort } from './company-list-extraction/contracts.js';
import {
  extractLegalCompanyName,
  normalizeCompanyNameCandidate,
} from './company-name-normalizer.js';
import { createDeterministicConversationRelatednessAdapter } from './conversation-relatedness/deterministic-relatedness.js';
import type { ConversationRelatednessPort } from './conversation-relatedness/contracts.js';
import type {
  CompanyQuickCardAnalysisPort,
  CompanyQuickCardExtractionResult,
  CompanyQuickCardResult,
} from './company-quick-card/contracts.js';
import type {
  AdminOverview,
  AnalysisTaskRecord,
  AnalysisSectionRecord,
  CompanyListRecord,
  CompanyCardRecord,
  CompanyMaterialRecord,
  CompanyResearchRecord,
  CompanyProfile,
  ConfirmCompanyListRowsInput,
  CompanyDetail,
  CompanyMatchCase,
  CompanyRecord,
  ConversationDetail,
  ConversationStatus,
  ConversationSummary,
  DecideCandidateInput,
  DecideCandidatesBatchInput,
  DocumentContentRecord,
  DocumentRecord,
  EvidenceRecord,
  GlobalSearchResults,
  IngestDocumentInput,
  IngestDocumentResult,
  IngestCompanyNamesInput,
  KnowledgeCandidateRecord,
  PlatformNotification,
  KnowledgeRecord,
  IndustryDetail,
  IndustryRecord,
  IndustryReclassificationResult,
  IndustryResearchRecord,
  PlatformModule,
  ResolveCompanyMatchInput,
  ResolveConversationReuseInput,
  ResolveSubjectInput,
  ReviewCandidateEvidenceInput,
  SourceChannel,
  StartCompanyListResearchInput,
  StartCompanyResearchInput,
  StartFeishuCompanyResearchInput,
  StartFeishuCompanyResearchResult,
  StartIndustryResearchInput,
  TaskStatus,
  TaskStepRecord,
  TaskStepStatus,
  SubjectKind,
} from './contracts.js';
import { PlatformConflictError, PlatformInputError, PlatformNotFoundError } from './contracts.js';
import { classifyCanonicalIndustry } from './industry-taxonomy.js';
import { createDocumentParser } from './parsers/document-parser.js';
import { DocumentParserError, type DocumentParser, type ParsedBlock } from './parsers/contracts.js';
import type {
  QuickCardAnalysisPort,
  QuickCardAnalysisResult,
  QuickCardExtractionResult,
} from './quick-card/contracts.js';
import type {
  CompanyResearchPort,
  CompanyResearchWorkflowContext,
  CompanyResearchWorkflowSkill,
} from './research/contracts.js';
import type {
  IndustryResearchMaterial,
  IndustryResearchPort,
} from './industry-research/contracts.js';
import { researchSearchTrigger } from './research/search-policy.js';
import { validateWorkflowResearchOutput } from './research/workflow-policy.js';
import { SearchAdapterError, type SearchTriggerReason, type WebSearchPort, type WebSearchResultItem } from './search/contracts.js';
import { createDeterministicSemanticSearchAdapter } from './semantic-search/deterministic-semantic-search.js';
import type { SemanticCorpusItem, SemanticSearchPort } from './semantic-search/contracts.js';
import { reviewCandidateRiskReasons } from '../../shared/review-packages.js';

const PIPELINE_STEPS = [
  'persist_document',
  'verify_storage',
  'parse_document',
  'classify_material',
  'identify_company',
  'suggest_conversation_reuse',
  'analyze_material',
  'web_search',
  'generate_candidates',
] as const;

const RESEARCH_STEPS = [
  'resolve_company',
  'load_company_knowledge',
  'plan_external_search',
  'execute_external_search',
  'analyze_company',
  'generate_research_candidates',
] as const;

const INDUSTRY_RESEARCH_STEPS = [
  'load_industry_context',
  'plan_industry_search',
  'execute_industry_search',
  'analyze_industry',
] as const;

const SUPPORTED_STEP_HANDLERS = new Set<string>([
  ...PIPELINE_STEPS.slice(1),
  ...RESEARCH_STEPS,
  ...INDUSTRY_RESEARCH_STEPS,
]);
const DEFAULT_LEASE_MS = 30_000;
const MAX_AI_BLOCKS = 200;
const MAX_AI_BLOCK_CHARACTERS = 8_000;
const MAX_AI_TOTAL_CHARACTERS = 64_000;

interface PlatformModuleOptions {
  dataRoot: string;
  parser?: DocumentParser;
  analysis?: MaterialAnalysisPort;
  quickCardAnalysis?: QuickCardAnalysisPort;
  companyQuickCardAnalysis?: CompanyQuickCardAnalysisPort;
  research?: CompanyResearchPort;
  industryResearch?: IndustryResearchPort;
  search?: WebSearchPort;
  semanticSearch?: SemanticSearchPort;
  companyListExtraction?: CompanyListExtractionPort;
  conversationRelatedness?: ConversationRelatednessPort;
  now?: () => Date;
  nextId?: () => string;
  leaseMs?: number;
}

interface StagedFile {
  directory: string;
  path: string;
  fileName: string;
  mimeType?: string;
  bytes: number;
  sha256: string;
}

interface ResearchFinalizeInput {
  companyId?: string;
  companyName: string;
  ambiguousOptions: string[];
  intent: string;
  explicitWebSearch: boolean;
  workflow?: NonNullable<StartCompanyResearchInput['workflow']>;
}

interface IndustryResearchFinalizeInput {
  industryId: string;
  industryName: string;
  intent: string;
  explicitWebSearch: boolean;
}

interface FinalizeOptions {
  boundCompanyId?: string;
  boundIndustryId?: string;
  research?: ResearchFinalizeInput;
  industryResearch?: IndustryResearchFinalizeInput;
}

interface ConversationRow {
  conversation_id: string;
  thread_id: string;
  title: string;
  conversation_type: string;
  source_channel: string;
  conversation_status: string;
  conversation_created_at: string;
  conversation_updated_at: string;
  receipt_count: number;
  document_id: string;
  file_name: string;
  mime_type: string | null;
  bytes: number;
  sha256: string;
  parse_status: string;
  archive_status: string;
  material_type: string | null;
  document_created_at: string;
  task_id: string;
  task_type: string;
  task_status: string;
  current_step: string;
  task_created_at: string;
  task_updated_at: string;
  provider_id: string | null;
  model_id: string | null;
  variant: string | null;
  session_id: string | null;
  tool_usage_json: string | null;
  result_status: string | null;
}

interface StepRow {
  step_id: string;
  step_name: string;
  position: number;
  status: string;
  attempts: number;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
}

interface ClaimedStep {
  stepId: string;
  taskId: string;
  name: string;
}

interface VerificationTarget {
  documentId: string;
  fileName: string;
  bytes: number;
  sha256: string;
  storagePath: string;
  mimeType: string | null;
}

interface PipelineTarget extends VerificationTarget {
  conversationId: string;
  taskId: string;
}

interface ParsedBlockRow {
  block_id: string;
  kind: string;
  text: string;
  page: number | null;
  paragraph: number | null;
  heading_path_json: string | null;
  sheet: string | null;
  row_number: number | null;
  cell_range: string | null;
}

interface SemanticCorpusSnapshot {
  items: SemanticCorpusItem[];
  evidence: Map<string, EvidenceRecord>;
  materials: Map<string, CompanyMaterialRecord>;
}

type StepOutcome = 'completed' | 'skipped' | 'pending_confirmation' | 'waiting_confirmation';

export function createPlatformModule(options: PlatformModuleOptions): PlatformModule {
  return new SqlitePlatformModule(options);
}

class SqlitePlatformModule implements PlatformModule {
  readonly #dataRoot: string;
  readonly #documentsRoot: string;
  readonly #stagingRoot: string;
  readonly #db: DatabaseSync;
  readonly #now: () => Date;
  readonly #nextId: () => string;
  readonly #leaseMs: number;
  readonly #parser: DocumentParser;
  readonly #analysis?: MaterialAnalysisPort;
  readonly #quickCardAnalysis?: QuickCardAnalysisPort;
  readonly #companyQuickCardAnalysis?: CompanyQuickCardAnalysisPort;
  readonly #research?: CompanyResearchPort;
  readonly #industryResearch?: IndustryResearchPort;
  readonly #search?: WebSearchPort;
  readonly #semanticSearch: SemanticSearchPort;
  readonly #companyListExtraction: CompanyListExtractionPort;
  readonly #conversationRelatedness: ConversationRelatednessPort;
  readonly #companySearches = new Map<string, Promise<void>>();
  readonly #companyQuickAnalyses = new Map<string, Promise<CompanyQuickCardResult>>();
  #finalizeQueue: Promise<void> = Promise.resolve();
  #closed = false;

  constructor(options: PlatformModuleOptions) {
    const configuredRoot = resolve(options.dataRoot);
    mkdirSync(configuredRoot, { recursive: true, mode: 0o700 });
    this.#dataRoot = realpathSync(configuredRoot);
    this.#documentsRoot = join(this.#dataRoot, 'documents');
    this.#stagingRoot = join(this.#dataRoot, 'staging');
    const databaseRoot = join(this.#dataRoot, 'database');
    mkdirSync(this.#documentsRoot, { recursive: true, mode: 0o700 });
    mkdirSync(this.#stagingRoot, { recursive: true, mode: 0o700 });
    mkdirSync(databaseRoot, { recursive: true, mode: 0o700 });
    this.#assertManagedDirectory(this.#documentsRoot);
    this.#assertManagedDirectory(this.#stagingRoot);
    this.#assertManagedDirectory(databaseRoot);
    this.#now = options.now ?? (() => new Date());
    this.#nextId = options.nextId ?? randomUUID;
    this.#leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    this.#parser = options.parser ?? createDocumentParser();
    this.#analysis = options.analysis;
    this.#quickCardAnalysis = options.quickCardAnalysis;
    this.#companyQuickCardAnalysis = options.companyQuickCardAnalysis;
    this.#research = options.research;
    this.#industryResearch = options.industryResearch;
    this.#search = options.search;
    this.#semanticSearch = options.semanticSearch ?? createDeterministicSemanticSearchAdapter();
    this.#companyListExtraction = options.companyListExtraction ?? createDeterministicCompanyListExtractionAdapter();
    this.#conversationRelatedness = options.conversationRelatedness ?? createDeterministicConversationRelatednessAdapter();
    this.#db = new DatabaseSync(join(databaseRoot, 'platform.sqlite'));
    this.#migrate();
  }

  async ingestDocument(input: IngestDocumentInput): Promise<IngestDocumentResult> {
    this.#assertOpen();
    const replay = await this.#idempotentIngestResult(input);
    if (replay) return replay;
    const staged = await this.#stage(input);
    return this.#exclusive(async () => {
      const concurrentReplay = await this.#idempotentIngestResult(input, staged.sha256);
      if (concurrentReplay) {
        await rm(staged.directory, { recursive: true, force: true });
        return concurrentReplay;
      }
      return this.#finalize(input, staged);
    });
  }

  async ingestCompanyDocument(companyId: string, input: IngestDocumentInput): Promise<IngestDocumentResult> {
    this.#assertOpen();
    this.#companyRecord(companyId);
    const staged = await this.#stage(input);
    return this.#exclusive(() => this.#finalize(input, staged, { boundCompanyId: companyId }));
  }

  async ingestIndustryDocument(industryId: string, input: IngestDocumentInput): Promise<IngestDocumentResult> {
    this.#assertOpen();
    this.#industryRecord(industryId);
    const staged = await this.#stage(input);
    return this.#exclusive(() => this.#finalize(input, staged, { boundIndustryId: industryId }));
  }

  async ingestCompanyNames(input: IngestCompanyNamesInput): Promise<IngestDocumentResult> {
    const content = input.namesText.trim();
    if (!content) throw new PlatformInputError('company_names_required', '请提供包含公司名称的文本');
    const date = this.#now().toISOString().replace(/[-:]/gu, '').slice(0, 15);
    return this.ingestDocument({
      fileName: `粘贴公司名单-${date}.txt`,
      mimeType: 'text/plain',
      sourceChannel: input.sourceChannel,
      purpose: 'company_list',
      content: singleChunk(Buffer.from(content, 'utf8')),
    });
  }

  async getDocumentContent(documentId: string): Promise<DocumentContentRecord> {
    this.#assertOpen();
    const document = this.#db.prepare(`
      SELECT document_id, file_name, mime_type, storage_path
      FROM documents WHERE document_id = ?
    `).get(documentId) as {
      document_id: string;
      file_name: string;
      mime_type: string | null;
      storage_path: string;
    } | undefined;
    if (!document) {
      throw new PlatformNotFoundError(`document content not found: ${documentId}`);
    }

    try {
      const configuredPath = this.#resolveStoragePath(document.storage_path);
      const realPath = realpathSync(configuredPath);
      const relativeToDocuments = relative(this.#documentsRoot, realPath);
      if (
        !relativeToDocuments
        || relativeToDocuments.startsWith('..')
        || isAbsolute(relativeToDocuments)
      ) {
        throw new Error('document_storage_path_invalid');
      }
      const file = await stat(realPath);
      if (!file.isFile()) throw new Error('document_storage_not_file');
      return {
        documentId: document.document_id,
        fileName: document.file_name,
        ...(document.mime_type ? { mimeType: document.mime_type } : {}),
        bytes: file.size,
        content: createReadStream(realPath),
      };
    } catch {
      throw new PlatformNotFoundError(`document content unavailable: ${documentId}`);
    }
  }

  async quickAnalyzeConversation(conversationId: string): Promise<QuickCardAnalysisResult> {
    this.#assertOpen();
    if (!this.#quickCardAnalysis) {
      throw new PlatformInputError('quick_card_unavailable', '快速卡分析尚未配置');
    }
    const target = this.#db.prepare(`
      SELECT c.conversation_id AS conversationId, d.document_id AS documentId,
        d.file_name AS fileName, d.mime_type AS mimeType, d.storage_path AS storagePath
      FROM conversations c
      JOIN documents d ON d.document_id = c.primary_document_id
      WHERE c.conversation_id = ?
    `).get(conversationId) as {
      conversationId: string; documentId: string; fileName: string; mimeType: string | null; storagePath: string;
    } | undefined;
    if (!target) throw new PlatformNotFoundError(`conversation not found: ${conversationId}`);
    const storedBlocks = this.#loadParsedBlocks(target.documentId);
    const blocks = storedBlocks.length > 0 ? storedBlocks : (await this.#parser.parse({
      fileName: target.fileName,
      ...(target.mimeType ? { mimeType: target.mimeType } : {}),
      path: this.#resolveStoragePath(target.storagePath),
    })).blocks;
    const extraction = await this.#quickCardAnalysis.analyze({
      conversationId: target.conversationId,
      documentId: target.documentId,
      fileName: target.fileName,
      blocks,
    });
    const attached = this.#db.prepare(`
      SELECT company_id FROM conversation_companies
      WHERE conversation_id = ? AND role = 'primary'
    `).get(conversationId) as { company_id: string } | undefined;
    const matches = extraction.companyName === '材料未披露'
      ? []
      : this.#matchCompanies(extraction.companyName);
    const companyId = attached?.company_id
      ?? (matches.length === 1 ? matches[0] : undefined);
    const placement = companyId ? this.#db.prepare(`
      SELECT ci.industry_id FROM company_industries ci
      JOIN industries i ON i.industry_id = ci.industry_id
      WHERE ci.company_id = ? AND ci.status != 'rejected'
      ORDER BY CASE ci.status WHEN 'confirmed' THEN 0 WHEN 'candidate' THEN 1 ELSE 2 END,
        ci.updated_at DESC, i.updated_at DESC, ci.industry_id
      LIMIT 1
    `).get(companyId) as { industry_id: string } | undefined : undefined;
    const confidence = quickCardConfidence(extraction, Boolean(companyId));
    return {
      ...extraction,
      confidence,
      confidenceLevel: confidence >= 80 ? '高' : confidence >= 50 ? '中' : '低',
      navigation: {
        ...(companyId ? { companyId } : {}),
        ...(placement ? { industryId: placement.industry_id } : {}),
      },
    };
  }

  async quickAnalyzeCompanyResearch(conversationId: string): Promise<CompanyQuickCardResult> {
    this.#assertOpen();
    const target = this.#db.prepare(`
      SELECT r.run_id, r.task_id, r.company_id, m.proposed_name,
        c.canonical_name, c.status AS company_status
      FROM company_research_runs r
      JOIN analysis_tasks t ON t.task_id = r.task_id
      LEFT JOIN companies c ON c.company_id = r.company_id
      LEFT JOIN company_match_cases m ON m.conversation_id = t.conversation_id
      WHERE t.conversation_id = ?
    `).get(conversationId) as {
      run_id: string;
      task_id: string;
      company_id: string | null;
      proposed_name: string | null;
      canonical_name: string | null;
      company_status: string | null;
    } | undefined;
    if (!target) {
      throw new PlatformNotFoundError(`company research conversation not found: ${conversationId}`);
    }
    if (!target.company_id || !target.canonical_name) {
      return pendingCompanyIdentityQuickCard(target.proposed_name ?? '待确认公司主体');
    }
    const stored = this.#db.prepare(`
      SELECT result_json FROM company_quick_card_results WHERE run_id = ?
    `).get(target.run_id) as { result_json: string } | undefined;
    if (stored) return JSON.parse(stored.result_json) as CompanyQuickCardResult;
    let active = this.#companyQuickAnalyses.get(target.run_id);
    if (!active) {
      active = this.#buildCompanyQuickCard({
        conversationId,
        runId: target.run_id,
        taskId: target.task_id,
        companyId: target.company_id,
        companyName: target.canonical_name,
        identityState: target.company_status === 'active' ? 'existing' : 'provisional',
      });
      this.#companyQuickAnalyses.set(target.run_id, active);
      void active.finally(() => this.#companyQuickAnalyses.delete(target.run_id)).catch(() => undefined);
    }
    return active;
  }

  async #buildCompanyQuickCard(input: {
    conversationId: string;
    runId: string;
    taskId: string;
    companyId: string;
    companyName: string;
    identityState: 'existing' | 'provisional';
  }): Promise<CompanyQuickCardResult> {
    if (!this.#companyQuickCardAnalysis) {
      throw new PlatformInputError('company_quick_card_unavailable', '公司快速卡分析尚未配置');
    }
    await this.#ensureCompanyResearchSearch(input.taskId).catch(() => undefined);
    const existingKnowledge = this.#db.prepare(`
      SELECT knowledge_type, statement, value FROM knowledge
      WHERE company_id = ? AND status IN ('current', 'disputed')
      ORDER BY created_at DESC LIMIT 80
    `).all(input.companyId) as unknown as Array<{
      knowledge_type: string;
      statement: string;
      value: string | null;
    }>;
    const materialSummaries = this.#db.prepare(`
      SELECT section.summary FROM analysis_sections section
      JOIN analysis_tasks task ON task.task_id = section.task_id
      JOIN conversation_companies link ON link.conversation_id = task.conversation_id
      WHERE link.company_id = ? AND task.task_id != ?
      ORDER BY section.created_at DESC LIMIT 20
    `).all(input.companyId, input.taskId) as unknown as Array<{ summary: string }>;
    const webResults = this.#researchWebResults(input.runId);
    const extraction = await this.#companyQuickCardAnalysis.analyze({
      conversationId: input.conversationId,
      companyName: input.companyName,
      identityState: input.identityState,
      existingKnowledge: existingKnowledge.map((item) => ({
        knowledgeType: item.knowledge_type,
        statement: item.statement,
        ...(item.value ? { value: item.value } : {}),
      })),
      materialSummaries: materialSummaries.map((item) => item.summary),
      webResults,
    });
    const materialCount = this.#companyMaterials(input.companyId).length;
    const pending = this.#db.prepare(`
      SELECT COUNT(*) AS count FROM knowledge_candidates
      WHERE company_id = ? AND status IN ('pending', 'conflicted')
    `).get(input.companyId) as { count: number };
    const placement = input.identityState === 'existing' ? this.#db.prepare(`
      SELECT industry_id FROM company_industries
      WHERE company_id = ? AND status = 'confirmed'
      ORDER BY updated_at DESC, industry_id LIMIT 1
    `).get(input.companyId) as { industry_id: string } | undefined : undefined;
    const confidence = companyQuickCardConfidence(extraction, {
      identityState: input.identityState,
      sourceCount: webResults.length,
      materialCount,
      formalKnowledgeCount: existingKnowledge.length,
    });
    const result: CompanyQuickCardResult = {
      kind: 'company_research',
      status: 'completed',
      companyName: input.companyName,
      identityState: input.identityState,
      ...extraction,
      confidence,
      confidenceLevel: confidence >= 80 ? '高' : confidence >= 50 ? '中' : '低',
      sourceCount: webResults.length,
      materialCount,
      formalKnowledgeCount: existingKnowledge.length,
      pendingCandidateCount: pending.count,
      navigation: input.identityState === 'existing' ? {
        companyId: input.companyId,
        ...(placement ? { industryId: placement.industry_id } : {}),
      } : {},
    };
    this.#db.prepare(`
      INSERT OR IGNORE INTO company_quick_card_results (run_id, result_json, created_at)
      VALUES (?, ?, ?)
    `).run(input.runId, JSON.stringify(result), this.#now().toISOString());
    const saved = this.#db.prepare(`
      SELECT result_json FROM company_quick_card_results WHERE run_id = ?
    `).get(input.runId) as { result_json: string };
    return JSON.parse(saved.result_json) as CompanyQuickCardResult;
  }

  async listConversations(): Promise<ConversationSummary[]> {
    this.#assertOpen();
    return this.#conversationRows().map((row) => this.#toSummary(row));
  }

  async getConversation(conversationId: string): Promise<ConversationDetail> {
    this.#assertOpen();
    const row = this.#conversationRows('WHERE c.conversation_id = ?', conversationId)[0];
    if (!row) throw new PlatformNotFoundError(`conversation not found: ${conversationId}`);
    const summary = this.#toSummary(row);
    const steps = this.#db.prepare(`
      SELECT step_id, step_name, position, status, attempts, started_at, finished_at, error_code
      FROM task_steps WHERE task_id = ? ORDER BY position
    `).all(row.task_id) as unknown as StepRow[];
    const companyLink = this.#db.prepare("SELECT company_id FROM conversation_companies WHERE conversation_id = ? AND role = 'primary'")
      .get(conversationId) as { company_id: string } | undefined;
    const industryLink = this.#db.prepare(
      "SELECT industry_id FROM conversation_industries WHERE conversation_id = ? AND role = 'primary'",
    ).get(conversationId) as { industry_id: string } | undefined;
    const companyMatch = this.#companyMatchCase(conversationId);
    const companyList = this.#companyListByConversation(conversationId);
    const companyResearch = this.#companyResearchByTask(row.task_id);
    const industryResearch = this.#industryResearchByTask(row.task_id);
    const conversationReuse = this.#conversationReuseSuggestion(conversationId);
    return {
      ...summary,
      task: { ...summary.task, steps: steps.map(toStepRecord) },
      ...(companyLink ? { company: this.#companyRecord(companyLink.company_id) } : {}),
      ...(industryLink ? { industry: this.#industryRecord(industryLink.industry_id) } : {}),
      ...(companyMatch ? { companyMatch } : {}),
      analysisSections: this.#analysisSections(row.task_id),
      candidates: this.#candidateRecords('WHERE kc.task_id = ?', row.task_id),
      ...(companyList ? { companyList } : {}),
      ...(companyResearch ? { companyResearch } : {}),
      ...(industryResearch ? { industryResearch } : {}),
      ...(conversationReuse ? { conversationReuse } : {}),
      threadMaterials: this.#threadMaterials(row.thread_id),
    };
  }

  async resolveCompanyMatch(input: ResolveCompanyMatchInput): Promise<ConversationDetail> {
    this.#assertOpen();
    const matchCase = this.#db.prepare(`
      SELECT case_id, option_ids_json, status, version FROM company_match_cases WHERE conversation_id = ?
    `).get(input.conversationId) as { case_id: string; option_ids_json: string; status: string; version: number } | undefined;
    if (!matchCase) throw new PlatformNotFoundError(`company match case not found: ${input.conversationId}`);
    if (matchCase.status !== 'pending' || matchCase.version !== input.expectedVersion) {
      throw new PlatformConflictError('version_conflict', 'company match case has changed; refresh and retry');
    }
    let companyId = input.companyId;
    const optionIds = JSON.parse(matchCase.option_ids_json) as string[];
    if (companyId) {
      const company = this.#db.prepare("SELECT company_id FROM companies WHERE company_id = ? AND status != 'merged'").get(companyId);
      if (!company || (optionIds.length > 0 && !optionIds.includes(companyId))) {
        throw new PlatformInputError('invalid_company_option', 'selected company is not an available match');
      }
    } else if (input.createName?.trim()) {
      const name = canonicalCompanyName(input.createName);
      if (name.length < 2 || name.length > 80) throw new PlatformInputError('invalid_company_name', 'company name is invalid');
      companyId = this.#matchCompanies(name)[0] ?? this.#createCompany(name);
    } else {
      throw new PlatformInputError('company_resolution_required', 'select a company or provide a new company name');
    }
    const now = this.#now().toISOString();
    this.#transaction(() => {
      const changed = this.#db.prepare(`
        UPDATE company_match_cases
        SET status = 'resolved', resolved_company_id = ?, version = version + 1, updated_at = ?
        WHERE case_id = ? AND status = 'pending' AND version = ?
      `).run(companyId, now, matchCase.case_id, input.expectedVersion);
      if (changed.changes !== 1) throw new PlatformConflictError('version_conflict', 'company match case has changed; refresh and retry');
      const task = this.#db.prepare('SELECT task_id, task_type FROM analysis_tasks WHERE conversation_id = ?').get(input.conversationId) as { task_id: string; task_type: string };
      const stepName = task.task_type === 'company_research' ? 'resolve_company' : 'identify_company';
      this.#db.prepare(`
        UPDATE task_steps SET status = 'queued', finished_at = NULL, error_code = NULL
        WHERE task_id = ? AND step_name = ? AND status = 'pending_confirmation'
      `).run(task.task_id, stepName);
      this.#db.prepare('UPDATE analysis_tasks SET status = ?, current_step = ?, updated_at = ? WHERE task_id = ?')
        .run('queued', stepName, now, task.task_id);
      if (task.task_type === 'company_research') {
        this.#db.prepare('UPDATE company_research_runs SET company_id = ?, updated_at = ? WHERE task_id = ?')
          .run(companyId, now, task.task_id);
      }
      this.#db.prepare("UPDATE conversations SET status = 'processing', updated_at = ? WHERE conversation_id = ?")
        .run(now, input.conversationId);
      this.#audit('company_match.resolve', 'company_match_case', matchCase.case_id, {
        status: matchCase.status, version: matchCase.version, optionIds,
      }, { status: 'resolved', companyId, version: matchCase.version + 1 }, now);
    });
    return this.getConversation(input.conversationId);
  }

  async resolveConversationReuse(input: ResolveConversationReuseInput): Promise<ConversationDetail> {
    this.#assertOpen();
    if (input.action !== 'reuse' && input.action !== 'new') {
      throw new PlatformInputError('invalid_conversation_reuse_action', '请选择复用原对话或新建对话');
    }
    const suggestion = this.#db.prepare(`
      SELECT suggestion_id, target_conversation_id, status, version
      FROM conversation_reuse_suggestions WHERE conversation_id = ?
    `).get(input.conversationId) as {
      suggestion_id: string; target_conversation_id: string; status: string; version: number;
    } | undefined;
    if (!suggestion) throw new PlatformNotFoundError(`conversation reuse suggestion not found: ${input.conversationId}`);
    if (suggestion.status !== 'pending' || suggestion.version !== input.expectedVersion) {
      throw new PlatformConflictError('version_conflict', 'conversation reuse suggestion has changed; refresh and retry');
    }
    const target = this.#db.prepare('SELECT thread_id FROM conversations WHERE conversation_id = ?')
      .get(suggestion.target_conversation_id) as { thread_id: string } | undefined;
    if (!target) throw new PlatformNotFoundError(`target conversation not found: ${suggestion.target_conversation_id}`);
    const now = this.#now().toISOString();
    this.#transaction(() => {
      const changed = this.#db.prepare(`
        UPDATE conversation_reuse_suggestions SET status = ?, version = version + 1, updated_at = ?
        WHERE suggestion_id = ? AND status = 'pending' AND version = ?
      `).run(input.action === 'reuse' ? 'accepted' : 'rejected', now, suggestion.suggestion_id, input.expectedVersion);
      if (changed.changes !== 1) throw new PlatformConflictError('version_conflict', 'conversation reuse suggestion has changed; refresh and retry');
      if (input.action === 'reuse') {
        this.#db.prepare('UPDATE conversations SET thread_id = ?, updated_at = ? WHERE conversation_id = ?')
          .run(target.thread_id, now, input.conversationId);
      }
      const task = this.#db.prepare('SELECT task_id FROM analysis_tasks WHERE conversation_id = ?')
        .get(input.conversationId) as { task_id: string } | undefined;
      if (!task) throw new Error('analysis_task_missing');
      const step = this.#db.prepare(`
        SELECT step_id, position, status FROM task_steps WHERE task_id = ? AND step_name = 'suggest_conversation_reuse'
      `).get(task.task_id) as { step_id: string; position: number; status: string } | undefined;
      if (!step) throw new Error('conversation_reuse_step_missing');
      if (step.status === 'pending_confirmation') {
        this.#db.prepare(`
          UPDATE task_steps SET status = 'completed', finished_at = ?, error_code = NULL
          WHERE step_id = ? AND status = 'pending_confirmation'
        `).run(now, step.step_id);
        const next = this.#db.prepare(`
          SELECT step_id, step_name FROM task_steps WHERE task_id = ? AND position > ? ORDER BY position LIMIT 1
        `).get(task.task_id, step.position) as { step_id: string; step_name: string } | undefined;
        if (next) {
          this.#db.prepare("UPDATE task_steps SET status = 'queued' WHERE step_id = ? AND status = 'blocked'").run(next.step_id);
          this.#db.prepare("UPDATE analysis_tasks SET status = 'waiting', current_step = ?, updated_at = ? WHERE task_id = ?")
            .run(next.step_name, now, task.task_id);
          this.#db.prepare("UPDATE conversations SET status = 'waiting', updated_at = ? WHERE conversation_id = ?")
            .run(now, input.conversationId);
        }
      }
      this.#audit('conversation_reuse.resolve', 'conversation_reuse_suggestion', suggestion.suggestion_id, {
        status: suggestion.status, version: suggestion.version, targetConversationId: suggestion.target_conversation_id,
      }, { status: input.action === 'reuse' ? 'accepted' : 'rejected', version: suggestion.version + 1 }, now);
    });
    return this.getConversation(input.conversationId);
  }

  async listCandidates(status?: KnowledgeCandidateRecord['status']): Promise<KnowledgeCandidateRecord[]> {
    this.#assertOpen();
    if (!status) return this.#candidateRecords();
    const allowed: KnowledgeCandidateRecord['status'][] = ['pending', 'confirmed', 'modified_confirmed', 'rejected', 'conflicted'];
    if (!allowed.includes(status)) throw new PlatformInputError('invalid_candidate_status', 'candidate status is invalid');
    return this.#candidateRecords('WHERE kc.status = ?', status);
  }

  async decideCandidate(input: DecideCandidateInput): Promise<KnowledgeCandidateRecord> {
    this.#assertOpen();
    const candidate = this.#candidateRecords('WHERE kc.candidate_id = ?', input.candidateId)[0];
    if (!candidate) throw new PlatformNotFoundError(`candidate not found: ${input.candidateId}`);
    if (!['pending', 'conflicted'].includes(candidate.status) || candidate.version !== input.expectedVersion) {
      throw new PlatformConflictError('version_conflict', 'candidate has changed; refresh and retry');
    }
    this.#validateCandidateDecision(candidate, input);
    const now = this.#now().toISOString();
    this.#transaction(() => {
      this.#applyCandidateDecision(candidate, input, now);
    });
    const updated = this.#candidateRecords('WHERE kc.candidate_id = ?', input.candidateId)[0];
    if (!updated) throw new Error('candidate_update_missing');
    return updated;
  }

  async decideCandidatesBatch(
    input: DecideCandidatesBatchInput,
  ): Promise<KnowledgeCandidateRecord[]> {
    this.#assertOpen();
    if (!Array.isArray(input.decisions) || input.decisions.length === 0) {
      throw new PlatformInputError('batch_decisions_required', '请选择要批量处理的候选');
    }
    if (input.decisions.length > 100) {
      throw new PlatformInputError('batch_decisions_too_large', '每次最多批量处理 100 条候选');
    }
    const candidateIds = input.decisions.map((item) => item.candidateId);
    if (new Set(candidateIds).size !== candidateIds.length) {
      throw new PlatformInputError('duplicate_batch_candidate', '同一候选不能重复处理');
    }
    const candidates = new Map(
      candidateIds.flatMap((candidateId) => {
        const candidate = this.#candidateRecords(
          'WHERE kc.candidate_id = ?',
          candidateId,
        )[0];
        return candidate ? [[candidateId, candidate] as const] : [];
      }),
    );
    const confirmedTypes = new Set<string>();
    for (const decision of input.decisions) {
      if (decision.action !== 'confirm' && decision.action !== 'reject') {
        throw new PlatformInputError('invalid_batch_action', '批量处理只支持确认或驳回');
      }
      const candidate = candidates.get(decision.candidateId);
      if (!candidate) {
        throw new PlatformNotFoundError(`candidate not found: ${decision.candidateId}`);
      }
      if (
        !['pending', 'conflicted'].includes(candidate.status)
        || candidate.version !== decision.expectedVersion
      ) {
        throw new PlatformConflictError('version_conflict', '候选已变化，请刷新后重试');
      }
      const reasons = reviewCandidateRiskReasons(candidate);
      if (reasons.length) {
        throw new PlatformInputError(
          decision.action === 'confirm'
            ? 'unsafe_batch_confirmation'
            : 'unsafe_batch_rejection',
          `候选需要逐条处理：${reasons.join('、')}`,
        );
      }
      this.#validateCandidateDecision(candidate, decision);
      if (decision.action === 'confirm') {
        const typeKey = `${candidate.companyId}:${candidate.knowledgeType}`;
        if (confirmedTypes.has(typeKey)) {
          throw new PlatformInputError(
            'batch_knowledge_type_conflict',
            '同一主体的同类知识每批只能确认一条',
          );
        }
        confirmedTypes.add(typeKey);
      }
    }
    const now = this.#now().toISOString();
    this.#transaction(() => {
      for (const decision of input.decisions) {
        const candidate = candidates.get(decision.candidateId);
        if (!candidate) throw new Error('validated_batch_candidate_missing');
        this.#applyCandidateDecision(candidate, decision, now);
      }
    });
    return candidateIds.map((candidateId) => {
      const candidate = this.#candidateRecords(
        'WHERE kc.candidate_id = ?',
        candidateId,
      )[0];
      if (!candidate) throw new Error('candidate_update_missing');
      return candidate;
    });
  }

  #validateCandidateDecision(
    candidate: KnowledgeCandidateRecord,
    input: DecideCandidateInput,
  ): void {
    if (input.action !== 'confirm' && input.action !== 'modify' && input.action !== 'reject') {
      throw new PlatformInputError('invalid_confirmation_action', 'confirmation action is invalid');
    }
    if (input.action !== 'reject' && candidate.evidence.length === 0) {
      throw new PlatformInputError('candidate_evidence_required', '候选至少需要一条支持证据才能确认');
    }
    if (input.action === 'modify' && !input.statement?.trim()) {
      throw new PlatformInputError('statement_required', 'modified statement is required');
    }
  }

  #applyCandidateDecision(
    candidate: KnowledgeCandidateRecord,
    input: DecideCandidateInput,
    now: string,
  ): void {
    const statement = input.action === 'modify'
      ? input.statement?.trim()
      : candidate.statement;
    const decidedStatement = statement ?? candidate.statement;
    const value = input.action === 'modify' ? input.value?.trim() : candidate.value;
    const effectiveAt = input.action === 'modify'
      ? input.effectiveAt?.trim()
      : candidate.effectiveAt;
    const resultingStatus = input.action === 'reject'
      ? 'rejected'
      : input.action === 'modify'
        ? 'modified_confirmed'
        : 'confirmed';
    let knowledgeId: string | undefined;
    let after: Record<string, unknown> | undefined;

    if (input.action !== 'reject') {
      const previous = this.#db.prepare(`
        SELECT knowledge_id, statement, value, version, status FROM knowledge
        WHERE company_id = ? AND knowledge_type = ? AND status IN ('current', 'disputed')
        ORDER BY version DESC, created_at DESC, knowledge_id DESC LIMIT 1
      `).get(candidate.companyId, candidate.knowledgeType) as {
        knowledge_id: string; statement: string; value: string | null; version: number; status: string;
      } | undefined;
      knowledgeId = this.#nextId();
      this.#db.prepare(`
        UPDATE knowledge SET status = 'superseded'
        WHERE company_id = ? AND knowledge_type = ? AND status IN ('current', 'disputed')
      `).run(candidate.companyId, candidate.knowledgeType);
      this.#db.prepare(`
        INSERT INTO knowledge (
          knowledge_id, company_id, knowledge_type, statement, value, effective_at, status,
          version, supersedes_id, source_candidate_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        knowledgeId, candidate.companyId, candidate.knowledgeType, decidedStatement,
        value || null, effectiveAt || null, 'current',
        (previous?.version ?? 0) + 1, previous?.knowledge_id ?? null,
        candidate.candidateId, now,
      );
      this.#db.prepare(`
        INSERT INTO knowledge_evidence (knowledge_id, evidence_id)
        SELECT ?, evidence_id FROM candidate_evidence WHERE candidate_id = ? AND status = 'supporting'
      `).run(knowledgeId, candidate.candidateId);
      this.#db.prepare('UPDATE companies SET version = version + 1, updated_at = ? WHERE company_id = ?')
        .run(now, candidate.companyId);
      after = { knowledgeId, statement: decidedStatement, value, effectiveAt, status: 'current' };
    }

    const changed = this.#db.prepare(`
      UPDATE knowledge_candidates SET status = ?, version = version + 1, statement = ?, value = ?, effective_at = ?, updated_at = ?
      WHERE candidate_id = ? AND version = ? AND status IN ('pending', 'conflicted')
    `).run(resultingStatus, decidedStatement, value || null, effectiveAt || null, now, candidate.candidateId, input.expectedVersion);
    if (changed.changes !== 1) {
      throw new PlatformConflictError('version_conflict', 'candidate has changed; refresh and retry');
    }
    this.#db.prepare(`
      INSERT INTO confirmation_records (
        confirmation_id, candidate_id, action, before_json, after_json,
        expected_version, resulting_knowledge_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.#nextId(), candidate.candidateId, input.action, JSON.stringify(candidate),
      after ? JSON.stringify(after) : null, input.expectedVersion, knowledgeId ?? null, now,
    );
    this.#audit(`candidate.${input.action}`, 'knowledge_candidate', candidate.candidateId, candidate as unknown as Record<string, unknown>, {
      status: resultingStatus, version: candidate.version + 1, ...(after ?? {}),
    }, now);
    if (input.action !== 'reject') {
      this.#applyOrganizationCandidate(candidate, decidedStatement, value, now);
    }
    if (input.action !== 'reject' && candidate.sectionKey === 'industry_chain_position') {
      this.#db.prepare(`
        UPDATE company_industries SET status = 'confirmed', position_label = ?, updated_at = ?
        WHERE company_id = ? AND industry_id IN (
          SELECT im.industry_id FROM industry_materials im
          JOIN analysis_tasks task ON task.conversation_id = im.conversation_id
          WHERE task.task_id = (
            SELECT task_id FROM knowledge_candidates WHERE candidate_id = ?
          )
        )
      `).run(value || decidedStatement, now, candidate.companyId, candidate.candidateId);
      this.#db.prepare(`
        UPDATE industries SET status = 'active', updated_at = ? WHERE industry_id IN (
          SELECT industry_id FROM company_industries WHERE company_id = ? AND status = 'confirmed'
        )
      `).run(now, candidate.companyId);
    }
  }

  async reviewCandidateEvidence(input: ReviewCandidateEvidenceInput): Promise<KnowledgeCandidateRecord> {
    this.#assertOpen();
    if (input.action !== 'unsupported' && input.action !== 'restore') {
      throw new PlatformInputError('invalid_evidence_review_action', '证据操作无效');
    }
    const candidate = this.#candidateRecords('WHERE kc.candidate_id = ?', input.candidateId)[0];
    if (!candidate) throw new PlatformNotFoundError(`candidate not found: ${input.candidateId}`);
    if (!['pending', 'conflicted'].includes(candidate.status) || candidate.version !== input.expectedVersion) {
      throw new PlatformConflictError('version_conflict', 'candidate has changed; refresh and retry');
    }
    const association = this.#db.prepare(`
      SELECT status FROM candidate_evidence WHERE candidate_id = ? AND evidence_id = ?
    `).get(input.candidateId, input.evidenceId) as { status: string } | undefined;
    if (!association) throw new PlatformNotFoundError(`candidate evidence not found: ${input.evidenceId}`);
    const expectedStatus = input.action === 'unsupported' ? 'supporting' : 'unsupported';
    const nextStatus = input.action === 'unsupported' ? 'unsupported' : 'supporting';
    if (association.status !== expectedStatus) throw new PlatformConflictError('version_conflict', 'evidence association has changed; refresh and retry');
    const now = this.#now().toISOString();
    this.#transaction(() => {
      const changed = this.#db.prepare(`
        UPDATE candidate_evidence SET status = ?, updated_at = ?
        WHERE candidate_id = ? AND evidence_id = ? AND status = ?
      `).run(nextStatus, now, input.candidateId, input.evidenceId, expectedStatus);
      if (changed.changes !== 1) throw new PlatformConflictError('version_conflict', 'evidence association has changed; refresh and retry');
      const candidateChanged = this.#db.prepare(`
        UPDATE knowledge_candidates SET version = version + 1, updated_at = ?
        WHERE candidate_id = ? AND version = ?
      `).run(now, input.candidateId, input.expectedVersion);
      if (candidateChanged.changes !== 1) throw new PlatformConflictError('version_conflict', 'candidate has changed; refresh and retry');
      this.#audit(`candidate_evidence.${input.action}`, 'knowledge_candidate', input.candidateId, {
        evidenceId: input.evidenceId, status: expectedStatus, version: input.expectedVersion,
      }, { evidenceId: input.evidenceId, status: nextStatus, version: input.expectedVersion + 1 }, now);
    });
    const updated = this.#candidateRecords('WHERE kc.candidate_id = ?', input.candidateId)[0];
    if (!updated) throw new Error('candidate_update_missing');
    return updated;
  }

  async restoreKnowledge(knowledgeId: string, expectedCompanyVersion: number): Promise<CompanyDetail> {
    this.#assertOpen();
    const knowledge = this.#db.prepare(`
      SELECT knowledge_id, company_id, knowledge_type, statement, version, status
      FROM knowledge WHERE knowledge_id = ?
    `).get(knowledgeId) as {
      knowledge_id: string; company_id: string; knowledge_type: string;
      statement: string; version: number; status: string;
    } | undefined;
    if (!knowledge) throw new PlatformNotFoundError(`knowledge not found: ${knowledgeId}`);
    if (knowledge.status !== 'superseded') {
      throw new PlatformInputError('knowledge_not_restorable', '只能将已替代的历史版本设为当前版本');
    }
    const now = this.#now().toISOString();
    this.#transaction(() => {
      const companyChanged = this.#db.prepare(`
        UPDATE companies SET version = version + 1, updated_at = ?
        WHERE company_id = ? AND version = ?
      `).run(now, knowledge.company_id, expectedCompanyVersion);
      if (companyChanged.changes !== 1) {
        throw new PlatformConflictError('version_conflict', '公司知识已变更，请刷新后重试');
      }
      const previouslyCurrent = this.#db.prepare(`
        SELECT knowledge_id, statement, version, status FROM knowledge
        WHERE company_id = ? AND knowledge_type = ? AND status IN ('current', 'disputed')
      `).all(knowledge.company_id, knowledge.knowledge_type) as unknown as Array<{
        knowledge_id: string; statement: string; version: number; status: string;
      }>;
      this.#db.prepare(`
        UPDATE knowledge SET status = 'superseded'
        WHERE company_id = ? AND knowledge_type = ? AND status IN ('current', 'disputed')
      `).run(knowledge.company_id, knowledge.knowledge_type);
      const changed = this.#db.prepare("UPDATE knowledge SET status = 'current' WHERE knowledge_id = ? AND status = 'superseded'")
        .run(knowledge.knowledge_id);
      if (changed.changes !== 1) throw new PlatformConflictError('knowledge_restore_conflict', '知识版本已变更，请刷新后重试');
      this.#audit('knowledge.restore', 'knowledge', knowledge.knowledge_id, {
        status: knowledge.status, companyVersion: expectedCompanyVersion,
        previouslyCurrent,
      }, {
        status: 'current', version: knowledge.version, statement: knowledge.statement,
        companyVersion: expectedCompanyVersion + 1,
      }, now);
    });
    return this.getCompany(knowledge.company_id);
  }

  async listCompanies(): Promise<CompanyCardRecord[]> {
    this.#assertOpen();
    const rows = this.#db.prepare(`
      SELECT company.company_id
      FROM companies company
      WHERE company.status != 'merged'
        AND NOT (
          NOT EXISTS (
            SELECT 1 FROM knowledge
            WHERE knowledge.company_id = company.company_id
              AND knowledge.status IN ('current', 'disputed')
          )
          AND NOT EXISTS (
            SELECT 1
            FROM conversation_companies link
            JOIN analysis_tasks task ON task.conversation_id = link.conversation_id
            JOIN analysis_sections section ON section.task_id = task.task_id
            WHERE link.company_id = company.company_id
          )
          AND EXISTS (
            SELECT 1
            FROM conversation_companies link
            JOIN analysis_tasks task ON task.conversation_id = link.conversation_id
            WHERE link.company_id = company.company_id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM conversation_companies link
            JOIN analysis_tasks task ON task.conversation_id = link.conversation_id
            WHERE link.company_id = company.company_id
              AND task.status NOT IN ('failed', 'cancelled')
          )
        )
      ORDER BY company.updated_at DESC, company.canonical_name
    `)
      .all() as unknown as Array<{ company_id: string }>;
    return rows.map((row) => this.#companyCardRecord(row.company_id));
  }

  async getCompany(companyId: string): Promise<CompanyDetail> {
    this.#assertOpen();
    const company = this.#companyRecord(companyId);
    const knowledge = this.#knowledgeRecords(companyId);
    const pending = this.#db.prepare("SELECT COUNT(*) AS count FROM knowledge_candidates WHERE company_id = ? AND status IN ('pending', 'conflicted')")
      .get(companyId) as { count: number };
    const materials = this.#companyMaterials(companyId);
    const pendingCandidates = this.#candidateRecords("WHERE kc.company_id = ? AND kc.status IN ('pending', 'conflicted')", companyId);
    const research = this.#db.prepare(`
      SELECT c.conversation_id, r.run_id, r.intent, c.status, r.trigger_reason, r.summary, r.updated_at
      FROM company_research_runs r
      JOIN analysis_tasks t ON t.task_id = r.task_id
      JOIN conversations c ON c.conversation_id = t.conversation_id
      WHERE r.company_id = ? ORDER BY r.updated_at DESC, r.run_id DESC
    `).all(companyId) as unknown as Array<{
      conversation_id: string; run_id: string; intent: string; status: string; trigger_reason: string | null;
      summary: string | null; updated_at: string;
    }>;
    const relationRows = this.#db.prepare(`
      SELECT relation_id, from_company_id, to_company_id, relation_type, status, evidence_id
      FROM company_relations WHERE from_company_id = ? OR to_company_id = ? ORDER BY created_at DESC, relation_id
    `).all(companyId, companyId) as unknown as Array<{
      relation_id: string; from_company_id: string; to_company_id: string; relation_type: string; status: string; evidence_id: string | null;
    }>;
    const latestMaterialAnalysis = this.#latestMaterialAnalysisDetail(companyId);
    return {
      ...company,
      knowledge,
      pendingCandidateCount: pending.count,
      materialCount: materials.length,
      profile: this.#companyProfile(companyId),
      materials,
      pendingCandidates,
      researchRecords: research.map((item) => ({
        conversationId: item.conversation_id,
        runId: item.run_id,
        intent: item.intent,
        status: item.status as ConversationStatus,
        ...(item.trigger_reason ? { triggerReason: item.trigger_reason as CompanyResearchRecord['triggerReason'] } : {}),
        ...(item.summary ? { summary: item.summary } : {}),
        updatedAt: item.updated_at,
      })),
      relations: relationRows.map((item) => {
        const outgoing = item.from_company_id === companyId;
        return {
          relationId: item.relation_id,
          direction: outgoing ? 'outgoing' as const : 'incoming' as const,
          relationType: item.relation_type,
          status: relationStatus(item.status),
          company: this.#companyRecord(outgoing ? item.to_company_id : item.from_company_id),
          ...(item.evidence_id ? { evidence: this.#evidenceById(item.evidence_id) } : {}),
        };
      }),
      industryPlacements: this.#companyIndustryPlacements(companyId),
      ...(latestMaterialAnalysis ? { latestMaterialAnalysis } : {}),
    };
  }

  async getCompanyResearchWorkflowSources(companyId: string) {
    this.#assertOpen();
    this.#companyRecord(companyId);
    return this.#companyResearchWorkflowMaterials(companyId).map((material) => ({
      sourceId: material.sourceId,
      title: material.title,
      ...(material.locator ? { locator: material.locator } : {}),
    }));
  }

  async setCompanyWatched(companyId: string, watched: boolean, expectedVersion: number): Promise<CompanyDetail> {
    this.#assertOpen();
    const before = this.#companyRecord(companyId);
    const currentWatch = this.#db.prepare('SELECT watched FROM companies WHERE company_id = ?')
      .get(companyId) as { watched: number };
    const now = this.#now().toISOString();
    this.#transaction(() => {
      const changed = this.#db.prepare(`
        UPDATE companies SET watched = ?, version = version + 1, updated_at = ?
        WHERE company_id = ? AND version = ?
      `).run(watched ? 1 : 0, now, companyId, expectedVersion);
      if (changed.changes !== 1) {
        throw new PlatformConflictError('version_conflict', '公司档案已变更，请刷新后重试');
      }
      this.#audit('company.watch.set', 'company', companyId, {
        watched: Boolean(currentWatch.watched), version: before.version,
      }, { watched, version: expectedVersion + 1 }, now);
    });
    return this.getCompany(companyId);
  }

  async resolveSubject(input: ResolveSubjectInput): Promise<CompanyDetail> {
    this.#assertOpen();
    const source = this.#companyRecord(input.companyId);
    if (source.version !== input.expectedVersion) {
      throw new PlatformConflictError('version_conflict', '主体档案已变更，请刷新后重试');
    }
    if (!['confirm', 'link', 'merge'].includes(input.action)) {
      throw new PlatformInputError('invalid_subject_action', '主体处理方式无效');
    }
    const now = this.#now().toISOString();
    if (input.action === 'merge') {
      if (!input.targetCompanyId || input.targetCompanyId === input.companyId) {
        throw new PlatformInputError('target_company_required', '请选择要合并到的法律公司');
      }
      const target = this.#confirmedLegalCompany(input.targetCompanyId);
      this.#transaction(() => {
        const current = this.#db.prepare(`
          SELECT version FROM companies WHERE company_id = ?
        `).get(input.companyId) as { version: number } | undefined;
        if (!current || current.version !== input.expectedVersion) {
          throw new PlatformConflictError('version_conflict', '主体档案已变更，请刷新后重试');
        }
        this.#prepareSubjectLinksForMerge(input.companyId, target.companyId, now);
        this.#mergeExistingCompany(input.companyId, target.companyId, now);
      });
      return this.getCompany(target.companyId);
    }

    const kind = input.subjectKind;
    if (!kind) {
      throw new PlatformInputError('subject_kind_required', '请选择明确的主体类型');
    }
    let target: CompanyRecord | undefined;
    if (input.action === 'link') {
      if (kind === 'legal_company') {
        throw new PlatformInputError('subject_link_kind_invalid', '法律公司不需要归属到另一家公司');
      }
      if (!input.targetCompanyId || input.targetCompanyId === input.companyId) {
        throw new PlatformInputError('target_company_required', '请选择归属的法律公司');
      }
      target = this.#confirmedLegalCompany(input.targetCompanyId);
    }
    this.#transaction(() => {
      const changed = this.#db.prepare(`
        UPDATE companies SET subject_kind = ?, subject_kind_status = 'confirmed',
          version = version + 1, updated_at = ?
        WHERE company_id = ? AND version = ? AND status != 'merged'
      `).run(kind, now, input.companyId, input.expectedVersion);
      if (changed.changes !== 1) {
        throw new PlatformConflictError('version_conflict', '主体档案已变更，请刷新后重试');
      }
      if (target) {
        this.#db.prepare(`
          INSERT INTO subject_company_links (
            subject_id, company_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(subject_id) DO UPDATE SET
            company_id = excluded.company_id,
            updated_at = excluded.updated_at
        `).run(input.companyId, target.companyId, now, now);
      } else {
        this.#db.prepare('DELETE FROM subject_company_links WHERE subject_id = ?')
          .run(input.companyId);
      }
      this.#audit(
        `subject.${input.action}`,
        'company',
        input.companyId,
        {
          subjectKind: source.subjectKind,
          subjectKindStatus: source.subjectKindStatus,
          parentCompany: source.parentCompany,
          version: source.version,
        },
        {
          subjectKind: kind,
          subjectKindStatus: 'confirmed',
          ...(target ? { parentCompanyId: target.companyId } : {}),
          version: source.version + 1,
        },
        now,
      );
    });
    return this.getCompany(input.companyId);
  }

  async listIndustries(): Promise<IndustryRecord[]> {
    this.#assertOpen();
    const rows = this.#db.prepare('SELECT industry_id FROM industries ORDER BY updated_at DESC, name')
      .all() as unknown as Array<{ industry_id: string }>;
    return rows.map((row) => this.#industryRecord(row.industry_id));
  }

  async reclassifyIndustries(): Promise<IndustryReclassificationResult> {
    this.#assertOpen();
    const now = this.#now().toISOString();
    return this.#transaction(() => this.#reclassifyIndustriesInternal(now));
  }

  async countUnclassifiedIndustryMaterials(): Promise<number> {
    this.#assertOpen();
    const row = this.#db.prepare(`
      SELECT COUNT(DISTINCT conversations.primary_document_id) AS total
      FROM conversations
      JOIN analysis_tasks ON analysis_tasks.conversation_id = conversations.conversation_id
      WHERE analysis_tasks.task_type = 'material_analysis'
        AND analysis_tasks.status = 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM industry_materials
          WHERE industry_materials.document_id = conversations.primary_document_id
        )
    `).get() as { total: number };
    return row.total;
  }

  async getIndustry(industryId: string): Promise<IndustryDetail> {
    this.#assertOpen();
    const industry = this.#industryRecord(industryId);
    const nodes = this.#db.prepare(`
      SELECT node_id, stage, name, description, node_order FROM industry_nodes
      WHERE industry_id = ? ORDER BY node_order, node_id
    `).all(industryId) as unknown as Array<{
      node_id: string; stage: string; name: string; description: string | null; node_order: number;
    }>;
    const materialRows = this.#db.prepare(`
      SELECT im.conversation_id, d.document_id, d.file_name, d.material_type, c.status,
        c.source_channel, c.updated_at, im.evidence_id
      FROM industry_materials im
      JOIN conversations c ON c.conversation_id = im.conversation_id
      JOIN documents d ON d.document_id = im.document_id
      WHERE im.industry_id = ? ORDER BY c.updated_at DESC, c.conversation_id DESC
    `).all(industryId) as unknown as Array<{
      conversation_id: string; document_id: string; file_name: string; material_type: string | null;
      status: string; source_channel: string; updated_at: string; evidence_id: string | null;
    }>;
    const companyRows = this.#db.prepare(`
      SELECT ci.company_id, ci.node_id, nodes.name AS node_name, ci.position_label, ci.status, ci.evidence_id
      FROM company_industries ci LEFT JOIN industry_nodes nodes ON nodes.node_id = ci.node_id
      WHERE ci.industry_id = ? ORDER BY ci.updated_at DESC, ci.company_id
    `).all(industryId) as unknown as Array<{
      company_id: string; node_id: string | null; node_name: string | null; position_label: string;
      status: string; evidence_id: string | null;
    }>;
    const researchRows = this.#db.prepare(`
      SELECT c.conversation_id, c.status, r.run_id, r.intent, r.summary, r.updated_at
      FROM industry_research_runs r
      JOIN analysis_tasks t ON t.task_id = r.task_id
      JOIN conversations c ON c.conversation_id = t.conversation_id
      WHERE r.industry_id = ?
      ORDER BY r.updated_at DESC, r.run_id DESC
    `).all(industryId) as unknown as Array<{
      conversation_id: string;
      status: string;
      run_id: string;
      intent: string;
      summary: string | null;
      updated_at: string;
    }>;
    return {
      ...industry,
      nodes: nodes.map((node) => ({
        nodeId: node.node_id,
        stage: node.stage as IndustryDetail['nodes'][number]['stage'],
        name: node.name,
        ...(node.description ? { description: node.description } : {}),
        position: node.node_order,
      })),
      materials: materialRows.map((item) => ({
        conversationId: item.conversation_id,
        documentId: item.document_id,
        fileName: item.file_name,
        ...(item.material_type ? { materialType: item.material_type } : {}),
        status: item.status as ConversationStatus,
        sourceChannel: item.source_channel as SourceChannel,
        updatedAt: item.updated_at,
        ...(item.evidence_id ? { evidence: this.#evidenceById(item.evidence_id) } : {}),
      })),
      researchRecords: researchRows.map((item) => ({
        conversationId: item.conversation_id,
        runId: item.run_id,
        intent: item.intent,
        status: item.status as ConversationStatus,
        ...(item.summary ? { summary: item.summary } : {}),
        updatedAt: item.updated_at,
      })),
      companies: companyRows.map((item) => ({
        company: this.#companyRecord(item.company_id),
        ...(item.node_id ? { nodeId: item.node_id } : {}),
        ...(item.node_name ? { nodeName: item.node_name } : {}),
        positionLabel: item.position_label,
        status: relationStatus(item.status),
        ...(item.evidence_id ? { evidence: this.#evidenceById(item.evidence_id) } : {}),
      })),
    };
  }

  async setIndustryWatched(
    industryId: string,
    watched: boolean,
    expectedVersion: number,
  ): Promise<IndustryDetail> {
    this.#assertOpen();
    const before = this.#industryRecord(industryId);
    const now = this.#now().toISOString();
    this.#transaction(() => {
      const changed = this.#db.prepare(`
        UPDATE industries SET watched = ?, version = version + 1, updated_at = ?
        WHERE industry_id = ? AND version = ?
      `).run(watched ? 1 : 0, now, industryId, expectedVersion);
      if (changed.changes !== 1) {
        throw new PlatformConflictError('version_conflict', '行业档案已变更，请刷新后重试');
      }
      this.#audit(
        'industry.watch.set',
        'industry',
        industryId,
        { watched: before.watched, version: before.version },
        { watched, version: expectedVersion + 1 },
        now,
      );
    });
    return this.getIndustry(industryId);
  }

  async search(query: string): Promise<GlobalSearchResults> {
    this.#assertOpen();
    const normalized = query.trim();
    if (!normalized || normalized.length > 100) {
      throw new PlatformInputError('invalid_search_query', '搜索关键词不能为空且不能超过 100 字');
    }
    const corpus = this.#semanticCorpus();
    const semantic = await this.#semanticSearch.search({ query: normalized, items: corpus.items, limit: 80 });
    const matches = new Map(semantic.hits.map((hit) => [hit.id, {
      score: hit.score,
      reason: hit.reason,
      evidence: hit.evidenceIds.map((evidenceId) => corpus.evidence.get(evidenceId)).filter((value): value is EvidenceRecord => Boolean(value)),
    }]));
    const companyIds = semantic.hits.filter((hit) => hit.type === 'company').slice(0, 20).map((hit) => hit.id.slice('company:'.length));
    const materialKeys = semantic.hits.filter((hit) => hit.type === 'material').slice(0, 20).map((hit) => hit.id);
    const conversationIds = semantic.hits.filter((hit) => hit.type === 'conversation').slice(0, 20).map((hit) => hit.id.slice('conversation:'.length));
    const industryIds = semantic.hits.filter((hit) => hit.type === 'industry').slice(0, 20).map((hit) => hit.id.slice('industry:'.length));
    return {
      query: normalized,
      mode: 'semantic',
      providerId: semantic.providerId,
      modelId: semantic.modelId,
      companies: companyIds.map((companyId) => ({
        ...this.#companyCardRecord(companyId),
        match: requiredMatch(matches, `company:${companyId}`),
      })),
      materials: materialKeys.map((key) => ({
        ...requiredMaterial(corpus.materials, key),
        match: requiredMatch(matches, key),
      })),
      conversations: conversationIds.map((conversationId) => {
        const row = this.#conversationRows('WHERE c.conversation_id = ?', conversationId)[0];
        if (!row) throw new Error('semantic_conversation_missing');
        return { ...this.#toSummary(row), match: requiredMatch(matches, `conversation:${conversationId}`) };
      }),
      industries: industryIds.map((industryId) => ({
        ...this.#industryRecord(industryId),
        match: requiredMatch(matches, `industry:${industryId}`),
      })),
    };
  }

  async listNotifications(): Promise<PlatformNotification[]> {
    this.#assertOpen();
    const candidates = this.#db.prepare(`
      SELECT kc.candidate_id, kc.statement, kc.updated_at, companies.canonical_name
      FROM knowledge_candidates kc
      JOIN companies ON companies.company_id = kc.company_id
      WHERE kc.status IN ('pending', 'conflicted')
      ORDER BY kc.updated_at DESC LIMIT 30
    `).all() as unknown as Array<{
      candidate_id: string; statement: string; updated_at: string; canonical_name: string;
    }>;
    const failedTasks = this.#db.prepare(`
      SELECT tasks.task_id, tasks.updated_at, conversations.title, conversations.conversation_id
      FROM analysis_tasks tasks
      JOIN conversations ON conversations.conversation_id = tasks.conversation_id
      WHERE tasks.status = 'failed'
      ORDER BY tasks.updated_at DESC LIMIT 20
    `).all() as unknown as Array<{
      task_id: string; updated_at: string; title: string; conversation_id: string;
    }>;
    const completedResearch = this.#db.prepare(`
      SELECT tasks.task_id, tasks.updated_at, conversations.title, conversations.conversation_id
      FROM analysis_tasks tasks
      JOIN conversations ON conversations.conversation_id = tasks.conversation_id
      WHERE tasks.status = 'completed'
        AND tasks.task_type IN ('company_research', 'industry_research')
      ORDER BY tasks.updated_at DESC LIMIT 20
    `).all() as unknown as Array<{
      task_id: string; updated_at: string; title: string; conversation_id: string;
    }>;
    const readRows = this.#db.prepare('SELECT notification_id, read_at FROM notification_reads')
      .all() as unknown as Array<{ notification_id: string; read_at: string }>;
    const reads = new Map(readRows.map((item) => [item.notification_id, item.read_at]));
    return [
      ...candidates.map((item): PlatformNotification => notificationWithRead({
        notificationId: `candidate:${item.candidate_id}`,
        kind: 'candidate',
        title: `${item.canonical_name}有待确认知识`,
        description: item.statement.slice(0, 160),
        targetUrl: `/confirmations?candidateId=${encodeURIComponent(item.candidate_id)}`,
        createdAt: item.updated_at,
      }, reads)),
      ...failedTasks.map((item): PlatformNotification => notificationWithRead({
        notificationId: `task:${item.task_id}:failed`,
        kind: 'task_failed',
        title: `${item.title}处理失败`,
        description: '打开研究对话查看失败步骤并重试。',
        targetUrl: `/?conversationId=${encodeURIComponent(item.conversation_id)}`,
        createdAt: item.updated_at,
      }, reads)),
      ...completedResearch.map((item): PlatformNotification => notificationWithRead({
        notificationId: `task:${item.task_id}:completed`,
        kind: 'research_completed',
        title: `${item.title}已完成`,
        description: '研究结果已经保存，可以查看来源和待确认知识。',
        targetUrl: `/?conversationId=${encodeURIComponent(item.conversation_id)}`,
        createdAt: item.updated_at,
      }, reads)),
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async markNotificationRead(notificationId: string): Promise<PlatformNotification> {
    this.#assertOpen();
    const notification = (await this.listNotifications())
      .find((item) => item.notificationId === notificationId);
    if (!notification) {
      throw new PlatformNotFoundError(`notification not found: ${notificationId}`);
    }
    const readAt = this.#now().toISOString();
    this.#db.prepare(`
      INSERT INTO notification_reads (notification_id, read_at)
      VALUES (?, ?)
      ON CONFLICT(notification_id) DO UPDATE SET read_at = excluded.read_at
    `).run(notificationId, readAt);
    return { ...notification, readAt };
  }

  async startCompanyResearch(input: StartCompanyResearchInput): Promise<ConversationDetail> {
    return (await this.#startCompanyResearchWithSource(input, {
      sourceChannel: 'web',
    })).conversation;
  }

  async startFeishuCompanyResearch(
    input: StartFeishuCompanyResearchInput,
  ): Promise<StartFeishuCompanyResearchResult> {
    const sourceMessageId = input.sourceMessageId.trim();
    if (!sourceMessageId || sourceMessageId.length > 500 || /[\r\n]/u.test(sourceMessageId)) {
      throw new PlatformInputError('invalid_feishu_metadata', 'source message id is invalid');
    }
    const senderId = input.senderId?.trim();
    if (senderId !== undefined && (!senderId || senderId.length > 500 || /[\r\n]/u.test(senderId))) {
      throw new PlatformInputError('invalid_feishu_metadata', 'sender id is invalid');
    }
    const companyName = canonicalCompanyName(input.companyName);
    assertCompanyListName(companyName);
    return this.#startCompanyResearchWithSource({
      companyName,
      intent: `研究 ${companyName} 的公司概况、行业赛道、融资、团队、核心亮点与近期公开信号`,
      explicitWebSearch: true,
    }, {
      sourceChannel: 'feishu',
      sourceMessageId,
      sourceAttachmentKey: 'company-research',
      ...(senderId ? { senderId } : {}),
    });
  }

  async #startCompanyResearchWithSource(
    input: StartCompanyResearchInput,
    source: Pick<IngestDocumentInput, 'sourceChannel' | 'sourceMessageId' | 'sourceAttachmentKey' | 'senderId'>,
  ): Promise<StartFeishuCompanyResearchResult> {
    this.#assertOpen();
    if (source.sourceMessageId) {
      const sourceReplay = await this.#idempotentIngestResult({
        fileName: '公司研究请求.json',
        mimeType: 'application/json',
        ...source,
        content: singleChunk(Buffer.from('{}', 'utf8')),
      });
      if (sourceReplay) {
        return { conversation: sourceReplay.conversation, reusedResearch: true };
      }
    }
    const intent = input.intent.trim();
    if (!intent || intent.length > 500) throw new PlatformInputError('invalid_research_intent', '研究意图不能为空且不能超过 500 字');
    const workflow = normalizeCompanyResearchWorkflow(input.workflow);
    if (workflow && input.explicitWebSearch) {
      throw new PlatformInputError(
        'workflow_external_search_must_be_separate',
        '投研 Skill 仅使用已授权材料和正式知识；公开信息请另行发起常规研究',
      );
    }
    let companyId = input.companyId;
    let companyName: string;
    let ambiguousOptions: string[] = [];
    if (companyId) {
      companyName = this.#companyRecord(companyId).canonicalName;
    } else {
      companyName = canonicalCompanyName(input.companyName ?? '');
      assertCompanyListName(companyName);
      const matches = this.#matchCompanies(companyName);
      if (matches.length > 1) ambiguousOptions = matches;
      else companyId = matches[0] ?? this.#createCompany(companyName);
    }
    if (workflow) {
      if (!companyId) {
        throw new PlatformInputError(
          'workflow_company_required',
          '投研 Skill 必须绑定已确认的公司主体',
        );
      }
      this.#companyResearchWorkflowMaterialsForSourceIds(
        companyId,
        workflow.inputScopeApproval.sourceIds,
      );
    }
    const payload = Buffer.from(JSON.stringify({
      companyName,
      intent,
      explicitWebSearch: input.explicitWebSearch,
      ...(workflow ? { workflow } : {}),
    }), 'utf8');
    const documentInput: IngestDocumentInput = {
      fileName: `公司研究请求-${this.#now().toISOString().replace(/[-:]/gu, '').slice(0, 15)}.json`,
      mimeType: 'application/json',
      ...source,
      content: singleChunk(payload),
    };
    const staged = await this.#stage(documentInput);
    return this.#exclusive(async () => {
      const concurrentReplay = await this.#idempotentIngestResult(documentInput, staged.sha256);
      if (concurrentReplay) {
        await rm(staged.directory, { recursive: true, force: true });
        return { conversation: concurrentReplay.conversation, reusedResearch: true };
      }
      const result = await this.#finalize(documentInput, staged, {
        research: {
          ...(companyId ? { companyId } : {}),
          companyName,
          ambiguousOptions,
          intent,
          explicitWebSearch: input.explicitWebSearch,
          ...(workflow ? { workflow } : {}),
        },
      });
      return { conversation: result.conversation, reusedResearch: false };
    });
  }

  async startIndustryResearch(input: StartIndustryResearchInput): Promise<ConversationDetail> {
    this.#assertOpen();
    const intent = input.intent.trim();
    if (!intent || intent.length > 500) {
      throw new PlatformInputError(
        'invalid_research_intent',
        '研究意图不能为空且不能超过 500 字',
      );
    }
    const industry = this.#industryRecord(input.industryId);
    const payload = Buffer.from(JSON.stringify({
      industryId: industry.industryId,
      industryName: industry.name,
      intent,
      explicitWebSearch: input.explicitWebSearch,
    }), 'utf8');
    const documentInput: IngestDocumentInput = {
      fileName: `行业研究请求-${this.#now().toISOString().replace(/[-:]/gu, '').slice(0, 15)}.json`,
      mimeType: 'application/json',
      sourceChannel: 'web',
      content: singleChunk(payload),
    };
    const staged = await this.#stage(documentInput);
    const result = await this.#exclusive(() => this.#finalize(documentInput, staged, {
      boundIndustryId: industry.industryId,
      industryResearch: {
        industryId: industry.industryId,
        industryName: industry.name,
        intent,
        explicitWebSearch: input.explicitWebSearch,
      },
    }));
    return result.conversation;
  }

  async getCompanyList(listId: string): Promise<CompanyListRecord> {
    this.#assertOpen();
    return this.#companyListRecord(listId);
  }

  async confirmCompanyListRows(input: ConfirmCompanyListRowsInput): Promise<CompanyListRecord> {
    this.#assertOpen();
    if (input.rows.length === 0) throw new PlatformInputError('company_list_rows_required', '请选择至少一行');
    if (new Set(input.rows.map((row) => row.rowId)).size !== input.rows.length) {
      throw new PlatformInputError('duplicate_company_list_row', '同一行不能重复确认');
    }
    const list = this.#db.prepare('SELECT list_id, conversation_id FROM company_lists WHERE list_id = ?').get(input.listId) as {
      list_id: string; conversation_id: string;
    } | undefined;
    if (!list) throw new PlatformNotFoundError(`company list not found: ${input.listId}`);
    const now = this.#now().toISOString();
    this.#transaction(() => {
      for (const decision of input.rows) {
        const row = this.#db.prepare(`
          SELECT row_id, normalized_name, match_status, confirmation_status, option_ids_json,
            confirmed_company_id, version
          FROM company_list_rows WHERE list_id = ? AND row_id = ?
        `).get(input.listId, decision.rowId) as {
          row_id: string; normalized_name: string | null; match_status: string; confirmation_status: string;
          option_ids_json: string; confirmed_company_id: string | null; version: number;
        } | undefined;
        if (!row) throw new PlatformNotFoundError(`company list row not found: ${decision.rowId}`);
        if (row.confirmation_status === 'confirmed') continue;
        if (row.version !== decision.expectedVersion) {
          throw new PlatformConflictError('version_conflict', '公司名单行已变更，请刷新后重试');
        }
        const optionIds = JSON.parse(row.option_ids_json) as string[];
        let companyId = decision.companyId;
        if (companyId) {
          const company = this.#db.prepare("SELECT company_id FROM companies WHERE company_id = ? AND status != 'merged'").get(companyId);
          if (!company || (optionIds.length > 0 && !optionIds.includes(companyId))) {
            throw new PlatformInputError('invalid_company_option', '选择的公司不是可用主体');
          }
        } else if (decision.createName?.trim()) {
          const name = canonicalCompanyName(decision.createName);
          assertCompanyListName(name);
          const matches = this.#matchCompanies(name);
          if (matches.length > 1) throw new PlatformConflictError('ambiguous_company_name', '修正后的公司名仍对应多个主体');
          companyId = matches[0] ?? this.#insertCompany(name, now);
        } else if (row.match_status === 'existing' && optionIds.length === 1) {
          companyId = optionIds[0];
        } else if (row.match_status === 'new' && row.normalized_name) {
          const matches = this.#matchCompanies(row.normalized_name);
          if (matches.length > 1) throw new PlatformConflictError('ambiguous_company_name', '公司名已对应多个主体');
          companyId = matches[0] ?? this.#insertCompany(row.normalized_name, now);
        }
        if (!companyId) throw new PlatformInputError('company_resolution_required', '该行需要选择或修正公司主体');
        this.#db.prepare(`
          UPDATE company_list_rows
          SET confirmation_status = 'confirmed', confirmed_company_id = ?, version = version + 1, updated_at = ?
          WHERE row_id = ? AND version = ? AND confirmation_status = 'pending'
        `).run(companyId, now, row.row_id, decision.expectedVersion);
        this.#db.prepare(`
          INSERT OR IGNORE INTO conversation_companies (conversation_id, company_id, role, created_at)
          VALUES (?, ?, 'list_member', ?)
        `).run(list.conversation_id, companyId, now);
        this.#audit('company_list_row.confirm', 'company_list_row', row.row_id, {
          confirmationStatus: row.confirmation_status, version: row.version,
        }, { confirmationStatus: 'confirmed', companyId, version: row.version + 1 }, now);
      }
      this.#refreshCompanyListStatus(input.listId, list.conversation_id, now);
    });
    return this.#companyListRecord(input.listId);
  }

  async startCompanyListResearch(input: StartCompanyListResearchInput): Promise<CompanyListRecord> {
    this.#assertOpen();
    const list = this.#db.prepare('SELECT list_id FROM company_lists WHERE list_id = ?').get(input.listId);
    if (!list) throw new PlatformNotFoundError(`company list not found: ${input.listId}`);
    const companyIds = [...new Set(input.companyIds)];
    if (companyIds.length === 0) throw new PlatformInputError('research_companies_required', '请选择至少一家重点公司');
    const confirmed = this.#db.prepare(`
      SELECT DISTINCT confirmed_company_id AS company_id FROM company_list_rows
      WHERE list_id = ? AND confirmation_status = 'confirmed' AND confirmed_company_id IS NOT NULL
    `).all(input.listId) as unknown as Array<{ company_id: string }>;
    const allowed = new Set(confirmed.map((row) => row.company_id));
    if (companyIds.some((companyId) => !allowed.has(companyId))) {
      throw new PlatformInputError('unconfirmed_research_company', '只能研究已确认的名单公司');
    }
    const now = this.#now().toISOString();
    this.#transaction(() => {
      for (const companyId of companyIds) {
        this.#db.prepare(`
          INSERT OR IGNORE INTO company_research_requests (request_id, list_id, company_id, status, created_at)
          VALUES (?, ?, ?, 'queued', ?)
        `).run(this.#nextId(), input.listId, companyId, now);
      }
      this.#audit('company_list.research_requested', 'company_list', input.listId, undefined, { companyIds }, now);
    });
    for (const companyId of companyIds) {
      const request = this.#db.prepare(`
        SELECT request_id, conversation_id FROM company_research_requests WHERE list_id = ? AND company_id = ?
      `).get(input.listId, companyId) as { request_id: string; conversation_id: string | null };
      if (request.conversation_id) continue;
      try {
        const conversation = await this.startCompanyResearch({
          companyId,
          intent: '名单重点公司研究',
          explicitWebSearch: false,
        });
        this.#db.prepare('UPDATE company_research_requests SET conversation_id = ? WHERE request_id = ? AND conversation_id IS NULL')
          .run(conversation.conversationId, request.request_id);
      } catch (error) {
        this.#db.prepare("UPDATE company_research_requests SET status = 'failed' WHERE request_id = ?").run(request.request_id);
        throw error;
      }
    }
    return this.#companyListRecord(input.listId);
  }

  async listAdminOverview(): Promise<AdminOverview> {
    this.#assertOpen();
    const failures = this.#db.prepare(`
      SELECT t.task_id, t.conversation_id, c.title, d.file_name,
        s.step_name, s.error_code, s.attempts, s.finished_at
      FROM task_steps s
      JOIN analysis_tasks t ON t.task_id = s.task_id
      JOIN conversations c ON c.conversation_id = t.conversation_id
      JOIN documents d ON d.document_id = c.primary_document_id
      WHERE s.status = 'failed'
      ORDER BY s.finished_at DESC, s.step_id DESC
    `).all() as unknown as Array<{
      task_id: string; conversation_id: string; title: string; file_name: string;
      step_name: string; error_code: string | null; attempts: number; finished_at: string | null;
    }>;
    const identityRows = this.#db.prepare(`
      SELECT cm.case_id, cm.conversation_id, c.title, cm.proposed_name,
        cm.option_ids_json, cm.version, cm.updated_at
      FROM company_match_cases cm JOIN conversations c ON c.conversation_id = cm.conversation_id
      WHERE cm.status = 'pending'
      ORDER BY cm.updated_at DESC, cm.case_id DESC
    `).all() as unknown as Array<{
      case_id: string; conversation_id: string; title: string; proposed_name: string | null;
      option_ids_json: string; version: number; updated_at: string;
    }>;
    const duplicateRows = this.#db.prepare(`
      SELECT d.document_id, d.file_name, d.sha256, COUNT(re.receipt_id) AS receipt_count,
        MAX(re.received_at) AS last_received_at
      FROM documents d JOIN receipt_events re ON re.document_id = d.document_id
      GROUP BY d.document_id HAVING COUNT(re.receipt_id) > 1
      ORDER BY last_received_at DESC, d.document_id DESC
    `).all() as unknown as Array<{
      document_id: string; file_name: string; sha256: string; receipt_count: number; last_received_at: string;
    }>;
    const auditRows = this.#db.prepare(`
      SELECT audit_id, action, entity_type, entity_id, before_json, after_json, created_at
      FROM audit_records ORDER BY created_at DESC, audit_id DESC LIMIT 100
    `).all() as unknown as Array<{
      audit_id: string; action: string; entity_type: string; entity_id: string;
      before_json: string | null; after_json: string | null; created_at: string;
    }>;
    return {
      parseFailures: failures.map((row) => ({
        taskId: row.task_id,
        conversationId: row.conversation_id,
        title: row.title,
        fileName: row.file_name,
        stepName: row.step_name,
        errorCode: row.error_code ?? 'unknown_step_failure',
        attempts: row.attempts,
        failedAt: row.finished_at ?? '',
      })),
      identityExceptions: identityRows.map((row) => ({
        caseId: row.case_id,
        conversationId: row.conversation_id,
        title: row.title,
        ...(row.proposed_name ? { proposedName: row.proposed_name } : {}),
        options: (JSON.parse(row.option_ids_json) as string[]).map((companyId) => this.#companyRecord(companyId)),
        version: row.version,
        updatedAt: row.updated_at,
      })),
      duplicateMaterials: duplicateRows.map((row) => ({
        documentId: row.document_id,
        fileName: row.file_name,
        sha256: row.sha256,
        receiptCount: row.receipt_count,
        conversationIds: (this.#db.prepare(`
          SELECT conversation_id FROM conversations WHERE primary_document_id = ? ORDER BY created_at, conversation_id
        `).all(row.document_id) as unknown as Array<{ conversation_id: string }>).map((item) => item.conversation_id),
        lastReceivedAt: row.last_received_at,
      })),
      audits: auditRows.map((row) => ({
        auditId: row.audit_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        ...(row.before_json ? { before: JSON.parse(row.before_json) as Record<string, unknown> } : {}),
        ...(row.after_json ? { after: JSON.parse(row.after_json) as Record<string, unknown> } : {}),
        createdAt: row.created_at,
      })),
    };
  }

  async retryTask(taskId: string): Promise<ConversationDetail> {
    this.#assertOpen();
    const failure = this.#db.prepare(`
      SELECT t.task_id, t.conversation_id, t.status AS task_status,
        s.step_id, s.step_name, s.position, s.attempts, s.error_code
      FROM analysis_tasks t JOIN task_steps s ON s.task_id = t.task_id
      WHERE t.task_id = ? AND s.status = 'failed'
      ORDER BY s.position LIMIT 1
    `).get(taskId) as {
      task_id: string; conversation_id: string; task_status: string; step_id: string;
      step_name: string; position: number; attempts: number; error_code: string | null;
    } | undefined;
    if (!failure) throw new PlatformConflictError('task_not_retryable', '任务当前没有可重试的失败步骤');
    const now = this.#now().toISOString();
    this.#transaction(() => {
      const changed = this.#db.prepare(`
        UPDATE task_steps SET status = 'queued', lease_until = NULL, started_at = NULL,
          finished_at = NULL, error_code = NULL
        WHERE step_id = ? AND status = 'failed'
      `).run(failure.step_id);
      if (changed.changes !== 1) throw new PlatformConflictError('task_not_retryable', '失败步骤已变更，请刷新后重试');
      this.#db.prepare(`
        UPDATE analysis_tasks SET status = 'queued', current_step = ?, updated_at = ? WHERE task_id = ?
      `).run(failure.step_name, now, failure.task_id);
      this.#db.prepare("UPDATE conversations SET status = 'waiting', updated_at = ? WHERE conversation_id = ?")
        .run(now, failure.conversation_id);
      if (failure.step_name === 'parse_document') {
        this.#db.prepare(`
          UPDATE documents SET parse_status = 'queued'
          WHERE document_id = (SELECT primary_document_id FROM conversations WHERE conversation_id = ?)
        `).run(failure.conversation_id);
      }
      this.#audit('task.retry', 'analysis_task', failure.task_id, {
        stepName: failure.step_name, attempts: failure.attempts, errorCode: failure.error_code,
      }, { stepName: failure.step_name, status: 'queued' }, now);
    });
    return this.getConversation(failure.conversation_id);
  }

  async cancelTask(taskId: string): Promise<ConversationDetail> {
    this.#assertOpen();
    const task = this.#db.prepare(`
      SELECT task_id, conversation_id, status, current_step
      FROM analysis_tasks WHERE task_id = ?
    `).get(taskId) as {
      task_id: string;
      conversation_id: string;
      status: string;
      current_step: string;
    } | undefined;
    if (!task) throw new PlatformNotFoundError(`task not found: ${taskId}`);
    if (task.status === 'cancelled')
      return this.getConversation(task.conversation_id);
    if (task.status === 'completed' || task.status === 'failed') {
      throw new PlatformConflictError(
        'task_already_terminal',
        '已完成或失败的任务不能取消',
      );
    }
    const running = this.#db.prepare(`
      SELECT 1 AS running FROM task_steps
      WHERE task_id = ? AND status = 'running' LIMIT 1
    `).get(taskId);
    if (task.status === 'running' || running) {
      throw new PlatformConflictError(
        'task_already_running',
        '任务已开始执行，不能按排队任务取消',
      );
    }
    const now = this.#now().toISOString();
    this.#transaction(() => {
      this.#db.prepare(`
        UPDATE task_steps SET status = 'skipped', finished_at = ?,
          lease_until = NULL, error_code = 'cancelled_by_user'
        WHERE task_id = ? AND status IN (
          'blocked', 'queued', 'pending_confirmation'
        )
      `).run(now, task.task_id);
      this.#db.prepare(`
        UPDATE analysis_tasks SET status = 'cancelled',
          result_status = 'cancelled', updated_at = ?
        WHERE task_id = ?
      `).run(now, task.task_id);
      this.#db.prepare(`
        UPDATE conversations SET status = 'cancelled', updated_at = ?
        WHERE conversation_id = ?
      `).run(now, task.conversation_id);
      this.#audit(
        'task.cancel',
        'analysis_task',
        task.task_id,
        { status: task.status, currentStep: task.current_step },
        { status: 'cancelled', reason: 'cancelled_by_user' },
        now,
      );
    });
    return this.getConversation(task.conversation_id);
  }

  async runPendingSteps(limit = 10): Promise<number> {
    this.#assertOpen();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new PlatformInputError('invalid_limit', 'limit must be between 1 and 100');
    this.#recoverExpiredSteps();
    let completed = 0;
    let attempted = 0;
    const attemptedTasks = new Set<string>();
    while (attempted < limit) {
      const claimed = this.#claimNextStep(attemptedTasks);
      if (!claimed) break;
      attempted += 1;
      attemptedTasks.add(claimed.taskId);
      try {
        const outcome = await this.#executeStep(claimed);
        this.#completeStep(claimed, outcome);
        completed += 1;
      } catch (error) {
        this.#failStep(claimed, classifyStepError(error));
      }
    }
    return completed;
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#db.close();
  }

  async #stage(input: IngestDocumentInput): Promise<StagedFile> {
    const fileName = safeFileName(input.fileName);
    if (input.sourceChannel !== 'web' && input.sourceChannel !== 'feishu') {
      throw new PlatformInputError('invalid_source_channel', 'unsupported source channel');
    }
    const stagingId = this.#nextId();
    const directory = join(this.#stagingRoot, safeId(stagingId));
    await mkdir(directory, { recursive: false, mode: 0o700 });
    const path = join(directory, fileName);
    const handle = await open(path, 'wx', 0o600);
    const hash = createHash('sha256');
    let bytes = 0;
    try {
      for await (const raw of input.content) {
        const chunk = typeof raw === 'string' ? Buffer.from(raw) : Buffer.from(raw);
        if (chunk.byteLength === 0) continue;
        await handle.write(chunk);
        hash.update(chunk);
        bytes += chunk.byteLength;
      }
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
    await handle.close();
    if (bytes === 0) {
      await rm(directory, { recursive: true, force: true });
      throw new PlatformInputError('empty_file', 'file is empty');
    }
    return {
      directory,
      path,
      fileName,
      ...(input.mimeType?.trim() ? { mimeType: input.mimeType.trim().slice(0, 255) } : {}),
      bytes,
      sha256: hash.digest('hex'),
    };
  }

  async #idempotentIngestResult(
    input: IngestDocumentInput,
    contentSha256?: string,
  ): Promise<IngestDocumentResult | undefined> {
    if (!input.sourceMessageId) return undefined;
    const sourceMessageId = input.sourceMessageId;
    const attachmentKey = input.sourceAttachmentKey ?? '';
    const lookup = this.#db.prepare(`
      SELECT conversation_id FROM intake_idempotency
      WHERE source_channel = ? AND source_message_id = ? AND source_attachment_key = ?
    `);
    let existing = lookup.get(
      input.sourceChannel,
      sourceMessageId,
      attachmentKey,
    ) as { conversation_id: string } | undefined;
    if (!existing && attachmentKey && contentSha256) {
      existing = this.#transaction(() => {
        const concurrentExact = lookup.get(
          input.sourceChannel,
          sourceMessageId,
          attachmentKey,
        ) as { conversation_id: string } | undefined;
        if (concurrentExact) return concurrentExact;
        const legacy = this.#db.prepare(`
          SELECT intake.conversation_id, document.sha256
          FROM intake_idempotency intake
          JOIN conversations conversation
            ON conversation.conversation_id = intake.conversation_id
          JOIN documents document
            ON document.document_id = conversation.primary_document_id
          WHERE intake.source_channel = ? AND intake.source_message_id = ?
            AND intake.source_attachment_key = ''
        `).get(input.sourceChannel, sourceMessageId) as {
          conversation_id: string;
          sha256: string;
        } | undefined;
        if (!legacy || legacy.sha256 !== contentSha256) return undefined;
        const claimed = this.#db.prepare(`
          UPDATE intake_idempotency SET source_attachment_key = ?
          WHERE source_channel = ? AND source_message_id = ?
            AND source_attachment_key = ''
        `).run(attachmentKey, input.sourceChannel, sourceMessageId);
        return claimed.changes === 1 ? legacy : undefined;
      });
    }
    if (!existing) return undefined;
    return {
      conversation: await this.getConversation(existing.conversation_id),
      reusedDocument: true,
    };
  }

  async #finalize(input: IngestDocumentInput, staged: StagedFile, options: FinalizeOptions = {}): Promise<IngestDocumentResult> {
    const { boundCompanyId, boundIndustryId, research, industryResearch } = options;
    const now = this.#now().toISOString();
    const existing = this.#db.prepare('SELECT document_id FROM documents WHERE sha256 = ?').get(staged.sha256) as { document_id: string } | undefined;
    const documentId = existing?.document_id ?? this.#nextId();
    let createdDocumentDirectory: string | undefined;
    let storagePath: string | undefined;
    try {
      if (!existing) {
        const documentDirectory = join(this.#documentsRoot, safeId(documentId), 'original');
        await mkdir(documentDirectory, { recursive: true, mode: 0o700 });
        const finalPath = join(documentDirectory, staged.fileName);
        await rename(staged.path, finalPath);
        createdDocumentDirectory = dirname(documentDirectory);
        storagePath = relative(this.#dataRoot, finalPath);
      }
      const receiptId = this.#nextId();
      const conversationId = this.#nextId();
      const taskId = this.#nextId();
      const taskType = research
        ? 'company_research'
        : industryResearch
          ? 'industry_research'
          : boundIndustryId
            ? 'material_analysis'
            : input.purpose === 'company_list' || isCompanyListFile(staged.fileName)
            ? 'company_list_processing'
            : 'material_analysis';
      const researchPending = Boolean(research && !research.companyId && research.ambiguousOptions.length > 1);
      this.#transaction(() => {
        if (!existing && storagePath) {
          this.#db.prepare(`
            INSERT INTO documents (
              document_id, file_name, mime_type, bytes, sha256, storage_path,
              parse_status, archive_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 'stored', ?)
          `).run(documentId, staged.fileName, staged.mimeType ?? null, staged.bytes, staged.sha256, storagePath, now);
        }
        if (research || industryResearch) {
          this.#db.prepare(`
            UPDATE documents SET parse_status = 'parsed', archive_status = 'archived', material_type = ?
            WHERE document_id = ?
          `).run(research ? 'company_research_query' : 'industry_research_query', documentId);
        }
        this.#db.prepare(`
          INSERT INTO receipt_events (
            receipt_id, document_id, source_channel, sender_id, source_message_id, received_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(receiptId, documentId, input.sourceChannel, input.senderId ?? null, input.sourceMessageId ?? null, now);
        if (existing) {
          this.#audit('document.duplicate_received', 'document', documentId, undefined, {
            receiptId, sourceChannel: input.sourceChannel, sourceMessageId: input.sourceMessageId ?? null,
          }, now);
        }
        this.#db.prepare(`
          INSERT INTO conversations (
            conversation_id, thread_id, title, conversation_type, primary_document_id,
            source_channel, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          conversationId,
          conversationId,
          research
            ? `${research.companyName}公司研究`
            : industryResearch
              ? `${industryResearch.industryName}行业研究`
              : staged.fileName,
          research ? 'company' : industryResearch ? 'industry' : 'material',
          documentId,
          input.sourceChannel,
          researchPending
            ? 'pending_confirmation'
            : research || industryResearch
              ? 'waiting'
              : 'processing',
          now,
          now,
        );
        this.#db.prepare(`
          INSERT INTO conversation_documents (conversation_id, document_id, role, created_at)
          VALUES (?, ?, 'primary', ?)
        `).run(conversationId, documentId, now);
        if (boundCompanyId) {
          this.#db.prepare(`
            INSERT OR IGNORE INTO conversation_companies (conversation_id, company_id, role, created_at)
            VALUES (?, ?, 'primary', ?)
          `).run(conversationId, boundCompanyId, now);
        }
        if (boundIndustryId) {
          this.#db.prepare(`
            INSERT OR IGNORE INTO conversation_industries (
              conversation_id, industry_id, role, created_at
            ) VALUES (?, ?, 'primary', ?)
          `).run(conversationId, boundIndustryId, now);
          if (!industryResearch) {
            this.#db.prepare(`
              INSERT OR IGNORE INTO industry_materials (
                industry_id, conversation_id, document_id, evidence_id, created_at
              ) VALUES (?, ?, ?, NULL, ?)
            `).run(boundIndustryId, conversationId, documentId, now);
          }
          this.#db.prepare(
            'UPDATE industries SET updated_at = ? WHERE industry_id = ?',
          ).run(now, boundIndustryId);
        }
        if (input.sourceMessageId) {
          this.#db.prepare(`
            INSERT INTO intake_idempotency (
              source_channel, source_message_id, source_attachment_key,
              conversation_id, created_at
            ) VALUES (?, ?, ?, ?, ?)
          `).run(
            input.sourceChannel,
            input.sourceMessageId,
            input.sourceAttachmentKey ?? '',
            conversationId,
            now,
          );
        }
        this.#db.prepare(`
          INSERT INTO analysis_tasks (
            task_id, conversation_id, task_type, status, current_step, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          taskId,
          conversationId,
          taskType,
          researchPending
            ? 'pending_confirmation'
            : research || industryResearch
              ? 'waiting'
              : 'queued',
          research
            ? 'resolve_company'
            : industryResearch
              ? 'load_industry_context'
              : 'verify_storage',
          now,
          now,
        );
        const insertStep = this.#db.prepare(`
          INSERT INTO task_steps (
            step_id, task_id, step_name, position, status, attempts, started_at, finished_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const steps = research
          ? RESEARCH_STEPS
          : industryResearch
            ? INDUSTRY_RESEARCH_STEPS
            : PIPELINE_STEPS;
        steps.forEach((name, index) => {
          const status: TaskStepStatus = research || industryResearch
            ? index === 0 ? (researchPending ? 'pending_confirmation' : 'queued') : 'blocked'
            : index === 0 ? 'completed' : index === 1 ? 'queued' : 'blocked';
          insertStep.run(
            this.#nextId(), taskId, name, index + 1, status,
            !research && !industryResearch && index === 0 ? 1 : 0,
            !research && !industryResearch && index === 0 ? now : null,
            !research && !industryResearch && index === 0 ? now : null,
          );
        });
        if (research) {
          if (research.companyId) {
            this.#db.prepare(`
              INSERT OR IGNORE INTO conversation_companies (conversation_id, company_id, role, created_at)
              VALUES (?, ?, 'primary', ?)
            `).run(conversationId, research.companyId, now);
          } else {
            this.#createCompanyMatchCase(conversationId, research.companyName, research.ambiguousOptions);
          }
          this.#db.prepare(`
            INSERT INTO company_research_runs (
              run_id, task_id, company_id, intent, explicit_search,
              workflow_skill, workflow_context_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            this.#nextId(), taskId, research.companyId ?? null, research.intent,
            research.explicitWebSearch ? 1 : 0,
            research.workflow?.skill ?? null,
            research.workflow ? JSON.stringify(research.workflow) : null,
            now,
            now,
          );
        }
        if (industryResearch) {
          this.#db.prepare(`
            INSERT INTO industry_research_runs (
              run_id, task_id, industry_id, intent, explicit_search,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            this.#nextId(),
            taskId,
            industryResearch.industryId,
            industryResearch.intent,
            industryResearch.explicitWebSearch ? 1 : 0,
            now,
            now,
          );
        }
      });
      await rm(staged.directory, { recursive: true, force: true });
      return {
        conversation: await this.getConversation(conversationId),
        reusedDocument: Boolean(existing),
      };
    } catch (error) {
      if (createdDocumentDirectory) await rm(createdDocumentDirectory, { recursive: true, force: true });
      await rm(staged.directory, { recursive: true, force: true });
      throw error;
    }
  }

  #conversationRows(where = '', ...values: string[]): ConversationRow[] {
    const statement = this.#db.prepare(`
      SELECT
        c.conversation_id, c.thread_id, c.title, c.conversation_type, c.source_channel,
        c.status AS conversation_status, c.created_at AS conversation_created_at,
        c.updated_at AS conversation_updated_at,
        (SELECT COUNT(*) FROM receipt_events re WHERE re.document_id = d.document_id) AS receipt_count,
        d.document_id, d.file_name, d.mime_type, d.bytes, d.sha256,
        d.parse_status, d.archive_status, d.material_type, d.created_at AS document_created_at,
        t.task_id, t.task_type, t.status AS task_status, t.current_step,
        t.created_at AS task_created_at, t.updated_at AS task_updated_at,
        t.provider_id, t.model_id, t.variant, t.session_id, t.result_status,
        (SELECT ar.tool_usage_json FROM analysis_runs ar WHERE ar.task_id = t.task_id) AS tool_usage_json
      FROM conversations c
      JOIN documents d ON d.document_id = c.primary_document_id
      JOIN analysis_tasks t ON t.conversation_id = c.conversation_id
      ${where}
      ORDER BY c.updated_at DESC, c.conversation_id DESC
    `);
    return statement.all(...values) as unknown as ConversationRow[];
  }

  #toSummary(row: ConversationRow): ConversationSummary {
    const document: DocumentRecord = {
      documentId: row.document_id,
      fileName: row.file_name,
      ...(row.mime_type ? { mimeType: row.mime_type } : {}),
      bytes: row.bytes,
      sha256: row.sha256,
      parseStatus: asDocumentParseStatus(row.parse_status),
      archiveStatus: asArchiveStatus(row.archive_status),
      ...(row.material_type ? { materialType: row.material_type } : {}),
      createdAt: row.document_created_at,
    };
    return {
      conversationId: row.conversation_id,
      threadId: row.thread_id,
      title: row.title,
      type: row.conversation_type as ConversationSummary['type'],
      sourceChannel: row.source_channel as SourceChannel,
      status: row.conversation_status as ConversationStatus,
      createdAt: row.conversation_created_at,
      updatedAt: row.conversation_updated_at,
      receiptCount: row.receipt_count,
      document,
      task: {
        taskId: row.task_id,
        type: row.task_type as AnalysisTaskRecord['type'],
        status: row.task_status as TaskStatus,
        currentStep: row.current_step,
        createdAt: row.task_created_at,
        updatedAt: row.task_updated_at,
        ...(row.provider_id ? { providerId: row.provider_id } : {}),
        ...(row.model_id ? { modelId: row.model_id } : {}),
        ...(row.variant ? { variant: row.variant } : {}),
        ...(row.session_id ? { sessionId: row.session_id } : {}),
        ...(row.tool_usage_json ? { toolUsage: JSON.parse(row.tool_usage_json) as string[] } : {}),
        ...(row.result_status ? { resultStatus: row.result_status } : {}),
      },
    };
  }

  #recoverExpiredSteps(): void {
    const now = this.#now().toISOString();
    const supported = [...SUPPORTED_STEP_HANDLERS];
    if (supported.length === 0) return;
    const placeholders = supported.map(() => '?').join(', ');
    this.#db.prepare(`
      UPDATE task_steps
      SET status = 'queued', lease_until = NULL, error_code = 'worker_lease_expired'
      WHERE status = 'running' AND lease_until < ? AND step_name IN (${placeholders})
        AND EXISTS (
          SELECT 1 FROM analysis_tasks task
          WHERE task.task_id = task_steps.task_id
            AND task.status != 'cancelled'
        )
    `).run(now, ...supported);
  }

  #claimNextStep(excludedTaskIds: Set<string>): ClaimedStep | undefined {
    const supported = [...SUPPORTED_STEP_HANDLERS];
    const placeholders = supported.map(() => '?').join(', ');
    const excluded = [...excludedTaskIds];
    const excludedSql = excluded.length
      ? `AND step.task_id NOT IN (${excluded.map(() => '?').join(', ')})`
      : '';
    const selected = this.#db.prepare(`
      SELECT step.step_id, step.task_id, step.step_name
      FROM task_steps step
      JOIN analysis_tasks task ON task.task_id = step.task_id
      WHERE step.status = 'queued'
        AND task.status NOT IN ('cancelled', 'completed', 'failed')
        AND step.step_name IN (${placeholders})
      ${excludedSql}
      ORDER BY step.rowid LIMIT 1
    `).get(...supported, ...excluded) as { step_id: string; task_id: string; step_name: string } | undefined;
    if (!selected) return undefined;
    const now = this.#now();
    const leaseUntil = new Date(now.getTime() + this.#leaseMs).toISOString();
    const changed = this.#transaction(() => {
      const result = this.#db.prepare(`
        UPDATE task_steps
        SET status = 'running', attempts = attempts + 1, started_at = ?, lease_until = ?, error_code = NULL
        WHERE step_id = ? AND status = 'queued'
          AND EXISTS (
            SELECT 1 FROM analysis_tasks task
            WHERE task.task_id = task_steps.task_id
              AND task.status NOT IN ('cancelled', 'completed', 'failed')
          )
      `).run(now.toISOString(), leaseUntil, selected.step_id);
      if (result.changes !== 1) return false;
      this.#db.prepare(`
        UPDATE analysis_tasks SET status = 'running', current_step = ?, updated_at = ? WHERE task_id = ?
      `).run(selected.step_name, now.toISOString(), selected.task_id);
      const conversation = this.#db.prepare('SELECT conversation_id FROM analysis_tasks WHERE task_id = ?').get(selected.task_id) as { conversation_id: string };
      this.#db.prepare("UPDATE conversations SET status = 'processing', updated_at = ? WHERE conversation_id = ?")
        .run(now.toISOString(), conversation.conversation_id);
      return true;
    });
    return changed ? { stepId: selected.step_id, taskId: selected.task_id, name: selected.step_name } : undefined;
  }

  async #executeStep(step: ClaimedStep): Promise<StepOutcome> {
    if (step.name === 'load_industry_context') return this.#loadIndustryResearchContext(step);
    if (step.name === 'plan_industry_search') return this.#planIndustrySearch(step);
    if (step.name === 'execute_industry_search') return this.#executeIndustrySearch(step);
    if (step.name === 'analyze_industry') return this.#analyzeIndustry(step);
    if (step.name === 'resolve_company') return this.#resolveResearchCompany(step);
    if (step.name === 'load_company_knowledge') return this.#loadResearchKnowledge(step);
    if (step.name === 'plan_external_search') return this.#planExternalSearch(step);
    if (step.name === 'execute_external_search') return this.#executeExternalSearch(step);
    if (step.name === 'analyze_company') return this.#analyzeCompany(step);
    if (step.name === 'generate_research_candidates') return this.#generateResearchCandidates(step);
    if (step.name === 'parse_document') return this.#parseDocument(step);
    if (step.name === 'classify_material') return this.#classifyMaterial(step);
    if (step.name === 'identify_company') return this.#identifyCompany(step);
    if (step.name === 'suggest_conversation_reuse') return this.#suggestConversationReuse(step);
    if (step.name === 'analyze_material') return this.#analyzeMaterial(step);
    if (step.name === 'web_search') return 'skipped';
    if (step.name === 'generate_candidates') return this.#generateCandidates(step);
    if (step.name !== 'verify_storage') throw new Error('unsupported_step');
    const target = this.#db.prepare(`
      SELECT
        d.document_id AS documentId,
        d.file_name AS fileName,
        d.bytes,
        d.sha256,
        d.storage_path AS storagePath,
        d.mime_type AS mimeType
      FROM analysis_tasks t
      JOIN conversations c ON c.conversation_id = t.conversation_id
      JOIN documents d ON d.document_id = c.primary_document_id
      WHERE t.task_id = ?
    `).get(step.taskId) as VerificationTarget | undefined;
    if (!target) throw new Error('document_missing');
    const path = this.#resolveStoragePath(target.storagePath);
    const fileStat = await stat(path);
    if (!fileStat.isFile() || fileStat.size !== target.bytes) throw new Error('stored_file_size_mismatch');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest('hex') !== target.sha256) throw new Error('stored_file_hash_mismatch');
    return 'completed';
  }

  async #parseDocument(step: ClaimedStep): Promise<StepOutcome> {
    const target = this.#pipelineTarget(step.taskId);
    const existing = this.#db.prepare(`
      SELECT d.parse_status, COUNT(pb.block_id) AS block_count
      FROM documents d LEFT JOIN parsed_blocks pb ON pb.document_id = d.document_id
      WHERE d.document_id = ? GROUP BY d.document_id
    `).get(target.documentId) as { parse_status: string; block_count: number } | undefined;
    if (existing?.parse_status === 'parsed' && existing.block_count > 0) return 'completed';
    this.#db.prepare("UPDATE documents SET parse_status = 'processing' WHERE document_id = ?").run(target.documentId);
    const parsed = await this.#parser.parse({
      fileName: target.fileName,
      ...(target.mimeType ? { mimeType: target.mimeType } : {}),
      path: this.#resolveStoragePath(target.storagePath),
    });
    this.#transaction(() => {
      this.#db.prepare('DELETE FROM parsed_blocks WHERE document_id = ?').run(target.documentId);
      const insert = this.#db.prepare(`
        INSERT INTO parsed_blocks (
          block_id, document_id, block_order, kind, text, page, paragraph,
          heading_path_json, sheet, row_number, cell_range
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      parsed.blocks.forEach((block, index) => {
        insert.run(
          `${target.documentId}:${block.blockId}`,
          target.documentId,
          index + 1,
          block.kind,
          block.text,
          block.page ?? null,
          block.paragraph ?? null,
          block.headingPath ? JSON.stringify(block.headingPath) : null,
          block.sheet ?? null,
          block.row ?? null,
          block.cellRange ?? null,
        );
      });
      this.#db.prepare("UPDATE documents SET parse_status = 'parsed' WHERE document_id = ?").run(target.documentId);
    });
    return 'completed';
  }

  async #classifyMaterial(step: ClaimedStep): Promise<StepOutcome> {
    const target = this.#pipelineTarget(step.taskId);
    if (this.#isBoundIndustryMaterialTask(step.taskId)) {
      this.#db.prepare(`
        UPDATE documents SET material_type = COALESCE(material_type, 'industry_material')
        WHERE document_id = ?
      `).run(target.documentId);
      return 'completed';
    }
    if (this.#taskType(step.taskId) === 'company_list_processing') {
      this.#db.prepare("UPDATE documents SET material_type = 'company_list' WHERE document_id = ?").run(target.documentId);
      return 'completed';
    }
    const rows = this.#db.prepare('SELECT text FROM parsed_blocks WHERE document_id = ? ORDER BY block_order').all(target.documentId) as unknown as Array<{ text: string }>;
    const sample = `${target.fileName}\n${rows.slice(0, 80).map((row) => row.text).join('\n')}`.toLowerCase();
    const signals = ['bp', '商业计划', '融资', '公司', '团队', '产品', '市场', '商业模式']
      .filter((signal) => sample.includes(signal)).length;
    const materialType = signals >= 2 ? 'business_plan' : 'company_material';
    this.#db.prepare('UPDATE documents SET material_type = ? WHERE document_id = ?').run(materialType, target.documentId);
    return 'completed';
  }

  async #identifyCompany(step: ClaimedStep): Promise<StepOutcome> {
    if (this.#isBoundIndustryMaterialTask(step.taskId)) return 'skipped';
    const target = this.#pipelineTarget(step.taskId);
    if (this.#documentMaterialType(target.documentId) === 'company_list') return this.#identifyCompanyList(target);
    const attached = this.#db.prepare('SELECT company_id FROM conversation_companies WHERE conversation_id = ? AND role = ?')
      .get(target.conversationId, 'primary') as { company_id: string } | undefined;
    if (attached) return 'completed';
    const existingCase = this.#db.prepare('SELECT status, resolved_company_id FROM company_match_cases WHERE conversation_id = ?')
      .get(target.conversationId) as { status: string; resolved_company_id: string | null } | undefined;
    if (existingCase?.status === 'resolved' && existingCase.resolved_company_id) {
      this.#attachCompany(target.conversationId, existingCase.resolved_company_id);
      return 'completed';
    }
    if (existingCase?.status === 'pending') return 'pending_confirmation';

    const blocks = this.#loadParsedBlocks(target.documentId);
    const proposedName = extractCompanyName(target.fileName, blocks);
    if (!proposedName) {
      this.#createCompanyMatchCase(target.conversationId, undefined, []);
      this.#db.prepare("UPDATE documents SET archive_status = 'pending_company' WHERE document_id = ?").run(target.documentId);
      return 'pending_confirmation';
    }
    const matches = this.#matchCompanies(proposedName);
    if (matches.length > 1) {
      this.#createCompanyMatchCase(target.conversationId, proposedName, matches);
      this.#db.prepare("UPDATE documents SET archive_status = 'pending_company' WHERE document_id = ?").run(target.documentId);
      return 'pending_confirmation';
    }
    const companyId = matches[0] ?? this.#createCompany(proposedName);
    this.#addDocumentAliases(companyId, blocks);
    this.#attachCompany(target.conversationId, companyId);
    return 'completed';
  }

  async #suggestConversationReuse(step: ClaimedStep): Promise<StepOutcome> {
    if (this.#isBoundIndustryMaterialTask(step.taskId)) return 'skipped';
    const target = this.#pipelineTarget(step.taskId);
    if (this.#taskType(step.taskId) !== 'material_analysis' || this.#documentMaterialType(target.documentId) === 'company_list') return 'skipped';
    const conversation = this.#db.prepare(`
      SELECT c.title, c.source_channel, re.sender_id
      FROM conversations c JOIN receipt_events re ON re.document_id = c.primary_document_id
      WHERE c.conversation_id = ? ORDER BY re.received_at DESC LIMIT 1
    `).get(target.conversationId) as { title: string; source_channel: string; sender_id: string | null } | undefined;
    if (!conversation || (conversation.source_channel === 'feishu' && !conversation.sender_id)) return 'skipped';
    const previous = this.#db.prepare(`
      SELECT status FROM conversation_reuse_suggestions WHERE conversation_id = ?
    `).get(target.conversationId) as { status: string } | undefined;
    if (previous) return 'completed';
    const currentCompany = this.#db.prepare(`
      SELECT company.canonical_name FROM conversation_companies cc
      JOIN companies company ON company.company_id = cc.company_id
      WHERE cc.conversation_id = ? AND cc.role = 'primary'
    `).get(target.conversationId) as { canonical_name: string } | undefined;
    const sourceFilter = conversation.source_channel === 'feishu'
      ? 'AND c.source_channel = \'feishu\' AND re.sender_id = ?'
      : 'AND c.source_channel = \'web\'';
    const candidateStatement = this.#db.prepare(`
      SELECT DISTINCT c.conversation_id, c.title, c.primary_document_id, company.canonical_name
      FROM conversations c
      JOIN receipt_events re ON re.document_id = c.primary_document_id
      LEFT JOIN conversation_companies cc ON cc.conversation_id = c.conversation_id AND cc.role = 'primary'
      LEFT JOIN companies company ON company.company_id = cc.company_id
      WHERE c.conversation_id != ? AND c.conversation_type = 'material' ${sourceFilter}
      ORDER BY c.created_at DESC LIMIT 20
    `);
    const candidateRows = (conversation.source_channel === 'feishu'
      ? candidateStatement.all(target.conversationId, conversation.sender_id)
      : candidateStatement.all(target.conversationId)) as unknown as Array<{
      conversation_id: string; title: string; primary_document_id: string; canonical_name: string | null;
    }>;
    if (candidateRows.length === 0) return 'skipped';
    const result = await this.#conversationRelatedness.suggest({
      conversationId: target.conversationId,
      title: conversation.title,
      ...(currentCompany ? { companyName: currentCompany.canonical_name } : {}),
      content: semanticText(this.#loadParsedBlocks(target.documentId).map((block) => block.text), 16_000),
      candidates: candidateRows.map((candidate) => ({
        conversationId: candidate.conversation_id,
        title: candidate.title,
        ...(candidate.canonical_name ? { companyName: candidate.canonical_name } : {}),
        content: semanticText(this.#loadParsedBlocks(candidate.primary_document_id).map((block) => block.text), 12_000),
      })),
    });
    if (!result.targetConversationId) return 'completed';
    const targetConversationId = result.targetConversationId;
    const now = this.#now().toISOString();
    this.#transaction(() => {
      this.#db.prepare(`
        INSERT INTO conversation_reuse_suggestions (
          suggestion_id, conversation_id, target_conversation_id, score, reason,
          status, version, provider_id, model_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?, ?)
      `).run(
        this.#nextId(), target.conversationId, targetConversationId, result.score,
        result.reason, result.providerId, result.modelId, now, now,
      );
    });
    return 'completed';
  }

  async #analyzeMaterial(step: ClaimedStep): Promise<StepOutcome> {
    if (this.#isBoundIndustryMaterialTask(step.taskId)) return 'skipped';
    const target = this.#pipelineTarget(step.taskId);
    if (this.#documentMaterialType(target.documentId) === 'company_list') return 'skipped';
    if (!this.#analysis) throw new AnalysisAdapterError('analysis_adapter_unavailable', 'OpenCode analysis adapter is not configured');
    const company = this.#db.prepare(`
      SELECT c.company_id, c.canonical_name
      FROM conversation_companies cc JOIN companies c ON c.company_id = cc.company_id
      WHERE cc.conversation_id = ? AND cc.role = 'primary'
    `).get(target.conversationId) as { company_id: string; canonical_name: string } | undefined;
    if (!company) throw new Error('company_not_attached');
    const blocks = this.#loadParsedBlocks(target.documentId);
    const analysisBlocks = boundedAiBlocks(blocks);
    const existingKnowledge = this.#db.prepare(`
      SELECT knowledge_type, statement, value FROM knowledge
      WHERE company_id = ? AND status IN ('current', 'disputed') ORDER BY created_at
    `).all(company.company_id) as unknown as Array<{ knowledge_type: string; statement: string; value: string | null }>;
    const task = this.#db.prepare('SELECT session_id FROM analysis_tasks WHERE task_id = ?').get(step.taskId) as { session_id: string | null };
    const result = await this.#analysis.analyze({
      taskId: step.taskId,
      conversationId: target.conversationId,
      documentId: target.documentId,
      fileName: target.fileName,
      companyId: company.company_id,
      companyName: company.canonical_name,
      blocks: analysisBlocks,
      existingKnowledge: existingKnowledge.map((item) => ({
        knowledgeType: item.knowledge_type,
        statement: item.statement,
        ...(item.value ? { value: item.value } : {}),
      })),
      ...(task.session_id ? { sessionId: task.session_id } : {}),
    });
    const validBlockIds = new Set(analysisBlocks.map((block) => block.blockId));
    for (const section of result.sections) assertKnownBlockIds(section.blockIds, validBlockIds, `section ${section.key}`, true);
    for (const [index, candidate] of result.candidates.entries()) {
      assertKnownBlockIds(candidate.blockIds, validBlockIds, `candidate ${index}`, false);
    }
    const now = this.#now().toISOString();
    this.#transaction(() => {
      this.#db.prepare(`
        UPDATE analysis_tasks SET provider_id = ?, model_id = ?, variant = ?, session_id = ?, result_status = 'validated', updated_at = ?
        WHERE task_id = ?
      `).run(result.providerId, result.modelId, result.variant, result.sessionId, now, step.taskId);
      this.#db.prepare(`
        INSERT INTO analysis_runs (run_id, task_id, raw_text, candidate_drafts_json, tool_usage_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET raw_text = excluded.raw_text,
          candidate_drafts_json = excluded.candidate_drafts_json,
          tool_usage_json = excluded.tool_usage_json, created_at = excluded.created_at
      `).run(this.#nextId(), step.taskId, result.rawText, JSON.stringify(result.candidates), JSON.stringify(result.toolUsage), now);
      this.#db.prepare(`
        DELETE FROM analysis_section_evidence WHERE section_id IN (
          SELECT section_id FROM analysis_sections WHERE task_id = ?
        )
      `).run(step.taskId);
      this.#db.prepare('DELETE FROM analysis_sections WHERE task_id = ?').run(step.taskId);
      const insertSection = this.#db.prepare(`
        INSERT INTO analysis_sections (section_id, task_id, section_key, summary, block_ids_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const section of result.sections) {
        const sectionId = this.#nextId();
        insertSection.run(sectionId, step.taskId, section.key, section.summary, JSON.stringify(section.blockIds), now);
        for (const blockId of section.blockIds) {
          const block = blocks.find((candidate) => candidate.blockId === blockId);
          if (!block) throw new Error('section_evidence_block_missing');
          const evidenceId = this.#evidenceForBlock(target.documentId, block, now);
          this.#db.prepare('INSERT INTO analysis_section_evidence (section_id, evidence_id) VALUES (?, ?)').run(sectionId, evidenceId);
        }
      }
      this.#updateSubjectSuggestion(
        company.company_id,
        company.canonical_name,
        result.sections.find(
          (section) => section.key === 'company_and_project_stage',
        )?.summary,
        now,
      );
      const industryMarketSection = result.sections.find(
        (section) => section.key === 'industry_market_and_policy',
      );
      const industryChainSection = result.sections.find(
        (section) => section.key === 'industry_chain_position',
      );
      const evidencedIndustrySection = [industryChainSection, industryMarketSection]
        .find((section) => section && section.blockIds.length > 0);
      if (evidencedIndustrySection) {
        const firstBlock = blocks.find(
          (block) => block.blockId === evidencedIndustrySection.blockIds[0],
        );
        const evidenceId = firstBlock ? this.#evidenceForBlock(target.documentId, firstBlock, now) : undefined;
        this.#syncIndustrySkeleton({
          companyId: company.company_id,
          conversationId: target.conversationId,
          documentId: target.documentId,
          industryMarketSummary: industryMarketSection?.summary ?? '',
          industryChainSummary: industryChainSection?.summary ?? '',
          ...(evidenceId ? { evidenceId } : {}),
          now,
        });
      }
    });
    return 'completed';
  }

  async #generateCandidates(step: ClaimedStep): Promise<StepOutcome> {
    const pipelineTarget = this.#pipelineTarget(step.taskId);
    if (this.#isBoundIndustryMaterialTask(step.taskId)) {
      this.#db.prepare("UPDATE documents SET archive_status = 'archived' WHERE document_id = ?")
        .run(pipelineTarget.documentId);
      return 'skipped';
    }
    if (this.#documentMaterialType(pipelineTarget.documentId) === 'company_list') {
      this.#db.prepare("UPDATE documents SET archive_status = 'archived' WHERE document_id = ?").run(pipelineTarget.documentId);
      return 'skipped';
    }
    const alreadyGenerated = this.#db.prepare('SELECT 1 AS present FROM knowledge_candidates WHERE task_id = ? LIMIT 1').get(step.taskId);
    if (alreadyGenerated) return 'completed';
    const target = this.#pipelineTarget(step.taskId);
    const company = this.#db.prepare("SELECT company_id FROM conversation_companies WHERE conversation_id = ? AND role = 'primary'")
      .get(target.conversationId) as { company_id: string } | undefined;
    const run = this.#db.prepare('SELECT candidate_drafts_json FROM analysis_runs WHERE task_id = ?').get(step.taskId) as { candidate_drafts_json: string } | undefined;
    if (!company || !run) throw new Error('analysis_result_missing');
    const drafts = JSON.parse(run.candidate_drafts_json) as Array<{
      sectionKey: string; knowledgeType: string; statement: string; value?: string; effectiveAt?: string;
      blockIds: string[]; highImpact: boolean; sensitive: boolean;
    }>;
    const blocks = new Map(this.#loadParsedBlocks(target.documentId).map((block) => [block.blockId, block]));
    const now = this.#now().toISOString();
    this.#transaction(() => {
      for (const draft of drafts) {
        const candidateId = this.#nextId();
        const conflict = this.#hasKnowledgeConflict(company.company_id, draft.knowledgeType, draft.value ?? draft.statement);
        this.#db.prepare(`
          INSERT INTO knowledge_candidates (
            candidate_id, task_id, company_id, section_key, knowledge_type, statement, value,
            effective_at, status, version, high_impact, sensitive, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
        `).run(
          candidateId, step.taskId, company.company_id, draft.sectionKey, draft.knowledgeType,
          draft.statement, draft.value ?? null, draft.effectiveAt ?? null, conflict ? 'conflicted' : 'pending',
          draft.highImpact ? 1 : 0,
          draft.sensitive ? 1 : 0,
          now, now,
        );
        if (draft.sectionKey === 'industry_chain_position' && conflict) {
          this.#db.prepare(`
            UPDATE company_industries SET status = 'conflicted', updated_at = ?
            WHERE company_id = ? AND industry_id IN (
              SELECT industry_id FROM industry_materials WHERE conversation_id = ?
            ) AND status != 'confirmed'
          `).run(now, company.company_id, target.conversationId);
        }
        for (const blockId of draft.blockIds) {
          const block = blocks.get(blockId);
          if (!block) throw new Error('candidate_evidence_block_missing');
          const evidenceId = this.#evidenceForBlock(target.documentId, block, now);
          this.#db.prepare('INSERT INTO candidate_evidence (candidate_id, evidence_id) VALUES (?, ?)').run(candidateId, evidenceId);
        }
      }
      this.#db.prepare("UPDATE documents SET archive_status = 'archived' WHERE document_id = ?").run(target.documentId);
    });
    return 'completed';
  }

  async #resolveResearchCompany(step: ClaimedStep): Promise<StepOutcome> {
    const run = this.#db.prepare(`
      SELECT r.company_id, t.conversation_id FROM company_research_runs r
      JOIN analysis_tasks t ON t.task_id = r.task_id WHERE r.task_id = ?
    `).get(step.taskId) as { company_id: string | null; conversation_id: string } | undefined;
    if (!run) throw new Error('company_research_run_missing');
    let companyId = run.company_id;
    if (!companyId) {
      const match = this.#db.prepare('SELECT status, resolved_company_id FROM company_match_cases WHERE conversation_id = ?')
        .get(run.conversation_id) as { status: string; resolved_company_id: string | null } | undefined;
      if (!match || match.status === 'pending' || !match.resolved_company_id) return 'pending_confirmation';
      companyId = match.resolved_company_id;
    }
    const now = this.#now().toISOString();
    this.#db.prepare(`
      INSERT OR IGNORE INTO conversation_companies (conversation_id, company_id, role, created_at)
      VALUES (?, ?, 'primary', ?)
    `).run(run.conversation_id, companyId, now);
    this.#db.prepare('UPDATE company_research_runs SET company_id = ?, updated_at = ? WHERE task_id = ?')
      .run(companyId, now, step.taskId);
    return 'completed';
  }

  async #loadResearchKnowledge(step: ClaimedStep): Promise<StepOutcome> {
    const run = this.#db.prepare('SELECT company_id FROM company_research_runs WHERE task_id = ?').get(step.taskId) as { company_id: string | null } | undefined;
    if (!run?.company_id) throw new Error('research_company_missing');
    this.#companyRecord(run.company_id);
    return 'completed';
  }

  async #planExternalSearch(step: ClaimedStep): Promise<StepOutcome> {
    this.#planCompanyResearchSearch(step.taskId);
    return 'completed';
  }

  #planCompanyResearchSearch(taskId: string): {
    runId: string;
    companyName: string;
    triggerReason: SearchTriggerReason | 'not_needed';
    publicQuery?: string;
    searchExecutedAt?: string;
  } {
    const run = this.#db.prepare(`
      SELECT r.run_id, r.company_id, r.explicit_search, r.workflow_skill,
        r.trigger_reason, r.public_query, r.search_executed_at, c.canonical_name
      FROM company_research_runs r JOIN companies c ON c.company_id = r.company_id
      WHERE r.task_id = ?
    `).get(taskId) as {
      run_id: string;
      company_id: string;
      explicit_search: number;
      workflow_skill: string | null;
      trigger_reason: string | null;
      public_query: string | null;
      search_executed_at: string | null;
      canonical_name: string;
    } | undefined;
    if (!run) throw new Error('company_research_run_missing');
    const knowledge = this.#db.prepare(`
      SELECT status, created_at FROM knowledge
      WHERE company_id = ? AND status IN ('current', 'disputed') ORDER BY created_at DESC
    `).all(run.company_id) as unknown as Array<{ status: string; created_at: string }>;
    const trigger = run.workflow_skill
      ? 'not_needed'
      : researchSearchTrigger(Boolean(run.explicit_search), knowledge, this.#now());
    const query = trigger === 'not_needed' ? undefined : `${run.canonical_name} 公司 最新 业务 产品 融资`;
    if (run.trigger_reason !== trigger || run.public_query !== (query ?? null)) {
      this.#db.prepare(`
        UPDATE company_research_runs SET trigger_reason = ?, public_query = ?, updated_at = ? WHERE task_id = ?
      `).run(trigger, query ?? null, this.#now().toISOString(), taskId);
    }
    return {
      runId: run.run_id,
      companyName: run.canonical_name,
      triggerReason: trigger,
      ...(query ? { publicQuery: query } : {}),
      ...(run.search_executed_at ? { searchExecutedAt: run.search_executed_at } : {}),
    };
  }

  async #executeExternalSearch(step: ClaimedStep): Promise<StepOutcome> {
    const planned = this.#planCompanyResearchSearch(step.taskId);
    if (planned.triggerReason === 'not_needed') return 'skipped';
    await this.#ensureCompanyResearchSearch(step.taskId);
    return 'completed';
  }

  async #ensureCompanyResearchSearch(taskId: string): Promise<void> {
    const planned = this.#planCompanyResearchSearch(taskId);
    if (planned.triggerReason === 'not_needed' || planned.searchExecutedAt) return;
    let active = this.#companySearches.get(planned.runId);
    if (!active) {
      active = this.#executeCompanyResearchSearch(planned);
      this.#companySearches.set(planned.runId, active);
      void active.finally(() => this.#companySearches.delete(planned.runId)).catch(() => undefined);
    }
    await active;
  }

  async #executeCompanyResearchSearch(input: {
    runId: string;
    companyName: string;
    triggerReason: SearchTriggerReason | 'not_needed';
    publicQuery?: string;
  }): Promise<void> {
    if (input.triggerReason === 'not_needed') return;
    if (!input.publicQuery) throw new Error('research_public_query_missing');
    if (!this.#search) {
      throw new SearchAdapterError('search_adapter_unavailable', 'Exa search adapter is not configured');
    }
    const results = await this.#search.search({
      companyName: input.companyName,
      reason: input.triggerReason,
      query: input.publicQuery,
      maxResults: 5,
    });
    const now = this.#now().toISOString();
    this.#transaction(() => {
      const latest = this.#db.prepare(`
        SELECT search_executed_at FROM company_research_runs WHERE run_id = ?
      `).get(input.runId) as { search_executed_at: string | null } | undefined;
      if (!latest) throw new Error('company_research_run_missing');
      if (latest.search_executed_at) return;
      for (const [index, result] of results.entries()) {
        const evidenceId = this.#nextId();
        const quote = result.highlights.join('\n').trim() || result.title;
        this.#db.prepare(`
          INSERT INTO evidence (
            evidence_id, source_type, quote, title, site, url, published_at, retrieved_at, created_at
          ) VALUES (?, 'web', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          evidenceId, quote, result.title, result.site, result.url,
          result.publishedAt ?? null, result.retrievedAt, now,
        );
        this.#db.prepare(`
          INSERT INTO web_search_results (result_id, run_id, evidence_id, rank, access_status)
          VALUES (?, ?, ?, ?, ?)
        `).run(this.#nextId(), input.runId, evidenceId, index + 1, result.accessStatus);
      }
      this.#db.prepare(`
        UPDATE company_research_runs SET search_executed_at = ?, updated_at = ? WHERE run_id = ?
      `).run(now, now, input.runId);
    });
  }

  async #analyzeCompany(step: ClaimedStep): Promise<StepOutcome> {
    if (!this.#research) throw new AnalysisAdapterError('research_adapter_unavailable', 'OpenCode research adapter is not configured');
    const run = this.#db.prepare(`
      SELECT r.run_id, r.company_id, r.intent, r.trigger_reason, r.summary,
        r.workflow_skill, r.workflow_context_json,
        t.conversation_id, t.session_id, c.canonical_name
      FROM company_research_runs r
      JOIN analysis_tasks t ON t.task_id = r.task_id
      JOIN companies c ON c.company_id = r.company_id
      WHERE r.task_id = ?
    `).get(step.taskId) as {
      run_id: string; company_id: string; intent: string; trigger_reason: string | null; summary: string | null;
      workflow_skill: string | null; workflow_context_json: string | null;
      conversation_id: string; session_id: string | null; canonical_name: string;
    } | undefined;
    if (!run) throw new Error('company_research_run_missing');
    if (run.summary) return 'completed';
    const existingKnowledge = this.#db.prepare(`
      SELECT knowledge_type, statement, value, status, created_at FROM knowledge
      WHERE company_id = ? AND status = 'current' ORDER BY created_at
    `).all(run.company_id) as unknown as Array<{
      knowledge_type: string; statement: string; value: string | null; status: string; created_at: string;
    }>;
    const pending = this.#db.prepare(`
      SELECT knowledge_type, statement FROM knowledge_candidates
      WHERE task_id = ? AND status IN ('pending', 'conflicted') ORDER BY created_at
    `).all(step.taskId) as unknown as Array<{ knowledge_type: string; statement: string }>;
    const webResults = this.#researchWebResults(run.run_id);
    const workflowRequest = run.workflow_context_json
      ? JSON.parse(run.workflow_context_json) as NonNullable<StartCompanyResearchInput['workflow']>
      : undefined;
    const workflowMaterials = workflowRequest
      ? this.#companyResearchWorkflowMaterialsForSourceIds(
          run.company_id,
          workflowRequest.inputScopeApproval.sourceIds,
        )
      : [];
    const workflowContext: CompanyResearchWorkflowContext | undefined = workflowRequest
      ? {
          scope: workflowRequest.scope,
          gates: {
            inputScopeApproval: {
              ...workflowRequest.inputScopeApproval,
            },
            ...(workflowRequest.methodAssumptionApproval
              ? { methodAssumptionApproval: workflowRequest.methodAssumptionApproval }
              : {}),
            externalReleaseApproval: { approved: false },
          },
          materials: workflowMaterials,
        }
      : undefined;
    const analyzedResult = await this.#research.analyze({
      taskId: step.taskId,
      conversationId: run.conversation_id,
      companyId: run.company_id,
      companyName: run.canonical_name,
      intent: run.intent,
      ...(run.trigger_reason ? { triggerReason: run.trigger_reason } : {}),
      existingKnowledge: existingKnowledge.map((item) => ({
        knowledgeType: item.knowledge_type,
        statement: item.statement,
        ...(item.value ? { value: item.value } : {}),
        status: item.status,
        createdAt: item.created_at,
      })),
      pendingCandidates: pending.map((item) => ({ knowledgeType: item.knowledge_type, statement: item.statement })),
      webResults,
      ...(run.workflow_skill
        ? { workflowSkill: run.workflow_skill as CompanyResearchWorkflowSkill }
        : {}),
      ...(workflowContext ? { workflowContext } : {}),
      ...(run.session_id ? { sessionId: run.session_id } : {}),
    });
    const result = workflowContext
      ? validateWorkflowResearchOutput(analyzedResult, workflowContext)
      : analyzedResult;
    const knownUrls = new Set(webResults.map((item) => item.url));
    for (const [index, candidate] of result.candidates.entries()) {
      if (candidate.evidenceUrls.length === 0 || candidate.evidenceUrls.some((url) => !knownUrls.has(url))) {
        throw new AnalysisAdapterError('research_evidence_unknown', `research candidate ${index} references an unknown URL`);
      }
    }
    const now = this.#now().toISOString();
    this.#transaction(() => {
      this.#db.prepare(`
        UPDATE analysis_tasks SET provider_id = ?, model_id = ?, session_id = ?, result_status = 'validated', updated_at = ?
        WHERE task_id = ?
      `).run(result.providerId, result.modelId, result.sessionId, now, step.taskId);
      this.#db.prepare(`
        UPDATE company_research_runs SET summary = ?, raw_text = ?, updated_at = ? WHERE run_id = ?
      `).run(result.summary, result.rawText, now, run.run_id);
      this.#db.prepare(`
        INSERT INTO analysis_runs (run_id, task_id, raw_text, candidate_drafts_json, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET raw_text = excluded.raw_text,
          candidate_drafts_json = excluded.candidate_drafts_json, created_at = excluded.created_at
      `).run(this.#nextId(), step.taskId, result.rawText, JSON.stringify(result.candidates), now);
      const sectionId = this.#nextId();
      this.#db.prepare(`
        INSERT INTO analysis_sections (section_id, task_id, section_key, summary, block_ids_json, created_at)
        VALUES (?, ?, 'company_research', ?, '[]', ?)
      `).run(sectionId, step.taskId, result.summary, now);
      const sectionEvidenceIds = workflowContext
        ? workflowContext.materials.map((material) => material.sourceId)
        : this.#researchSourceRows(run.run_id).map((source) => source.evidence_id);
      for (const evidenceId of sectionEvidenceIds) {
        this.#db.prepare('INSERT INTO analysis_section_evidence (section_id, evidence_id) VALUES (?, ?)').run(sectionId, evidenceId);
      }
    });
    return 'completed';
  }

  async #generateResearchCandidates(step: ClaimedStep): Promise<StepOutcome> {
    if (this.#db.prepare('SELECT 1 AS present FROM knowledge_candidates WHERE task_id = ? LIMIT 1').get(step.taskId)) return 'completed';
    const run = this.#db.prepare(`
      SELECT r.run_id, r.company_id, ar.candidate_drafts_json
      FROM company_research_runs r JOIN analysis_runs ar ON ar.task_id = r.task_id
      WHERE r.task_id = ?
    `).get(step.taskId) as { run_id: string; company_id: string; candidate_drafts_json: string } | undefined;
    if (!run) throw new Error('research_analysis_result_missing');
    const drafts = JSON.parse(run.candidate_drafts_json) as Array<{
      knowledgeType: string; statement: string; value?: string; effectiveAt?: string;
      evidenceUrls: string[]; highImpact: boolean; sensitive: boolean;
    }>;
    const evidenceByUrl = new Map(this.#researchSourceRows(run.run_id).map((source) => [source.url, source.evidence_id]));
    const now = this.#now().toISOString();
    this.#transaction(() => {
      for (const draft of drafts) {
        const candidateId = this.#nextId();
        const conflict = this.#hasKnowledgeConflict(run.company_id, draft.knowledgeType, draft.value ?? draft.statement);
        this.#db.prepare(`
          INSERT INTO knowledge_candidates (
            candidate_id, task_id, company_id, section_key, knowledge_type, statement, value,
            effective_at, status, version, high_impact, sensitive, created_at, updated_at
          ) VALUES (?, ?, ?, 'company_research', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
        `).run(
          candidateId, step.taskId, run.company_id, draft.knowledgeType, draft.statement,
          draft.value ?? null, draft.effectiveAt ?? null, conflict ? 'conflicted' : 'pending',
          draft.highImpact ? 1 : 0,
          draft.sensitive ? 1 : 0,
          now, now,
        );
        for (const url of draft.evidenceUrls) {
          const evidenceId = evidenceByUrl.get(url);
          if (!evidenceId) throw new Error('research_candidate_evidence_missing');
          this.#db.prepare('INSERT INTO candidate_evidence (candidate_id, evidence_id) VALUES (?, ?)').run(candidateId, evidenceId);
        }
      }
    });
    return 'completed';
  }

  async #loadIndustryResearchContext(step: ClaimedStep): Promise<StepOutcome> {
    const run = this.#db.prepare(`
      SELECT r.industry_id
      FROM industry_research_runs r
      WHERE r.task_id = ?
    `).get(step.taskId) as { industry_id: string } | undefined;
    if (!run) throw new Error('industry_research_run_missing');
    this.#industryRecord(run.industry_id);
    return 'completed';
  }

  async #planIndustrySearch(step: ClaimedStep): Promise<StepOutcome> {
    const run = this.#db.prepare(`
      SELECT r.industry_id, r.explicit_search, i.name
      FROM industry_research_runs r
      JOIN industries i ON i.industry_id = r.industry_id
      WHERE r.task_id = ?
    `).get(step.taskId) as {
      industry_id: string;
      explicit_search: number;
      name: string;
    } | undefined;
    if (!run) throw new Error('industry_research_run_missing');
    const trigger = run.explicit_search ? 'user_requested' : 'not_needed';
    const query = run.explicit_search
      ? `${run.name} 行业 产业链 市场 趋势 重点公司`
      : undefined;
    this.#db.prepare(`
      UPDATE industry_research_runs
      SET trigger_reason = ?, public_query = ?, updated_at = ?
      WHERE task_id = ?
    `).run(trigger, query ?? null, this.#now().toISOString(), step.taskId);
    return 'completed';
  }

  async #executeIndustrySearch(step: ClaimedStep): Promise<StepOutcome> {
    const run = this.#db.prepare(`
      SELECT r.run_id, r.trigger_reason, r.public_query, r.search_executed_at,
        i.name
      FROM industry_research_runs r
      JOIN industries i ON i.industry_id = r.industry_id
      WHERE r.task_id = ?
    `).get(step.taskId) as {
      run_id: string;
      trigger_reason: string;
      public_query: string | null;
      search_executed_at: string | null;
      name: string;
    } | undefined;
    if (!run) throw new Error('industry_research_run_missing');
    if (run.trigger_reason === 'not_needed') return 'skipped';
    if (run.search_executed_at) return 'completed';
    if (!run.public_query) throw new Error('industry_research_public_query_missing');
    if (!this.#search) {
      throw new SearchAdapterError(
        'search_adapter_unavailable',
        'Exa search adapter is not configured',
      );
    }
    const results = await this.#search.search({
      companyName: run.name,
      reason: 'user_requested',
      query: run.public_query,
      maxResults: 5,
    });
    const now = this.#now().toISOString();
    this.#transaction(() => {
      for (const [index, result] of results.entries()) {
        const evidenceId = this.#nextId();
        const quote = result.highlights.join('\n').trim() || result.title;
        this.#db.prepare(`
          INSERT INTO evidence (
            evidence_id, source_type, quote, title, site, url,
            published_at, retrieved_at, created_at
          ) VALUES (?, 'web', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          evidenceId,
          quote,
          result.title,
          result.site,
          result.url,
          result.publishedAt ?? null,
          result.retrievedAt,
          now,
        );
        this.#db.prepare(`
          INSERT INTO industry_web_search_results (
            result_id, run_id, evidence_id, rank, access_status
          ) VALUES (?, ?, ?, ?, ?)
        `).run(
          this.#nextId(),
          run.run_id,
          evidenceId,
          index + 1,
          result.accessStatus,
        );
      }
      this.#db.prepare(`
        UPDATE industry_research_runs
        SET search_executed_at = ?, updated_at = ?
        WHERE run_id = ?
      `).run(now, now, run.run_id);
    });
    return 'completed';
  }

  async #analyzeIndustry(step: ClaimedStep): Promise<StepOutcome> {
    if (!this.#industryResearch) {
      throw new AnalysisAdapterError(
        'industry_research_adapter_unavailable',
        'OpenCode industry research adapter is not configured',
      );
    }
    const run = this.#db.prepare(`
      SELECT r.run_id, r.industry_id, r.intent, r.summary,
        t.conversation_id, t.session_id, i.name, i.summary AS industry_summary
      FROM industry_research_runs r
      JOIN analysis_tasks t ON t.task_id = r.task_id
      JOIN industries i ON i.industry_id = r.industry_id
      WHERE r.task_id = ?
    `).get(step.taskId) as {
      run_id: string;
      industry_id: string;
      intent: string;
      summary: string | null;
      conversation_id: string;
      session_id: string | null;
      name: string;
      industry_summary: string;
    } | undefined;
    if (!run) throw new Error('industry_research_run_missing');
    if (run.summary) return 'completed';
    const nodes = this.#db.prepare(`
      SELECT stage, name, description
      FROM industry_nodes
      WHERE industry_id = ?
      ORDER BY node_order, node_id
    `).all(run.industry_id) as unknown as Array<{
      stage: 'upstream' | 'midstream' | 'downstream';
      name: string;
      description: string | null;
    }>;
    const materials = this.#industryResearchMaterials(run.industry_id);
    const webResults = this.#industryResearchWebResults(run.run_id);
    const result = await this.#industryResearch.analyze({
      taskId: step.taskId,
      conversationId: run.conversation_id,
      industryId: run.industry_id,
      industryName: run.name,
      intent: run.intent,
      industrySummary: run.industry_summary,
      nodes: nodes.map((node) => ({
        stage: node.stage,
        name: node.name,
        ...(node.description ? { description: node.description } : {}),
      })),
      materials,
      webResults,
      ...(run.session_id ? { sessionId: run.session_id } : {}),
    });
    const now = this.#now().toISOString();
    this.#transaction(() => {
      this.#db.prepare(`
        UPDATE analysis_tasks
        SET provider_id = ?, model_id = ?, session_id = ?,
          result_status = 'validated', updated_at = ?
        WHERE task_id = ?
      `).run(
        result.providerId,
        result.modelId,
        result.sessionId,
        now,
        step.taskId,
      );
      this.#db.prepare(`
        UPDATE industry_research_runs
        SET summary = ?, raw_text = ?, updated_at = ?
        WHERE run_id = ?
      `).run(result.summary, result.rawText, now, run.run_id);
      this.#db.prepare(`
        INSERT INTO analysis_runs (
          run_id, task_id, raw_text, candidate_drafts_json, created_at
        ) VALUES (?, ?, ?, '[]', ?)
        ON CONFLICT(task_id) DO UPDATE SET
          raw_text = excluded.raw_text,
          candidate_drafts_json = excluded.candidate_drafts_json,
          created_at = excluded.created_at
      `).run(this.#nextId(), step.taskId, result.rawText, now);
      const sectionId = this.#nextId();
      this.#db.prepare(`
        INSERT INTO analysis_sections (
          section_id, task_id, section_key, summary, block_ids_json, created_at
        ) VALUES (?, ?, 'industry_research', ?, '[]', ?)
      `).run(sectionId, step.taskId, result.summary, now);
      const evidenceIds = new Set([
        ...materials.map((material) => material.evidenceId),
        ...this.#industryResearchSourceRows(run.run_id)
          .map((source) => source.evidence_id),
      ]);
      for (const evidenceId of evidenceIds) {
        this.#db.prepare(`
          INSERT OR IGNORE INTO analysis_section_evidence (section_id, evidence_id)
          VALUES (?, ?)
        `).run(sectionId, evidenceId);
      }
    });
    return 'completed';
  }

  #pipelineTarget(taskId: string): PipelineTarget {
    const target = this.#db.prepare(`
      SELECT
        t.task_id AS taskId, c.conversation_id AS conversationId,
        d.document_id AS documentId, d.file_name AS fileName, d.mime_type AS mimeType,
        d.bytes, d.sha256, d.storage_path AS storagePath
      FROM analysis_tasks t
      JOIN conversations c ON c.conversation_id = t.conversation_id
      JOIN documents d ON d.document_id = c.primary_document_id
      WHERE t.task_id = ?
    `).get(taskId) as PipelineTarget | undefined;
    if (!target) throw new Error('pipeline_target_missing');
    return target;
  }

  #documentMaterialType(documentId: string): string | undefined {
    const row = this.#db.prepare('SELECT material_type FROM documents WHERE document_id = ?').get(documentId) as { material_type: string | null } | undefined;
    return row?.material_type ?? undefined;
  }

  #taskType(taskId: string): AnalysisTaskRecord['type'] {
    const row = this.#db.prepare('SELECT task_type FROM analysis_tasks WHERE task_id = ?').get(taskId) as { task_type: string } | undefined;
    if (!row) throw new Error('analysis_task_missing');
    return row.task_type as AnalysisTaskRecord['type'];
  }

  #isBoundIndustryMaterialTask(taskId: string): boolean {
    return Boolean(this.#db.prepare(`
      SELECT 1 AS present
      FROM analysis_tasks task
      JOIN conversation_industries industry
        ON industry.conversation_id = task.conversation_id
        AND industry.role = 'primary'
      WHERE task.task_id = ? AND task.task_type = 'material_analysis'
        AND NOT EXISTS (
          SELECT 1 FROM conversation_companies company
          WHERE company.conversation_id = task.conversation_id
            AND company.role = 'primary'
        )
      LIMIT 1
    `).get(taskId));
  }

  async #identifyCompanyList(target: PipelineTarget): Promise<StepOutcome> {
    const existing = this.#db.prepare('SELECT list_id, status FROM company_lists WHERE conversation_id = ?')
      .get(target.conversationId) as { list_id: string; status: string } | undefined;
    if (existing) return existing.status === 'pending_confirmation' ? 'pending_confirmation' : 'completed';
    const blocks = this.#loadParsedBlocks(target.documentId);
    const extracted = await this.#companyListExtraction.extract({
      fileName: target.fileName,
      blocks: boundedAiBlocks(blocks),
    });
    const rows = extracted.companies;
    if (rows.length === 0) throw new PlatformInputError('company_list_has_no_companies', '未从材料中识别到公司名称');
    const blockById = new Map(blocks.map((block) => [block.blockId, block]));
    const listId = this.#nextId();
    const now = this.#now().toISOString();
    this.#transaction(() => {
      this.#db.prepare(`
        UPDATE analysis_tasks SET provider_id = ?, model_id = ?, result_status = 'validated', updated_at = ?
        WHERE task_id = ?
      `).run(extracted.providerId, extracted.modelId, now, target.taskId);
      this.#db.prepare(`
        INSERT INTO company_lists (list_id, document_id, conversation_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'pending_confirmation', ?, ?)
      `).run(listId, target.documentId, target.conversationId, now, now);
      const insertRow = this.#db.prepare(`
        INSERT INTO company_list_rows (
          row_id, list_id, row_order, original_value, normalized_name, match_status,
          confirmation_status, option_ids_json, evidence_id, error_code, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 1, ?, ?)
      `);
      rows.forEach((item, index) => {
        const block = blockById.get(item.blockId);
        if (!block) throw new Error('company_list_evidence_block_missing');
        const name = canonicalCompanyName(item.name);
        let matchStatus: 'existing' | 'new' | 'ambiguous' | 'failed' = 'failed';
        let errorCode: string | undefined;
        let matches: string[] = [];
        try {
          assertCompanyListName(name);
          matches = this.#matchCompanies(name);
          matchStatus = matches.length === 0 ? 'new' : matches.length === 1 ? 'existing' : 'ambiguous';
        } catch (error) {
          errorCode = error instanceof PlatformInputError ? error.code : 'invalid_company_name';
        }
        const evidenceId = this.#evidenceForBlock(target.documentId, block, now);
        insertRow.run(
          this.#nextId(), listId, index + 1, item.originalText, name || null, matchStatus,
          JSON.stringify(matches), evidenceId, errorCode ?? null, now, now,
        );
      });
      this.#db.prepare("UPDATE documents SET archive_status = 'archived' WHERE document_id = ?").run(target.documentId);
    });
    return 'pending_confirmation';
  }

  #refreshCompanyListStatus(listId: string, conversationId: string, now: string): void {
    const counts = this.#db.prepare(`
      SELECT
        SUM(CASE WHEN confirmation_status = 'pending' AND match_status != 'failed' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN confirmation_status = 'pending' AND match_status = 'failed' THEN 1 ELSE 0 END) AS failed_count
      FROM company_list_rows WHERE list_id = ?
    `).get(listId) as { pending_count: number | null; failed_count: number | null };
    if ((counts.pending_count ?? 0) > 0) {
      this.#db.prepare("UPDATE company_lists SET status = 'pending_confirmation', updated_at = ? WHERE list_id = ?").run(now, listId);
      return;
    }
    const listStatus = (counts.failed_count ?? 0) > 0 ? 'completed_with_errors' : 'completed';
    this.#db.prepare('UPDATE company_lists SET status = ?, updated_at = ? WHERE list_id = ?').run(listStatus, now, listId);
    const task = this.#db.prepare(`
      SELECT t.task_id FROM analysis_tasks t WHERE t.conversation_id = ? AND t.task_type = 'company_list_processing'
    `).get(conversationId) as { task_id: string } | undefined;
    if (!task) return;
    const identify = this.#db.prepare(`
      SELECT step_id, position FROM task_steps WHERE task_id = ? AND step_name = 'identify_company'
    `).get(task.task_id) as { step_id: string; position: number } | undefined;
    if (!identify) return;
    this.#db.prepare(`
      UPDATE task_steps SET status = 'completed', finished_at = ?, error_code = NULL
      WHERE step_id = ? AND status = 'pending_confirmation'
    `).run(now, identify.step_id);
    const next = this.#db.prepare(`
      SELECT step_id, step_name FROM task_steps WHERE task_id = ? AND position > ? ORDER BY position LIMIT 1
    `).get(task.task_id, identify.position) as { step_id: string; step_name: string } | undefined;
    if (next) {
      this.#db.prepare("UPDATE task_steps SET status = 'queued' WHERE step_id = ? AND status = 'blocked'").run(next.step_id);
      this.#db.prepare("UPDATE analysis_tasks SET status = 'waiting', current_step = ?, updated_at = ? WHERE task_id = ?")
        .run(next.step_name, now, task.task_id);
      this.#db.prepare("UPDATE conversations SET status = 'waiting', updated_at = ? WHERE conversation_id = ?")
        .run(now, conversationId);
    }
  }

  #loadParsedBlocks(documentId: string): ParsedBlock[] {
    const rows = this.#db.prepare(`
      SELECT block_id, kind, text, page, paragraph, heading_path_json, sheet, row_number, cell_range
      FROM parsed_blocks WHERE document_id = ? ORDER BY block_order
    `).all(documentId) as unknown as ParsedBlockRow[];
    return rows.map((row) => ({
      blockId: row.block_id,
      kind: row.kind as ParsedBlock['kind'],
      text: row.text,
      ...(row.page !== null ? { page: row.page } : {}),
      ...(row.paragraph !== null ? { paragraph: row.paragraph } : {}),
      ...(row.heading_path_json ? { headingPath: JSON.parse(row.heading_path_json) as string[] } : {}),
      ...(row.sheet ? { sheet: row.sheet } : {}),
      ...(row.row_number !== null ? { row: row.row_number } : {}),
      ...(row.cell_range ? { cellRange: row.cell_range } : {}),
    }));
  }

  #matchCompanies(name: string): string[] {
    const rows = this.#db.prepare(`
      SELECT company_id FROM companies WHERE canonical_name = ? AND status != 'merged'
      UNION
      SELECT c.company_id FROM company_aliases a JOIN companies c ON c.company_id = a.company_id
      WHERE a.alias = ? AND c.status != 'merged'
      ORDER BY company_id
    `).all(name, name) as unknown as Array<{ company_id: string }>;
    return rows.map((row) => row.company_id);
  }

  #createCompany(name: string): string {
    const now = this.#now().toISOString();
    return this.#transaction(() => this.#insertCompany(name, now));
  }

  #insertCompany(name: string, now: string): string {
    const companyId = this.#nextId();
    const active = hasLegalEntitySuffix(name);
    const suggestion = suggestSubjectKind(name);
    this.#db.prepare(`
      INSERT INTO companies (
        company_id, canonical_name, status, subject_kind, subject_kind_status,
        suggested_subject_kind, subject_kind_reason, version, created_at, updated_at
      ) VALUES (?, ?, ?, 'unknown', 'pending', ?, ?, 1, ?, ?)
    `).run(
      companyId,
      name,
      active ? 'active' : 'provisional',
      suggestion.kind,
      suggestion.reason,
      now,
      now,
    );
    for (const alias of companyAliases(name)) {
      this.#db.prepare(`
        INSERT OR IGNORE INTO company_aliases (alias_id, company_id, alias, alias_type, created_at)
        VALUES (?, ?, ?, 'short_name', ?)
      `).run(this.#nextId(), companyId, alias, now);
    }
    return companyId;
  }

  #updateSubjectSuggestion(
    companyId: string,
    canonicalName: string,
    analysisSummary: string | undefined,
    now: string,
  ): void {
    const suggestion = suggestSubjectKind(canonicalName, analysisSummary);
    this.#db.prepare(`
      UPDATE companies SET suggested_subject_kind = ?, subject_kind_reason = ?,
        updated_at = ?
      WHERE company_id = ? AND subject_kind_status = 'pending'
    `).run(suggestion.kind, suggestion.reason, now, companyId);
  }

  #latestSubjectAnalysisSummary(companyId: string): string | undefined {
    const row = this.#db.prepare(`
      SELECT section.summary
      FROM analysis_sections section
      JOIN analysis_tasks task ON task.task_id = section.task_id
      JOIN conversation_companies link
        ON link.conversation_id = task.conversation_id AND link.role = 'primary'
      WHERE link.company_id = ?
        AND section.section_key = 'company_and_project_stage'
        AND task.result_status = 'validated'
      ORDER BY section.created_at DESC, section.section_id DESC
      LIMIT 1
    `).get(companyId) as { summary: string } | undefined;
    return row?.summary;
  }

  #addDocumentAliases(companyId: string, blocks: ParsedBlock[]): void {
    const now = this.#now().toISOString();
    for (const alias of extractDeclaredAliases(blocks)) {
      this.#db.prepare(`
        INSERT OR IGNORE INTO company_aliases (alias_id, company_id, alias, alias_type, created_at)
        VALUES (?, ?, ?, 'declared_short_name', ?)
      `).run(this.#nextId(), companyId, alias, now);
    }
  }

  #applyOrganizationCandidate(candidate: KnowledgeCandidateRecord, statement: string, value: string | undefined, now: string): void {
    const type = candidate.knowledgeType.normalize('NFKC').toLowerCase();
    const parent = /parent_company|group_company|holding_company|母公司|集团主体|控股主体/u.test(type);
    const child = /subsidiary|controlled_company|project_company|子公司|项目公司/u.test(type);
    const alias = /brand|alias|short_name|english_name|project_name|品牌|简称|英文名|项目名/u.test(type);
    if (!parent && !child && !alias) return;
    const name = organizationCandidateName(value, statement);
    if (!name) return;
    if (alias && !(child && hasLegalEntitySuffix(name))) {
      const aliasType = /brand|品牌/u.test(type) ? 'brand' : /project|项目/u.test(type) ? 'project' : /english|英文/u.test(type) ? 'english_name' : 'alias';
      this.#db.prepare(`
        INSERT OR IGNORE INTO company_aliases (alias_id, company_id, alias, alias_type, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(this.#nextId(), candidate.companyId, name, aliasType, now);
      return;
    }
    if (!parent && !child) return;
    const relatedId = this.#matchCompanies(name)[0] ?? this.#insertCompany(name, now);
    if (relatedId === candidate.companyId) return;
    const fromCompanyId = parent ? relatedId : candidate.companyId;
    const toCompanyId = parent ? candidate.companyId : relatedId;
    const evidence = this.#db.prepare(`
      SELECT evidence_id FROM candidate_evidence WHERE candidate_id = ? AND status = 'supporting' ORDER BY rowid LIMIT 1
    `).get(candidate.candidateId) as { evidence_id: string } | undefined;
    this.#db.prepare(`
      INSERT INTO company_relations (
        relation_id, from_company_id, to_company_id, relation_type, status, created_at,
        source_candidate_id, evidence_id, updated_at
      ) VALUES (?, ?, ?, 'parent_company', 'confirmed', ?, ?, ?, ?)
      ON CONFLICT(from_company_id, to_company_id, relation_type) DO UPDATE SET
        status = 'confirmed', source_candidate_id = excluded.source_candidate_id,
        evidence_id = excluded.evidence_id, updated_at = excluded.updated_at
    `).run(
      this.#nextId(), fromCompanyId, toCompanyId, now, candidate.candidateId,
      evidence?.evidence_id ?? null, now,
    );
  }

  #attachCompany(conversationId: string, companyId: string): void {
    const now = this.#now().toISOString();
    this.#db.prepare(`
      INSERT OR IGNORE INTO conversation_companies (conversation_id, company_id, role, created_at)
      VALUES (?, ?, 'primary', ?)
    `).run(conversationId, companyId, now);
    this.#db.prepare(`
      UPDATE documents SET archive_status = 'stored'
      WHERE document_id = (SELECT primary_document_id FROM conversations WHERE conversation_id = ?)
    `).run(conversationId);
  }

  #createCompanyMatchCase(conversationId: string, proposedName: string | undefined, optionIds: string[]): void {
    const now = this.#now().toISOString();
    this.#db.prepare(`
      INSERT INTO company_match_cases (
        case_id, conversation_id, proposed_name, status, option_ids_json, version, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, 1, ?, ?)
    `).run(this.#nextId(), conversationId, proposedName ?? null, JSON.stringify(optionIds), now, now);
  }

  #hasKnowledgeConflict(companyId: string, knowledgeType: string, proposedValue: string): boolean {
    const rows = this.#db.prepare(`
      SELECT statement, value FROM knowledge
      WHERE company_id = ? AND knowledge_type = ? AND status IN ('current', 'disputed')
    `).all(companyId, knowledgeType) as unknown as Array<{ statement: string; value: string | null }>;
    const normalized = normalizeComparable(proposedValue);
    return rows.some((row) => normalizeComparable(row.value ?? row.statement) !== normalized);
  }

  #companyRecord(companyId: string): CompanyRecord {
    const row = this.#db.prepare(`
      SELECT company_id, canonical_name, status, subject_kind,
        subject_kind_status, suggested_subject_kind, subject_kind_reason,
        version, created_at, updated_at
      FROM companies WHERE company_id = ?
    `).get(companyId) as {
      company_id: string; canonical_name: string; status: string;
      subject_kind: string; subject_kind_status: string;
      suggested_subject_kind: string | null; subject_kind_reason: string | null;
      version: number; created_at: string; updated_at: string;
    } | undefined;
    if (!row) throw new PlatformNotFoundError(`company not found: ${companyId}`);
    const aliases = this.#db.prepare(`
      SELECT alias, alias_type FROM company_aliases WHERE company_id = ? ORDER BY alias_type, alias
    `).all(companyId) as unknown as Array<{ alias: string; alias_type: string }>;
    const parent = this.#db.prepare(`
      SELECT company.company_id, company.canonical_name
      FROM subject_company_links link
      JOIN companies company ON company.company_id = link.company_id
      WHERE link.subject_id = ?
    `).get(companyId) as {
      company_id: string;
      canonical_name: string;
    } | undefined;
    return {
      companyId: row.company_id,
      canonicalName: row.canonical_name,
      status: row.status as CompanyRecord['status'],
      aliases: aliases.map((alias) => ({ alias: alias.alias, type: alias.alias_type })),
      subjectKind: row.subject_kind as CompanyRecord['subjectKind'],
      subjectKindStatus: row.subject_kind_status as CompanyRecord['subjectKindStatus'],
      ...(row.suggested_subject_kind ? {
        suggestedSubjectKind: row.suggested_subject_kind as SubjectKind,
      } : {}),
      ...(row.subject_kind_reason ? { subjectKindReason: row.subject_kind_reason } : {}),
      ...(parent ? {
        parentCompany: {
          companyId: parent.company_id,
          canonicalName: parent.canonical_name,
        },
      } : {}),
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  #companyCardRecord(companyId: string): CompanyCardRecord {
    const company = this.#companyRecord(companyId);
    const pending = this.#db.prepare(`
      SELECT COUNT(*) AS count FROM knowledge_candidates
      WHERE company_id = ? AND status IN ('pending', 'conflicted')
    `).get(companyId) as { count: number };
    const knowledge = this.#db.prepare(`
      SELECT COUNT(*) AS count FROM knowledge
      WHERE company_id = ? AND status != 'superseded'
    `).get(companyId) as { count: number };
    const latestMaterialAnalysis = this.#latestMaterialAnalysisSummary(companyId);
    return {
      ...company,
      profile: this.#companyProfile(companyId),
      materialCount: this.#companyMaterials(companyId).length,
      knowledgeCount: knowledge.count,
      pendingCandidateCount: pending.count,
      ...(latestMaterialAnalysis ? { latestMaterialAnalysis } : {}),
    };
  }

  #latestMaterialAnalysisSummary(
    companyId: string,
  ): CompanyCardRecord['latestMaterialAnalysis'] {
    const row = this.#latestMaterialAnalysisRow(companyId);
    if (!row) return undefined;
    return {
      taskId: row.task_id,
      conversationId: row.conversation_id,
      documentId: row.document_id,
      fileName: row.file_name,
      taskStatus: row.task_status as TaskStatus,
      ...(row.result_status ? { resultStatus: row.result_status } : {}),
      ...(row.summary ? { summary: row.summary } : {}),
      sectionCount: row.section_count,
      updatedAt: row.updated_at,
    };
  }

  #latestMaterialAnalysisDetail(
    companyId: string,
  ): CompanyDetail['latestMaterialAnalysis'] {
    const summary = this.#latestMaterialAnalysisSummary(companyId);
    if (!summary) return undefined;
    return { ...summary, sections: this.#analysisSections(summary.taskId) };
  }

  #latestMaterialAnalysisRow(companyId: string): {
    task_id: string;
    conversation_id: string;
    document_id: string;
    file_name: string;
    task_status: string;
    result_status: string | null;
    summary: string | null;
    section_count: number;
    updated_at: string;
  } | undefined {
    return this.#db.prepare(`
      SELECT task.task_id, task.conversation_id, document.document_id,
        document.file_name, task.status AS task_status, task.result_status,
        (
          SELECT section.summary FROM analysis_sections section
          WHERE section.task_id = task.task_id
            AND section.section_key = 'company_and_project_stage'
          LIMIT 1
        ) AS summary,
        (
          SELECT COUNT(*) FROM analysis_sections section
          WHERE section.task_id = task.task_id
        ) AS section_count,
        task.updated_at
      FROM conversation_companies company
      JOIN analysis_tasks task ON task.conversation_id = company.conversation_id
      JOIN conversations conversation ON conversation.conversation_id = task.conversation_id
      JOIN documents document ON document.document_id = conversation.primary_document_id
      WHERE company.company_id = ? AND company.role = 'primary'
        AND task.task_type = 'material_analysis'
      ORDER BY task.updated_at DESC, task.task_id DESC
      LIMIT 1
    `).get(companyId) as {
      task_id: string;
      conversation_id: string;
      document_id: string;
      file_name: string;
      task_status: string;
      result_status: string | null;
      summary: string | null;
      section_count: number;
      updated_at: string;
    } | undefined;
  }

  #companyProfile(companyId: string): CompanyProfile {
    const summary = this.#companyProfileField(companyId, ['company_summary', 'company_introduction', 'material_summary']);
    let primaryIndustry = this.#companyProfileField(companyId, ['primary_industry', 'industry', 'industry_name']);
    let industryPosition = this.#companyProfileField(companyId, ['industry_position', 'chain_position', 'industry_chain_position']);
    const placements = this.#companyIndustryPlacements(companyId);
    const confirmedPlacement = placements.find((placement) => placement.status === 'confirmed');
    const uncertainPlacement = placements.find((placement) => placement.status === 'conflicted')
      ?? placements.find((placement) => placement.status === 'candidate');
    if (primaryIndustry.state === 'missing' && confirmedPlacement) {
      primaryIndustry = { value: confirmedPlacement.industryName, state: 'confirmed' };
    } else if (primaryIndustry.state === 'missing' && uncertainPlacement) {
      primaryIndustry = { state: uncertainPlacement.status === 'conflicted' ? 'conflicted' : 'pending' };
    }
    if (industryPosition.state === 'missing' && confirmedPlacement) {
      industryPosition = { value: confirmedPlacement.positionLabel, state: 'confirmed' };
    } else if (industryPosition.state === 'missing' && uncertainPlacement) {
      industryPosition = { state: uncertainPlacement.status === 'conflicted' ? 'conflicted' : 'pending' };
    }
    const watch = this.#db.prepare('SELECT watched FROM companies WHERE company_id = ?')
      .get(companyId) as { watched: number };
    return {
      summary,
      primaryIndustry,
      industryPosition,
      location: this.#companyProfileField(companyId, ['location', 'headquarters', 'registered_location']),
      foundedAt: this.#companyProfileField(companyId, ['founded_at', 'established_at', 'founding_date']),
      latestFunding: this.#companyProfileField(companyId, ['latest_funding', 'financing', 'funding_round']),
      watched: Boolean(watch.watched),
    };
  }

  #companyProfileField(companyId: string, knowledgeTypes: string[]): CompanyProfile['summary'] {
    const placeholders = knowledgeTypes.map(() => '?').join(', ');
    const knowledge = this.#db.prepare(`
      SELECT statement, value, status FROM knowledge
      WHERE company_id = ? AND knowledge_type IN (${placeholders}) AND status IN ('current', 'disputed')
      ORDER BY version DESC, created_at DESC
    `).all(companyId, ...knowledgeTypes) as unknown as Array<{ statement: string; value: string | null; status: string }>;
    if (knowledge.some((item) => item.status === 'disputed')) return { state: 'conflicted' };
    const current = knowledge.find((item) => item.status === 'current');
    if (current) return { value: current.value ?? current.statement, state: 'confirmed' };
    const candidates = this.#db.prepare(`
      SELECT status FROM knowledge_candidates
      WHERE company_id = ? AND knowledge_type IN (${placeholders}) AND status IN ('pending', 'conflicted')
      ORDER BY updated_at DESC
    `).all(companyId, ...knowledgeTypes) as unknown as Array<{ status: string }>;
    if (candidates.some((item) => item.status === 'conflicted')) return { state: 'conflicted' };
    return { state: candidates.length > 0 ? 'pending' : 'missing' };
  }

  #companyMaterials(companyId: string): CompanyDetail['materials'] {
    const rows = this.#db.prepare(`
      SELECT DISTINCT c.conversation_id, d.document_id, d.file_name, d.material_type,
        c.status, c.source_channel, c.updated_at
      FROM conversation_companies cc
      JOIN conversations c ON c.conversation_id = cc.conversation_id
      JOIN analysis_tasks task ON task.conversation_id = c.conversation_id
      JOIN conversation_documents cd ON cd.conversation_id = c.conversation_id
      JOIN documents d ON d.document_id = cd.document_id
      WHERE cc.company_id = ? AND task.task_type != 'company_research'
      ORDER BY c.updated_at DESC, c.conversation_id DESC
    `).all(companyId) as unknown as Array<{
      conversation_id: string; document_id: string; file_name: string; material_type: string | null;
      status: string; source_channel: string; updated_at: string;
    }>;
    return rows.map((item) => ({
      conversationId: item.conversation_id,
      documentId: item.document_id,
      fileName: item.file_name,
      ...(item.material_type ? { materialType: item.material_type } : {}),
      status: item.status as ConversationStatus,
      sourceChannel: item.source_channel as SourceChannel,
      updatedAt: item.updated_at,
    }));
  }

  #companyIndustryPlacements(companyId: string): CompanyDetail['industryPlacements'] {
    const rows = this.#db.prepare(`
      SELECT ci.industry_id, industries.name AS industry_name, ci.node_id, nodes.name AS node_name,
        ci.position_label, ci.status, ci.evidence_id
      FROM company_industries ci
      JOIN industries ON industries.industry_id = ci.industry_id
      LEFT JOIN industry_nodes nodes ON nodes.node_id = ci.node_id
      WHERE ci.company_id = ? ORDER BY ci.updated_at DESC, ci.industry_id
    `).all(companyId) as unknown as Array<{
      industry_id: string; industry_name: string; node_id: string | null; node_name: string | null;
      position_label: string; status: string; evidence_id: string | null;
    }>;
    return rows.map((item) => ({
      industryId: item.industry_id,
      industryName: item.industry_name,
      ...(item.node_id ? { nodeId: item.node_id } : {}),
      ...(item.node_name ? { nodeName: item.node_name } : {}),
      positionLabel: item.position_label,
      status: relationStatus(item.status),
      ...(item.evidence_id ? { evidence: this.#evidenceById(item.evidence_id) } : {}),
    }));
  }

  #industryRecord(industryId: string): IndustryRecord {
    const row = this.#db.prepare(`
      SELECT industry_id, name, summary, status, watched, version, updated_at
      FROM industries WHERE industry_id = ?
    `).get(industryId) as {
      industry_id: string; name: string; summary: string; status: string;
      watched: number; version: number; updated_at: string;
    } | undefined;
    if (!row) throw new PlatformNotFoundError(`industry not found: ${industryId}`);
    const counts = this.#db.prepare(`
      SELECT
        (SELECT COUNT(DISTINCT document_id) FROM industry_materials WHERE industry_id = ?) AS material_count,
        (SELECT COUNT(DISTINCT company_id) FROM company_industries WHERE industry_id = ?) AS company_count
    `).get(industryId, industryId) as { material_count: number; company_count: number };
    return {
      industryId: row.industry_id,
      name: row.name,
      summary: row.summary,
      status: row.status as IndustryRecord['status'],
      watched: Boolean(row.watched),
      version: row.version,
      materialCount: counts.material_count,
      companyCount: counts.company_count,
      updatedAt: row.updated_at,
    };
  }

  #evidenceById(evidenceId: string): EvidenceRecord {
    const evidence = this.#evidenceRecords('WHERE e.evidence_id = ?', evidenceId)[0];
    if (!evidence) throw new Error('industry_evidence_missing');
    return evidence;
  }

  #syncIndustrySkeleton(input: {
    companyId: string;
    conversationId: string;
    documentId: string;
    industryMarketSummary: string;
    industryChainSummary: string;
    evidenceId?: string;
    now: string;
  }): string {
    const classification = classifyCanonicalIndustry({
      industryMarketSummary: input.industryMarketSummary,
      industryChainSummary: input.industryChainSummary,
    });
    const summary = [input.industryMarketSummary, input.industryChainSummary]
      .map((value) => value.trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, 1_500);
    let industry = this.#db.prepare('SELECT industry_id, status FROM industries WHERE name = ?')
      .get(classification.name) as { industry_id: string; status: string } | undefined;
    if (!industry) {
      industry = { industry_id: this.#nextId(), status: 'draft' };
      this.#db.prepare(`
        INSERT INTO industries (industry_id, name, summary, status, created_at, updated_at)
        VALUES (?, ?, ?, 'draft', ?, ?)
      `).run(industry.industry_id, classification.name, summary, input.now, input.now);
      const insertNode = this.#db.prepare(`
        INSERT INTO industry_nodes (node_id, industry_id, node_order, stage, name, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const nodeBlueprints: Array<readonly [string, string, string]> = [
        ['upstream', '原材料与基础技术', '产业上游的基础供给与共性技术'],
        ['midstream', '产品与解决方案', '产品研发、制造与解决方案交付'],
        ['downstream', '客户与应用场景', '下游客户、渠道与最终应用'],
      ];
      nodeBlueprints.forEach(([stage, nodeName, description], index) => {
        insertNode.run(this.#nextId(), industry!.industry_id, index + 1, stage, nodeName, description, input.now);
      });
    } else {
      this.#db.prepare(`
        UPDATE industries SET summary = CASE WHEN length(summary) < ? THEN ? ELSE summary END, updated_at = ?
        WHERE industry_id = ? AND status = 'draft'
      `).run(summary.length, summary, input.now, industry.industry_id);
    }
    const node = this.#db.prepare(`
      SELECT node_id FROM industry_nodes WHERE industry_id = ? AND stage = 'midstream' ORDER BY node_order LIMIT 1
    `).get(industry.industry_id) as { node_id: string } | undefined;
    this.#db.prepare(`
      INSERT OR IGNORE INTO industry_materials (
        industry_id, conversation_id, document_id, evidence_id, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(industry.industry_id, input.conversationId, input.documentId, input.evidenceId ?? null, input.now);
    this.#db.prepare(`
      INSERT OR IGNORE INTO conversation_industries (
        conversation_id, industry_id, role, created_at
      ) VALUES (?, ?, 'primary', ?)
    `).run(input.conversationId, industry.industry_id, input.now);
    this.#db.prepare(`
      INSERT INTO company_industries (
        company_id, industry_id, node_id, position_label, status, evidence_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'candidate', ?, ?, ?)
      ON CONFLICT(company_id, industry_id) DO UPDATE SET
        node_id = COALESCE(company_industries.node_id, excluded.node_id),
        evidence_id = COALESCE(company_industries.evidence_id, excluded.evidence_id),
        updated_at = excluded.updated_at
    `).run(
      input.companyId,
      industry.industry_id,
      node?.node_id ?? null,
      input.industryChainSummary.trim().slice(0, 240) || '产业链位置待确认',
      input.evidenceId ?? null,
      input.now,
      input.now,
    );
    return industry.industry_id;
  }

  #reclassifyIndustriesInternal(now: string): IndustryReclassificationResult {
    const sources = this.#db.prepare(`
      SELECT company.company_id, task.task_id, task.conversation_id,
        conversation.primary_document_id AS document_id
      FROM conversation_companies company
      JOIN companies entity ON entity.company_id = company.company_id
      JOIN analysis_tasks task ON task.conversation_id = company.conversation_id
      JOIN conversations conversation ON conversation.conversation_id = task.conversation_id
      WHERE company.role = 'primary' AND entity.status != 'merged'
        AND task.task_type = 'material_analysis'
        AND EXISTS (
          SELECT 1 FROM analysis_sections section
          WHERE section.task_id = task.task_id
            AND section.section_key IN (
              'industry_market_and_policy', 'industry_chain_position'
            )
        )
      ORDER BY company.company_id, task.updated_at, task.task_id
    `).all() as unknown as Array<{
      company_id: string;
      task_id: string;
      conversation_id: string;
      document_id: string;
    }>;
    const reclassifiedCompanies = new Set<string>();
    const draftTargets = new Map<string, Set<string>>();
    let mergedIndustries = 0;
    for (const source of sources) {
      const summaries = new Map(
        this.#db.prepare(`
          SELECT section_key, summary FROM analysis_sections
          WHERE task_id = ? AND section_key IN (
            'industry_market_and_policy', 'industry_chain_position'
          )
        `).all(source.task_id).map((row) => {
          const section = row as { section_key: string; summary: string };
          return [section.section_key, section.summary] as const;
        }),
      );
      const industryMarketSummary = summaries.get('industry_market_and_policy') ?? '';
      const industryChainSummary = summaries.get('industry_chain_position') ?? '';
      const evidence = this.#db.prepare(`
        SELECT link.evidence_id
        FROM analysis_sections section
        JOIN analysis_section_evidence link ON link.section_id = section.section_id
        WHERE section.task_id = ? AND section.section_key IN (
          'industry_chain_position', 'industry_market_and_policy'
        )
        ORDER BY CASE section.section_key
          WHEN 'industry_chain_position' THEN 0 ELSE 1 END, link.evidence_id
        LIMIT 1
      `).get(source.task_id) as { evidence_id: string } | undefined;
      const targetIndustryId = this.#syncIndustrySkeleton({
        companyId: source.company_id,
        conversationId: source.conversation_id,
        documentId: source.document_id,
        industryMarketSummary,
        industryChainSummary,
        ...(evidence ? { evidenceId: evidence.evidence_id } : {}),
        now,
      });
      reclassifiedCompanies.add(source.company_id);
      const staleDrafts = (this.#db.prepare(`
        SELECT DISTINCT industry.industry_id, industry.name
        FROM industries industry
        LEFT JOIN industry_materials material
          ON material.industry_id = industry.industry_id
        LEFT JOIN company_industries placement
          ON placement.industry_id = industry.industry_id
        WHERE industry.status = 'draft'
          AND industry.industry_id != ?
          AND (material.document_id = ? OR placement.company_id = ?)
        ORDER BY industry.industry_id
      `).all(targetIndustryId, source.document_id, source.company_id) as unknown as Array<{
        industry_id: string;
        name: string;
      }>).filter((industry) => isLegacyGeneratedIndustryName(industry.name));
      for (const stale of staleDrafts) {
        const targets = draftTargets.get(stale.industry_id) ?? new Set<string>();
        targets.add(targetIndustryId);
        draftTargets.set(stale.industry_id, targets);
        if (this.#mergeDraftIndustry(
          stale.industry_id,
          targetIndustryId,
          {
            companyId: source.company_id,
            conversationId: source.conversation_id,
            documentId: source.document_id,
          },
          targets.size === 1,
          now,
        )) {
          mergedIndustries += 1;
        }
      }
    }
    const industryCount = this.#db.prepare(
      'SELECT COUNT(*) AS count FROM industries',
    ).get() as { count: number };
    const unclassified = this.#db.prepare(`
      SELECT COUNT(DISTINCT conversations.primary_document_id) AS total
      FROM conversations
      JOIN analysis_tasks ON analysis_tasks.conversation_id = conversations.conversation_id
      WHERE analysis_tasks.task_type = 'material_analysis'
        AND NOT EXISTS (
          SELECT 1 FROM industry_materials
          WHERE industry_materials.document_id = conversations.primary_document_id
        )
    `).get() as { total: number };
    return {
      companies: reclassifiedCompanies.size,
      industries: industryCount.count,
      mergedIndustries,
      unclassifiedMaterials: unclassified.total,
    };
  }

  #mergeDraftIndustry(
    sourceIndustryId: string,
    targetIndustryId: string,
    reference: { companyId: string; conversationId: string; documentId: string },
    allowResearchMerge: boolean,
    now: string,
  ): boolean {
    if (sourceIndustryId === targetIndustryId) return false;
    const source = this.#db.prepare(`
      SELECT summary, status, watched FROM industries WHERE industry_id = ?
    `).get(sourceIndustryId) as {
      summary: string;
      status: string;
      watched: number;
    } | undefined;
    const target = this.#db.prepare(`
      SELECT status FROM industries WHERE industry_id = ?
    `).get(targetIndustryId) as { status: string } | undefined;
    if (
      !source
      || !target
      || source.status !== 'draft'
      || target.status !== 'draft'
    ) return false;
    const sourcePlacement = this.#db.prepare(`
      SELECT position_label, status, evidence_id FROM company_industries
      WHERE company_id = ? AND industry_id = ?
    `).get(reference.companyId, sourceIndustryId) as {
      position_label: string;
      status: string;
      evidence_id: string | null;
    } | undefined;
    const targetPlacement = this.#db.prepare(`
      SELECT position_label, status, evidence_id FROM company_industries
      WHERE company_id = ? AND industry_id = ?
    `).get(reference.companyId, targetIndustryId) as {
      position_label: string;
      status: string;
      evidence_id: string | null;
    } | undefined;
    if (sourcePlacement && targetPlacement) {
      this.#db.prepare(`
        UPDATE company_industries SET
          position_label = CASE
            WHEN position_label = '产业链位置待确认' THEN ? ELSE position_label END,
          status = ?, evidence_id = COALESCE(evidence_id, ?), updated_at = ?
        WHERE company_id = ? AND industry_id = ?
      `).run(
        sourcePlacement.position_label,
        mergedPlacementStatus(targetPlacement.status, sourcePlacement.status),
        sourcePlacement.evidence_id,
        now,
        reference.companyId,
        targetIndustryId,
      );
    }
    this.#db.prepare(`
      DELETE FROM company_industries
      WHERE company_id = ? AND industry_id = ?
    `).run(reference.companyId, sourceIndustryId);
    this.#db.prepare(`
      UPDATE industry_materials SET evidence_id = COALESCE(
        evidence_id,
        (
          SELECT source.evidence_id FROM industry_materials source
          WHERE source.industry_id = ? AND source.conversation_id = ?
            AND source.document_id = ?
        )
      )
      WHERE industry_id = ? AND conversation_id = ? AND document_id = ?
    `).run(
      sourceIndustryId,
      reference.conversationId,
      reference.documentId,
      targetIndustryId,
      reference.conversationId,
      reference.documentId,
    );
    this.#db.prepare(`
      DELETE FROM industry_materials
      WHERE industry_id = ? AND conversation_id = ? AND document_id = ?
    `).run(
      sourceIndustryId,
      reference.conversationId,
      reference.documentId,
    );
    this.#db.prepare(`
      INSERT OR IGNORE INTO conversation_industries (
        conversation_id, industry_id, role, created_at
      )
      SELECT conversation_id, ?, role, created_at
      FROM conversation_industries
      WHERE conversation_id = ? AND industry_id = ?
    `).run(targetIndustryId, reference.conversationId, sourceIndustryId);
    this.#db.prepare(`
      DELETE FROM conversation_industries
      WHERE conversation_id = ? AND industry_id = ?
    `).run(reference.conversationId, sourceIndustryId);

    const remaining = this.#db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM company_industries WHERE industry_id = ?) AS placements,
        (SELECT COUNT(*) FROM industry_materials WHERE industry_id = ?) AS materials,
        (SELECT COUNT(*) FROM conversation_industries WHERE industry_id = ?) AS conversations,
        (SELECT COUNT(*) FROM industry_research_runs WHERE industry_id = ?) AS research_runs
    `).get(
      sourceIndustryId,
      sourceIndustryId,
      sourceIndustryId,
      sourceIndustryId,
    ) as {
      placements: number;
      materials: number;
      conversations: number;
      research_runs: number;
    };
    if (remaining.placements > 0 || remaining.materials > 0) return false;
    if (remaining.conversations > 0 || remaining.research_runs > 0) {
      if (!allowResearchMerge) return false;
      this.#db.prepare(`
        INSERT OR IGNORE INTO conversation_industries (
          conversation_id, industry_id, role, created_at
        )
        SELECT conversation_id, ?, role, created_at
        FROM conversation_industries WHERE industry_id = ?
      `).run(targetIndustryId, sourceIndustryId);
      this.#db.prepare('DELETE FROM conversation_industries WHERE industry_id = ?')
        .run(sourceIndustryId);
      this.#db.prepare(`
        UPDATE industry_research_runs SET industry_id = ?, updated_at = ?
        WHERE industry_id = ?
      `).run(targetIndustryId, now, sourceIndustryId);
    }
    this.#db.prepare('DELETE FROM industry_nodes WHERE industry_id = ?')
      .run(sourceIndustryId);
    this.#db.prepare(`
      UPDATE industries SET
        summary = CASE WHEN length(summary) < ? THEN ? ELSE summary END,
        watched = CASE WHEN watched = 1 OR ? = 1 THEN 1 ELSE 0 END,
        version = version + 1,
        updated_at = ?
      WHERE industry_id = ? AND status = 'draft'
    `).run(
      source.summary.length,
      source.summary,
      source.watched,
      now,
      targetIndustryId,
    );
    this.#db.prepare('DELETE FROM industries WHERE industry_id = ?')
      .run(sourceIndustryId);
    return true;
  }

  #companyListByConversation(conversationId: string): CompanyListRecord | undefined {
    const row = this.#db.prepare('SELECT list_id FROM company_lists WHERE conversation_id = ?').get(conversationId) as { list_id: string } | undefined;
    return row ? this.#companyListRecord(row.list_id) : undefined;
  }

  #companyListRecord(listId: string): CompanyListRecord {
    const list = this.#db.prepare(`
      SELECT list_id, conversation_id, document_id, status, created_at, updated_at
      FROM company_lists WHERE list_id = ?
    `).get(listId) as {
      list_id: string; conversation_id: string; document_id: string; status: string; created_at: string; updated_at: string;
    } | undefined;
    if (!list) throw new PlatformNotFoundError(`company list not found: ${listId}`);
    const rows = this.#db.prepare(`
      SELECT row_id, row_order, original_value, normalized_name, match_status, confirmation_status,
        option_ids_json, confirmed_company_id, evidence_id, error_code, version
      FROM company_list_rows WHERE list_id = ? ORDER BY row_order, row_id
    `).all(listId) as unknown as Array<{
      row_id: string; row_order: number; original_value: string; normalized_name: string | null;
      match_status: string; confirmation_status: string; option_ids_json: string;
      confirmed_company_id: string | null; evidence_id: string; error_code: string | null; version: number;
    }>;
    const research = this.#db.prepare(`
      SELECT requests.request_id, requests.company_id, requests.status, requests.conversation_id, requests.created_at
      FROM company_research_requests requests
      LEFT JOIN (
        SELECT confirmed_company_id AS company_id, MIN(row_order) AS first_row_order
        FROM company_list_rows
        WHERE list_id = ? AND confirmed_company_id IS NOT NULL
        GROUP BY confirmed_company_id
      ) list_order ON list_order.company_id = requests.company_id
      WHERE requests.list_id = ?
      ORDER BY list_order.first_row_order, requests.created_at, requests.request_id
    `).all(listId, listId) as unknown as Array<{
      request_id: string; company_id: string; status: string; conversation_id: string | null; created_at: string;
    }>;
    return {
      listId: list.list_id,
      conversationId: list.conversation_id,
      documentId: list.document_id,
      status: list.status as CompanyListRecord['status'],
      rows: rows.map((row) => {
        const evidence = this.#evidenceRecords('WHERE e.evidence_id = ?', row.evidence_id)[0];
        if (!evidence) throw new Error('company_list_evidence_missing');
        const optionIds = JSON.parse(row.option_ids_json) as string[];
        return {
          rowId: row.row_id,
          rowOrder: row.row_order,
          originalValue: row.original_value,
          ...(row.normalized_name ? { normalizedName: row.normalized_name } : {}),
          matchStatus: row.match_status as CompanyListRecord['rows'][number]['matchStatus'],
          confirmationStatus: row.confirmation_status as CompanyListRecord['rows'][number]['confirmationStatus'],
          options: optionIds.map((companyId) => this.#companyRecord(companyId)),
          ...(row.confirmed_company_id ? { company: this.#companyRecord(row.confirmed_company_id) } : {}),
          evidence,
          ...(row.error_code ? { errorCode: row.error_code } : {}),
          version: row.version,
        };
      }),
      researchRequests: research.map((request) => ({
        requestId: request.request_id,
        companyId: request.company_id,
        status: request.status as CompanyListRecord['researchRequests'][number]['status'],
        ...(request.conversation_id ? { conversationId: request.conversation_id } : {}),
        createdAt: request.created_at,
      })),
      createdAt: list.created_at,
      updatedAt: list.updated_at,
    };
  }

  #companyResearchByTask(taskId: string): CompanyResearchRecord | undefined {
    const run = this.#db.prepare(`
      SELECT run_id, company_id, intent, explicit_search, trigger_reason, public_query,
        summary, workflow_skill, workflow_context_json, created_at, updated_at
      FROM company_research_runs WHERE task_id = ?
    `).get(taskId) as {
      run_id: string; company_id: string | null; intent: string; explicit_search: number;
      trigger_reason: string | null; public_query: string | null; summary: string | null;
      workflow_skill: string | null; workflow_context_json: string | null;
      created_at: string; updated_at: string;
    } | undefined;
    if (!run) return undefined;
    return {
      runId: run.run_id,
      ...(run.company_id ? { companyId: run.company_id } : {}),
      intent: run.intent,
      explicitWebSearch: Boolean(run.explicit_search),
      ...(run.trigger_reason ? { triggerReason: run.trigger_reason as CompanyResearchRecord['triggerReason'] } : {}),
      ...(run.public_query ? { publicQuery: run.public_query } : {}),
      ...(run.summary ? { summary: run.summary } : {}),
      ...(run.workflow_skill
        ? { workflowSkill: run.workflow_skill as CompanyResearchWorkflowSkill }
        : {}),
      ...(run.workflow_context_json
        ? {
            workflowScope: (
              JSON.parse(run.workflow_context_json) as NonNullable<StartCompanyResearchInput['workflow']>
            ).scope,
          }
        : {}),
      sources: this.#researchSourceRows(run.run_id).map((source) => {
        const evidence = this.#evidenceRecords('WHERE e.evidence_id = ?', source.evidence_id)[0];
        if (!evidence) throw new Error('research_evidence_missing');
        return { ...evidence, accessStatus: source.access_status };
      }),
      createdAt: run.created_at,
      updatedAt: run.updated_at,
    };
  }

  #industryResearchByTask(taskId: string): IndustryResearchRecord | undefined {
    const run = this.#db.prepare(`
      SELECT run_id, industry_id, intent, explicit_search, trigger_reason,
        public_query, summary, created_at, updated_at
      FROM industry_research_runs
      WHERE task_id = ?
    `).get(taskId) as {
      run_id: string;
      industry_id: string;
      intent: string;
      explicit_search: number;
      trigger_reason: string | null;
      public_query: string | null;
      summary: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;
    if (!run) return undefined;
    return {
      runId: run.run_id,
      industryId: run.industry_id,
      intent: run.intent,
      explicitWebSearch: Boolean(run.explicit_search),
      triggerReason: run.trigger_reason === 'not_needed'
        ? 'not_needed'
        : 'user_requested',
      ...(run.public_query ? { publicQuery: run.public_query } : {}),
      ...(run.summary ? { summary: run.summary } : {}),
      sources: this.#industryResearchSourceRows(run.run_id).map((source) => {
        const evidence = this.#evidenceRecords(
          'WHERE e.evidence_id = ?',
          source.evidence_id,
        )[0];
        if (!evidence) throw new Error('industry_research_evidence_missing');
        return { ...evidence, accessStatus: source.access_status };
      }),
      createdAt: run.created_at,
      updatedAt: run.updated_at,
    };
  }

  #industryResearchSourceRows(runId: string): Array<{
    evidence_id: string;
    url: string;
    access_status: 'accessible' | 'metadata_only';
  }> {
    return this.#db.prepare(`
      SELECT w.evidence_id, e.url, w.access_status
      FROM industry_web_search_results w
      JOIN evidence e ON e.evidence_id = w.evidence_id
      WHERE w.run_id = ? AND e.url IS NOT NULL
      ORDER BY w.rank, w.result_id
    `).all(runId) as unknown as Array<{
      evidence_id: string;
      url: string;
      access_status: 'accessible' | 'metadata_only';
    }>;
  }

  #industryResearchWebResults(runId: string): WebSearchResultItem[] {
    const rows = this.#db.prepare(`
      SELECT e.title, e.url, e.site, e.quote, e.published_at,
        e.retrieved_at, w.access_status
      FROM industry_web_search_results w
      JOIN evidence e ON e.evidence_id = w.evidence_id
      WHERE w.run_id = ?
      ORDER BY w.rank, w.result_id
    `).all(runId) as unknown as Array<{
      title: string | null;
      url: string | null;
      site: string | null;
      quote: string;
      published_at: string | null;
      retrieved_at: string | null;
      access_status: string;
    }>;
    return rows.flatMap((row) => row.url && row.site ? [{
      title: row.title ?? row.site,
      url: row.url,
      site: row.site,
      highlights: row.access_status === 'accessible' ? [row.quote] : [],
      accessStatus: row.access_status as WebSearchResultItem['accessStatus'],
      ...(row.published_at ? { publishedAt: row.published_at } : {}),
      retrievedAt: row.retrieved_at ?? this.#now().toISOString(),
    }] : []);
  }

  #industryResearchMaterials(industryId: string): IndustryResearchMaterial[] {
    const rows = this.#db.prepare(`
      SELECT im.conversation_id, im.document_id, d.file_name
      FROM industry_materials im
      JOIN documents d ON d.document_id = im.document_id
      WHERE im.industry_id = ?
      ORDER BY im.created_at DESC, im.conversation_id DESC
    `).all(industryId) as unknown as Array<{
      conversation_id: string;
      document_id: string;
      file_name: string;
    }>;
    const materials: IndustryResearchMaterial[] = [];
    let characters = 0;
    const now = this.#now().toISOString();
    for (const row of rows) {
      for (const block of this.#loadParsedBlocks(row.document_id)) {
        if (materials.length >= 40 || characters >= 32_000) return materials;
        const excerpt = block.text.slice(0, Math.min(4_000, 32_000 - characters));
        if (!excerpt.trim()) continue;
        const evidenceId = this.#evidenceForBlock(row.document_id, block, now);
        this.#db.prepare(`
          UPDATE industry_materials
          SET evidence_id = ?
          WHERE industry_id = ? AND conversation_id = ? AND document_id = ?
            AND evidence_id IS NULL
        `).run(
          evidenceId,
          industryId,
          row.conversation_id,
          row.document_id,
        );
        materials.push({
          evidenceId,
          fileName: row.file_name,
          excerpt,
          ...(parsedBlockLocator(block) ? { locator: parsedBlockLocator(block) } : {}),
        });
        characters += excerpt.length;
      }
    }
    return materials;
  }

  #companyResearchWorkflowMaterials(
    companyId: string,
  ): CompanyResearchWorkflowContext['materials'] {
    const rows = this.#db.prepare(`
      SELECT c.conversation_id, d.document_id, d.file_name
      FROM conversation_companies link
      JOIN conversations c ON c.conversation_id = link.conversation_id
      JOIN documents d ON d.document_id = c.primary_document_id
      WHERE link.company_id = ?
        AND link.role = 'primary'
        AND c.conversation_type = 'material'
      ORDER BY c.updated_at DESC, c.conversation_id DESC
    `).all(companyId) as unknown as Array<{
      conversation_id: string;
      document_id: string;
      file_name: string;
    }>;
    const materials: CompanyResearchWorkflowContext['materials'] = [];
    let characters = 0;
    const now = this.#now().toISOString();
    for (const row of rows) {
      for (const block of this.#loadParsedBlocks(row.document_id)) {
        if (materials.length >= MAX_AI_BLOCKS || characters >= MAX_AI_TOTAL_CHARACTERS) {
          return materials;
        }
        const excerpt = block.text.slice(
          0,
          Math.min(MAX_AI_BLOCK_CHARACTERS, MAX_AI_TOTAL_CHARACTERS - characters),
        );
        if (!excerpt.trim()) continue;
        const sourceId = this.#evidenceForBlock(row.document_id, block, now);
        materials.push({
          sourceId,
          title: row.file_name,
          excerpt,
          ...(parsedBlockLocator(block) ? { locator: parsedBlockLocator(block) } : {}),
          evidenceState: 'user-provided',
        });
        characters += excerpt.length;
      }
    }
    return materials;
  }

  #companyResearchWorkflowMaterialsForSourceIds(
    companyId: string,
    sourceIds: readonly string[],
  ): CompanyResearchWorkflowContext['materials'] {
    if (sourceIds.length === 0 || sourceIds.length > MAX_AI_BLOCKS) {
      throw new PlatformInputError(
        'workflow_material_scope_invalid',
        '已审批的材料来源范围为空或超过单次分析上限',
      );
    }
    const placeholders = sourceIds.map(() => '?').join(', ');
    const rows = this.#db.prepare(`
      SELECT DISTINCT
        e.evidence_id, e.quote, d.file_name,
        pb.page, pb.paragraph, pb.heading_path_json,
        pb.sheet, pb.row_number, pb.cell_range
      FROM evidence e
      JOIN parsed_blocks pb ON pb.block_id = e.block_id
      JOIN documents d ON d.document_id = e.document_id
      JOIN conversations c ON c.primary_document_id = d.document_id
      JOIN conversation_companies link ON link.conversation_id = c.conversation_id
      WHERE link.company_id = ?
        AND link.role = 'primary'
        AND c.conversation_type = 'material'
        AND e.source_type = 'material'
        AND e.evidence_id IN (${placeholders})
    `).all(companyId, ...sourceIds) as unknown as Array<{
      evidence_id: string;
      quote: string;
      file_name: string;
      page: number | null;
      paragraph: number | null;
      heading_path_json: string | null;
      sheet: string | null;
      row_number: number | null;
      cell_range: string | null;
    }>;
    const byId = new Map(rows.map((row) => [row.evidence_id, row]));
    const missingSourceId = sourceIds.find((sourceId) => !byId.has(sourceId));
    if (missingSourceId) {
      throw new PlatformInputError(
        'workflow_material_scope_invalid',
        `材料来源不属于当前公司或已不可用：${missingSourceId}`,
      );
    }
    let characters = 0;
    return sourceIds.map((sourceId) => {
      const row = byId.get(sourceId);
      if (!row) throw new Error('workflow_material_scope_missing');
      const remaining = MAX_AI_TOTAL_CHARACTERS - characters;
      if (remaining <= 0) {
        throw new PlatformInputError(
          'workflow_material_scope_invalid',
          '已审批的材料来源超过单次分析字符上限',
        );
      }
      const excerpt = row.quote.slice(
        0,
        Math.min(MAX_AI_BLOCK_CHARACTERS, remaining),
      );
      if (!excerpt.trim()) {
        throw new PlatformInputError(
          'workflow_material_scope_invalid',
          `材料来源没有可用文本：${sourceId}`,
        );
      }
      characters += excerpt.length;
      const locator = parsedBlockLocator({
        blockId: sourceId,
        kind: 'paragraph',
        text: row.quote,
        ...(row.page !== null ? { page: row.page } : {}),
        ...(row.paragraph !== null ? { paragraph: row.paragraph } : {}),
        ...(row.heading_path_json
          ? { headingPath: JSON.parse(row.heading_path_json) as string[] }
          : {}),
        ...(row.sheet ? { sheet: row.sheet } : {}),
        ...(row.row_number !== null ? { row: row.row_number } : {}),
        ...(row.cell_range ? { cellRange: row.cell_range } : {}),
      });
      return {
        sourceId,
        title: row.file_name,
        excerpt,
        ...(locator ? { locator } : {}),
        evidenceState: 'user-provided' as const,
      };
    });
  }

  #researchSourceRows(runId: string): Array<{ evidence_id: string; url: string; access_status: 'accessible' | 'metadata_only' }> {
    return this.#db.prepare(`
      SELECT w.evidence_id, e.url, w.access_status
      FROM web_search_results w JOIN evidence e ON e.evidence_id = w.evidence_id
      WHERE w.run_id = ? AND e.url IS NOT NULL ORDER BY w.rank, w.result_id
    `).all(runId) as unknown as Array<{ evidence_id: string; url: string; access_status: 'accessible' | 'metadata_only' }>;
  }

  #researchWebResults(runId: string): WebSearchResultItem[] {
    const rows = this.#db.prepare(`
      SELECT e.title, e.url, e.site, e.quote, e.published_at, e.retrieved_at, w.access_status
      FROM web_search_results w JOIN evidence e ON e.evidence_id = w.evidence_id
      WHERE w.run_id = ? ORDER BY w.rank, w.result_id
    `).all(runId) as unknown as Array<{
      title: string | null; url: string | null; site: string | null; quote: string;
      published_at: string | null; retrieved_at: string | null; access_status: string;
    }>;
    return rows.flatMap((row) => row.url && row.site ? [{
      title: row.title ?? row.site,
      url: row.url,
      site: row.site,
      highlights: row.access_status === 'accessible' ? [row.quote] : [],
      accessStatus: row.access_status as WebSearchResultItem['accessStatus'],
      ...(row.published_at ? { publishedAt: row.published_at } : {}),
      retrievedAt: row.retrieved_at ?? this.#now().toISOString(),
    }] : []);
  }

  #companyMatchCase(conversationId: string): CompanyMatchCase | undefined {
    const row = this.#db.prepare(`
      SELECT case_id, proposed_name, status, option_ids_json, version
      FROM company_match_cases WHERE conversation_id = ?
    `).get(conversationId) as {
      case_id: string; proposed_name: string | null; status: string; option_ids_json: string; version: number;
    } | undefined;
    if (!row) return undefined;
    const optionIds = JSON.parse(row.option_ids_json) as string[];
    return {
      caseId: row.case_id,
      ...(row.proposed_name ? { proposedName: row.proposed_name } : {}),
      status: row.status as CompanyMatchCase['status'],
      options: optionIds.map((id) => this.#companyRecord(id)),
      version: row.version,
    };
  }

  #conversationReuseSuggestion(conversationId: string): ConversationDetail['conversationReuse'] {
    const row = this.#db.prepare(`
      SELECT suggestion.suggestion_id, suggestion.status, suggestion.score, suggestion.reason, suggestion.version,
        target.conversation_id AS target_conversation_id, target.title AS target_title,
        document.file_name AS target_file_name, company.canonical_name AS target_company_name
      FROM conversation_reuse_suggestions suggestion
      JOIN conversations target ON target.conversation_id = suggestion.target_conversation_id
      JOIN documents document ON document.document_id = target.primary_document_id
      LEFT JOIN conversation_companies link ON link.conversation_id = target.conversation_id AND link.role = 'primary'
      LEFT JOIN companies company ON company.company_id = link.company_id
      WHERE suggestion.conversation_id = ?
    `).get(conversationId) as {
      suggestion_id: string; status: string; score: number; reason: string; version: number;
      target_conversation_id: string; target_title: string; target_file_name: string; target_company_name: string | null;
    } | undefined;
    if (!row) return undefined;
    return {
      suggestionId: row.suggestion_id,
      status: row.status as NonNullable<ConversationDetail['conversationReuse']>['status'],
      score: row.score,
      reason: row.reason,
      version: row.version,
      target: {
        conversationId: row.target_conversation_id,
        title: row.target_title,
        fileName: row.target_file_name,
        ...(row.target_company_name ? { companyName: row.target_company_name } : {}),
      },
    };
  }

  #threadMaterials(threadId: string): CompanyMaterialRecord[] {
    const rows = this.#db.prepare(`
      SELECT c.conversation_id, d.document_id, d.file_name, d.material_type,
        c.status, c.source_channel, c.updated_at
      FROM conversations c JOIN documents d ON d.document_id = c.primary_document_id
      WHERE c.thread_id = ? AND c.conversation_type = 'material'
      ORDER BY c.created_at, c.conversation_id
    `).all(threadId) as unknown as Array<{
      conversation_id: string; document_id: string; file_name: string; material_type: string | null;
      status: string; source_channel: string; updated_at: string;
    }>;
    return rows.map((row) => ({
      conversationId: row.conversation_id,
      documentId: row.document_id,
      fileName: row.file_name,
      ...(row.material_type ? { materialType: row.material_type } : {}),
      status: row.status as ConversationStatus,
      sourceChannel: row.source_channel as SourceChannel,
      updatedAt: row.updated_at,
    }));
  }

  #candidateRecords(where = '', value?: string): KnowledgeCandidateRecord[] {
    const statement = this.#db.prepare(`
      SELECT
        kc.candidate_id, kc.company_id, kc.section_key, kc.knowledge_type,
        kc.statement, kc.value, kc.effective_at, kc.status, kc.version,
        kc.high_impact, kc.sensitive, kc.created_at, kc.updated_at
      FROM knowledge_candidates kc
      ${where}
      ORDER BY kc.updated_at DESC, kc.candidate_id DESC
    `);
    const rows = (value === undefined ? statement.all() : statement.all(value)) as unknown as Array<{
      candidate_id: string; company_id: string; section_key: string; knowledge_type: string;
      statement: string; value: string | null; effective_at: string | null; status: string; version: number;
      high_impact: number; sensitive: number; created_at: string; updated_at: string;
    }>;
    return rows.map((row) => ({
      candidateId: row.candidate_id,
      companyId: row.company_id,
      sectionKey: row.section_key,
      knowledgeType: row.knowledge_type,
      statement: row.statement,
      ...(row.value ? { value: row.value } : {}),
      ...(row.effective_at ? { effectiveAt: row.effective_at } : {}),
      status: row.status as KnowledgeCandidateRecord['status'],
      version: row.version,
      highImpact: Boolean(row.high_impact),
      sensitive: Boolean(row.sensitive),
      evidence: this.#evidenceRecords(`
        WHERE e.evidence_id IN (SELECT evidence_id FROM candidate_evidence WHERE candidate_id = ? AND status = 'supporting')
      `, row.candidate_id),
      unsupportedEvidence: this.#evidenceRecords(`
        WHERE e.evidence_id IN (SELECT evidence_id FROM candidate_evidence WHERE candidate_id = ? AND status = 'unsupported')
      `, row.candidate_id),
      ...(row.status === 'conflicted' ? {
        conflictingKnowledge: this.#knowledgeRecords(row.company_id).filter((knowledge) => (
          knowledge.knowledgeType === row.knowledge_type && (knowledge.status === 'current' || knowledge.status === 'disputed')
        )),
      } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  #analysisSections(taskId: string): AnalysisSectionRecord[] {
    const rows = this.#db.prepare(`
      SELECT section_id, section_key, summary FROM analysis_sections WHERE task_id = ?
      ORDER BY CASE section_key
        WHEN 'company_and_project_stage' THEN 1 WHEN 'founders_team_and_governance' THEN 2
        WHEN 'product_portfolio' THEN 3 WHEN 'core_technology_and_ip' THEN 4
        WHEN 'technology_readiness_and_production' THEN 5 WHEN 'industry_market_and_policy' THEN 6
        WHEN 'industry_chain_position' THEN 7 WHEN 'customers_orders_and_scenarios' THEN 8
        WHEN 'supply_chain_and_partners' THEN 9 WHEN 'business_model_and_competition' THEN 10
        WHEN 'financing_valuation_equity_and_use' THEN 11 WHEN 'financial_operations_plans_risks' THEN 12
        WHEN 'provenance_versions_conflicts_confirmations' THEN 13 ELSE 99 END
    `).all(taskId) as unknown as Array<{ section_id: string; section_key: string; summary: string }>;
    return rows.map((row) => ({
      key: row.section_key,
      title: row.section_key === 'company_research'
        ? '公司研究结论'
        : BP_SECTION_TITLES[row.section_key as keyof typeof BP_SECTION_TITLES] ?? row.section_key,
      summary: row.summary,
      evidence: this.#evidenceRecords(`
        WHERE e.evidence_id IN (SELECT evidence_id FROM analysis_section_evidence WHERE section_id = ?)
      `, row.section_id),
    }));
  }

  #knowledgeRecords(companyId: string): KnowledgeRecord[] {
    const rows = this.#db.prepare(`
      SELECT knowledge_id, company_id, knowledge_type, statement, value, effective_at,
        status, version, supersedes_id, source_candidate_id, created_at
      FROM knowledge WHERE company_id = ? ORDER BY knowledge_type, version DESC, created_at DESC
    `).all(companyId) as unknown as Array<{
      knowledge_id: string; company_id: string; knowledge_type: string; statement: string;
      value: string | null; effective_at: string | null; status: string; version: number;
      supersedes_id: string | null; source_candidate_id: string; created_at: string;
    }>;
    return rows.map((row) => ({
      knowledgeId: row.knowledge_id,
      companyId: row.company_id,
      knowledgeType: row.knowledge_type,
      statement: row.statement,
      ...(row.value ? { value: row.value } : {}),
      ...(row.effective_at ? { effectiveAt: row.effective_at } : {}),
      status: row.status as KnowledgeRecord['status'],
      version: row.version,
      ...(row.supersedes_id ? { supersedesId: row.supersedes_id } : {}),
      sourceCandidateId: row.source_candidate_id,
      evidence: this.#evidenceRecords(`
        WHERE e.evidence_id IN (SELECT evidence_id FROM knowledge_evidence WHERE knowledge_id = ?)
      `, row.knowledge_id),
      createdAt: row.created_at,
    }));
  }

  #evidenceRecords(where: string, value: string): EvidenceRecord[] {
    const rows = this.#db.prepare(`
      SELECT
        e.evidence_id, e.source_type, e.document_id, e.block_id, e.quote,
        e.title, e.site, e.url, e.published_at, e.retrieved_at,
        d.file_name,
        pb.page, pb.paragraph, pb.heading_path_json, pb.sheet, pb.row_number, pb.cell_range
      FROM evidence e LEFT JOIN parsed_blocks pb ON pb.block_id = e.block_id
      LEFT JOIN documents d ON d.document_id = e.document_id
      ${where}
      ORDER BY e.created_at, e.evidence_id
    `).all(value) as unknown as Array<{
      evidence_id: string; source_type: string; document_id: string | null; block_id: string | null; quote: string;
      title: string | null; site: string | null; url: string | null; published_at: string | null; retrieved_at: string | null;
      file_name: string | null;
      page: number | null; paragraph: number | null; heading_path_json: string | null;
      sheet: string | null; row_number: number | null; cell_range: string | null;
    }>;
    return rows.map((row) => ({
      evidenceId: row.evidence_id,
      sourceType: row.source_type as EvidenceRecord['sourceType'],
      quote: row.quote,
      ...(row.file_name ? { fileName: row.file_name } : {}),
      ...(row.document_id ? { documentId: row.document_id } : {}),
      ...(row.block_id ? { blockId: row.block_id } : {}),
      ...(row.page !== null ? { page: row.page } : {}),
      ...(row.paragraph !== null ? { paragraph: row.paragraph } : {}),
      ...(row.heading_path_json ? { headingPath: JSON.parse(row.heading_path_json) as string[] } : {}),
      ...(row.sheet ? { sheet: row.sheet } : {}),
      ...(row.row_number !== null ? { row: row.row_number } : {}),
      ...(row.cell_range ? { cellRange: row.cell_range } : {}),
      ...(row.title ? { title: row.title } : {}),
      ...(row.site ? { site: row.site } : {}),
      ...(row.url ? { url: row.url } : {}),
      ...(row.published_at ? { publishedAt: row.published_at } : {}),
      ...(row.retrieved_at ? { retrievedAt: row.retrieved_at } : {}),
    }));
  }

  #evidenceForBlock(documentId: string, block: ParsedBlock, now: string): string {
    const existing = this.#db.prepare(`
      SELECT evidence_id FROM evidence WHERE document_id = ? AND block_id = ? AND quote = ?
    `).get(documentId, block.blockId, block.text) as { evidence_id: string } | undefined;
    if (existing) return existing.evidence_id;
    const evidenceId = this.#nextId();
    this.#db.prepare(`
      INSERT INTO evidence (evidence_id, source_type, document_id, block_id, quote, created_at)
      VALUES (?, 'material', ?, ?, ?, ?)
    `).run(evidenceId, documentId, block.blockId, block.text, now);
    return evidenceId;
  }

  #semanticCorpus(): SemanticCorpusSnapshot {
    const items: SemanticCorpusItem[] = [];
    const evidence = new Map<string, EvidenceRecord>();
    const materials = new Map<string, CompanyMaterialRecord>();
    const materialEvidence = new Map<string, EvidenceRecord[]>();
    const conversations = this.#conversationRows();
    const seenMaterials = new Set<string>();

    for (const row of conversations) {
      if (row.conversation_type !== 'material') continue;
      const key = `material:${row.conversation_id}:${row.document_id}`;
      if (seenMaterials.has(key)) continue;
      seenMaterials.add(key);
      const blocks = this.#loadParsedBlocks(row.document_id);
      const citations = blocks.slice(0, 80).map((block) => searchEvidence(row.document_id, row.file_name, block));
      citations.forEach((item) => evidence.set(item.evidenceId, item));
      materialEvidence.set(row.document_id, citations);
      const material: CompanyMaterialRecord = {
        conversationId: row.conversation_id,
        documentId: row.document_id,
        fileName: row.file_name,
        ...(row.material_type ? { materialType: row.material_type } : {}),
        status: row.conversation_status as ConversationStatus,
        sourceChannel: row.source_channel as SourceChannel,
        updatedAt: row.conversation_updated_at,
      };
      materials.set(key, material);
      items.push({
        id: key,
        type: 'material',
        title: row.file_name,
        content: semanticText([row.file_name, row.material_type ?? '', ...blocks.map((block) => block.text)]),
        evidence: citations.map(({ evidenceId, quote }) => ({ evidenceId, quote })),
      });
    }

    const companyRows = this.#db.prepare("SELECT company_id FROM companies WHERE status != 'merged' ORDER BY updated_at DESC")
      .all() as unknown as Array<{ company_id: string }>;
    for (const row of companyRows) {
      const company = this.#companyCardRecord(row.company_id);
      const formalKnowledge = this.#knowledgeRecords(row.company_id).filter((item) => item.status === 'current');
      const citations = uniqueEvidence([
        ...formalKnowledge.flatMap((item) => item.evidence),
        ...this.#companyMaterials(row.company_id).flatMap((material) => materialEvidence.get(material.documentId)?.slice(0, 1) ?? []),
      ]);
      citations.forEach((item) => evidence.set(item.evidenceId, item));
      items.push({
        id: `company:${row.company_id}`,
        type: 'company',
        title: company.canonicalName,
        content: semanticText([
          company.canonicalName,
          ...company.aliases.map((alias) => alias.alias),
          ...Object.values(company.profile).flatMap((value) => typeof value === 'object' && value && 'value' in value && typeof value.value === 'string' ? [value.value] : []),
          ...formalKnowledge.map((item) => `${item.knowledgeType} ${item.statement} ${item.value ?? ''}`),
        ]),
        evidence: citations.map(({ evidenceId, quote }) => ({ evidenceId, quote })),
      });
    }

    const seenConversations = new Set<string>();
    for (const row of conversations) {
      if (seenConversations.has(row.conversation_id)) continue;
      seenConversations.add(row.conversation_id);
      const sections = this.#analysisSections(row.task_id);
      const companyResearch = this.#companyResearchByTask(row.task_id);
      const industryResearch = this.#industryResearchByTask(row.task_id);
      const citations = uniqueEvidence([
        ...sections.flatMap((section) => section.evidence),
        ...(materialEvidence.get(row.document_id)?.slice(0, 1) ?? []),
        ...(companyResearch?.sources ?? []),
        ...(industryResearch?.sources ?? []),
      ]);
      citations.forEach((item) => evidence.set(item.evidenceId, item));
      items.push({
        id: `conversation:${row.conversation_id}`,
        type: 'conversation',
        title: row.title,
        content: semanticText([
          row.title,
          row.file_name,
          row.material_type ?? '',
          ...sections.map((section) => `${section.title} ${section.summary}`),
          companyResearch?.intent ?? '',
          companyResearch?.summary ?? '',
          ...(companyResearch?.sources ?? []).map((source) => semanticText([
            source.title ?? '', source.site ?? '', source.quote, source.url ?? '',
          ])),
          industryResearch?.intent ?? '',
          industryResearch?.summary ?? '',
          ...(industryResearch?.sources ?? []).map((source) => semanticText([
            source.title ?? '', source.site ?? '', source.quote, source.url ?? '',
          ])),
        ]),
        evidence: citations.map(({ evidenceId, quote }) => ({ evidenceId, quote })),
      });
    }

    const industryRows = this.#db.prepare('SELECT industry_id FROM industries ORDER BY updated_at DESC')
      .all() as unknown as Array<{ industry_id: string }>;
    for (const row of industryRows) {
      const industry = this.#industryRecord(row.industry_id);
      const nodes = this.#db.prepare(`
        SELECT stage, name, description FROM industry_nodes WHERE industry_id = ? ORDER BY node_order
      `).all(row.industry_id) as unknown as Array<{ stage: string; name: string; description: string | null }>;
      const placementRows = this.#db.prepare(`
        SELECT company_id, position_label, status, evidence_id FROM company_industries WHERE industry_id = ?
      `).all(row.industry_id) as unknown as Array<{
        company_id: string; position_label: string; status: string; evidence_id: string | null;
      }>;
      const materialEvidenceRows = this.#db.prepare(`
        SELECT evidence_id FROM industry_materials WHERE industry_id = ? AND evidence_id IS NOT NULL
      `).all(row.industry_id) as unknown as Array<{ evidence_id: string }>;
      const citations = uniqueEvidence([
        ...materialEvidenceRows.map((item) => this.#evidenceById(item.evidence_id)),
        ...placementRows.flatMap((item) => item.evidence_id ? [this.#evidenceById(item.evidence_id)] : []),
      ]);
      citations.forEach((item) => evidence.set(item.evidenceId, item));
      items.push({
        id: `industry:${row.industry_id}`,
        type: 'industry',
        title: industry.name,
        content: semanticText([
          industry.name,
          industry.summary,
          ...nodes.map((node) => `${node.stage} ${node.name} ${node.description ?? ''}`),
          ...placementRows.filter((item) => item.status === 'confirmed').map((item) => `${this.#companyRecord(item.company_id).canonicalName} ${item.position_label}`),
        ]),
        evidence: citations.map(({ evidenceId, quote }) => ({ evidenceId, quote })),
      });
    }

    return { items, evidence, materials };
  }

  #completeStep(step: ClaimedStep, outcome: StepOutcome): void {
    const now = this.#now().toISOString();
    this.#transaction(() => {
      if (outcome === 'pending_confirmation' || outcome === 'waiting_confirmation') {
        this.#db.prepare(`
          UPDATE task_steps SET status = 'pending_confirmation', finished_at = ?, lease_until = NULL, error_code = NULL
          WHERE step_id = ? AND status = 'running'
        `).run(now, step.stepId);
        const task = this.#db.prepare('SELECT conversation_id FROM analysis_tasks WHERE task_id = ?').get(step.taskId) as { conversation_id: string };
        const status = outcome === 'waiting_confirmation' ? 'waiting' : 'pending_confirmation';
        this.#db.prepare('UPDATE analysis_tasks SET status = ?, current_step = ?, updated_at = ? WHERE task_id = ?')
          .run(status, step.name, now, step.taskId);
        this.#db.prepare('UPDATE conversations SET status = ?, updated_at = ? WHERE conversation_id = ?')
          .run(status, now, task.conversation_id);
        return;
      }
      this.#db.prepare(`
        UPDATE task_steps SET status = ?, finished_at = ?, lease_until = NULL, error_code = NULL
        WHERE step_id = ? AND status = 'running'
      `).run(outcome, now, step.stepId);
      const current = this.#db.prepare('SELECT position FROM task_steps WHERE step_id = ?').get(step.stepId) as { position: number };
      const next = this.#db.prepare(`
        SELECT step_id, step_name FROM task_steps WHERE task_id = ? AND position > ? ORDER BY position LIMIT 1
      `).get(step.taskId, current.position) as { step_id: string; step_name: string } | undefined;
      const task = this.#db.prepare('SELECT conversation_id FROM analysis_tasks WHERE task_id = ?').get(step.taskId) as { conversation_id: string };
      if (next) {
        this.#db.prepare("UPDATE task_steps SET status = 'queued' WHERE step_id = ? AND status = 'blocked'").run(next.step_id);
        this.#db.prepare("UPDATE analysis_tasks SET status = 'waiting', current_step = ?, updated_at = ? WHERE task_id = ?")
          .run(next.step_name, now, step.taskId);
        this.#db.prepare("UPDATE conversations SET status = 'waiting', updated_at = ? WHERE conversation_id = ?")
          .run(now, task.conversation_id);
      } else {
        this.#db.prepare("UPDATE analysis_tasks SET status = 'completed', updated_at = ? WHERE task_id = ?").run(now, step.taskId);
        this.#db.prepare("UPDATE conversations SET status = 'completed', updated_at = ? WHERE conversation_id = ?")
          .run(now, task.conversation_id);
      }
    });
  }

  #failStep(step: ClaimedStep, errorCode: string): void {
    const now = this.#now().toISOString();
    this.#transaction(() => {
      this.#db.prepare(`
        UPDATE task_steps SET status = 'failed', finished_at = ?, lease_until = NULL, error_code = ? WHERE step_id = ?
      `).run(now, errorCode, step.stepId);
      const task = this.#db.prepare('SELECT conversation_id FROM analysis_tasks WHERE task_id = ?').get(step.taskId) as { conversation_id: string };
      this.#db.prepare("UPDATE analysis_tasks SET status = 'failed', updated_at = ? WHERE task_id = ?").run(now, step.taskId);
      this.#db.prepare("UPDATE conversations SET status = 'failed', updated_at = ? WHERE conversation_id = ?")
        .run(now, task.conversation_id);
      if (step.name === 'parse_document') {
        this.#db.prepare(`
          UPDATE documents SET parse_status = 'failed'
          WHERE document_id = (SELECT primary_document_id FROM conversations WHERE conversation_id = ?)
        `).run(task.conversation_id);
      }
    });
  }

  #resolveStoragePath(storagePath: string): string {
    const path = resolve(this.#dataRoot, storagePath);
    const rel = relative(this.#dataRoot, path);
    if (!rel || rel.startsWith('..')) throw new Error('storage_path_invalid');
    return path;
  }

  #transaction<T>(run: () => T): T {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const value = run();
      this.#db.exec('COMMIT');
      return value;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  #audit(
    action: string,
    entityType: string,
    entityId: string,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
    createdAt = this.#now().toISOString(),
  ): void {
    this.#db.prepare(`
      INSERT INTO audit_records (audit_id, action, entity_type, entity_id, before_json, after_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.#nextId(), action, entityType, entityId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      createdAt,
    );
  }

  #exclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = this.#finalizeQueue.then(run, run);
    this.#finalizeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  #assertManagedDirectory(path: string): void {
    const info = lstatSync(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('platform data directory is unsafe');
    const real = realpathSync(path);
    const rel = relative(this.#dataRoot, real);
    if (rel.startsWith('..')) throw new Error('platform data directory escapes root');
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error('platform module is closed');
  }

  #migrate(): void {
    this.#db.exec('PRAGMA foreign_keys = ON');
    this.#db.exec('PRAGMA journal_mode = WAL');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS documents (
        document_id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        mime_type TEXT,
        bytes INTEGER NOT NULL CHECK (bytes > 0),
        sha256 TEXT NOT NULL UNIQUE,
        storage_path TEXT NOT NULL,
        parse_status TEXT NOT NULL,
        archive_status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS receipt_events (
        receipt_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(document_id),
        source_channel TEXT NOT NULL,
        sender_id TEXT,
        source_message_id TEXT,
        received_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        conversation_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        conversation_type TEXT NOT NULL,
        primary_document_id TEXT NOT NULL REFERENCES documents(document_id),
        source_channel TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversation_documents (
        conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
        document_id TEXT NOT NULL REFERENCES documents(document_id),
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (conversation_id, document_id)
      );

      CREATE TABLE IF NOT EXISTS analysis_tasks (
        task_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
        task_type TEXT NOT NULL,
        status TEXT NOT NULL,
        current_step TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_steps (
        step_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES analysis_tasks(task_id),
        step_name TEXT NOT NULL,
        position INTEGER NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        lease_until TEXT,
        started_at TEXT,
        finished_at TEXT,
        error_code TEXT,
        UNIQUE (task_id, step_name),
        UNIQUE (task_id, position)
      );

      CREATE INDEX IF NOT EXISTS receipt_events_document_idx ON receipt_events(document_id, received_at);
      CREATE INDEX IF NOT EXISTS conversations_updated_idx ON conversations(updated_at DESC);
      CREATE INDEX IF NOT EXISTS task_steps_status_idx ON task_steps(status, position);
    `);
    this.#db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?)')
      .run(this.#now().toISOString());
    this.#migrateKnowledgeSchema();
    this.#migrateCompanyListSchema();
    this.#migrateCompanyResearchSchema();
    this.#migrateIndustrySchema();
    this.#migrateConversationThreadSchema();
    this.#migrateOrganizationEvidenceSchema();
    this.#migrateEvidenceReviewSchema();
    this.#migrateAuditSchema();
    this.#migrateCompanyWatchSchema();
    this.#migrateAnalysisRuntimeSchema();
    this.#migrateIntakeIdempotencySchema();
    this.#migrateInteractionSchema();
    this.#migrateResearchProductSchema();
    this.#migrateSchemaReconciliation();
    this.#migrateIntakeAttachmentIdempotencySchema();
    this.#migrateCompanyIndustryNormalizationSchema();
    this.#migrateSubjectIdentitySchema();
    this.#migrateCompanyQuickCardSchema();
  }

  #migrateKnowledgeSchema(): void {
    const applied = this.#db.prepare('SELECT 1 AS applied FROM schema_migrations WHERE version = 2').get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec(`
        ALTER TABLE documents ADD COLUMN material_type TEXT;
        ALTER TABLE analysis_tasks ADD COLUMN provider_id TEXT;
        ALTER TABLE analysis_tasks ADD COLUMN model_id TEXT;
        ALTER TABLE analysis_tasks ADD COLUMN session_id TEXT;
        ALTER TABLE analysis_tasks ADD COLUMN result_status TEXT;

        CREATE TABLE companies (
          company_id TEXT PRIMARY KEY,
          canonical_name TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE company_aliases (
          alias_id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL REFERENCES companies(company_id),
          alias TEXT NOT NULL,
          alias_type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (company_id, alias, alias_type)
        );

        CREATE TABLE company_relations (
          relation_id TEXT PRIMARY KEY,
          from_company_id TEXT NOT NULL REFERENCES companies(company_id),
          to_company_id TEXT NOT NULL REFERENCES companies(company_id),
          relation_type TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (from_company_id, to_company_id, relation_type)
        );

        CREATE TABLE conversation_companies (
          conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
          company_id TEXT NOT NULL REFERENCES companies(company_id),
          role TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (conversation_id, company_id, role)
        );

        CREATE TABLE company_match_cases (
          case_id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL UNIQUE REFERENCES conversations(conversation_id),
          proposed_name TEXT,
          status TEXT NOT NULL,
          option_ids_json TEXT NOT NULL,
          resolved_company_id TEXT REFERENCES companies(company_id),
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE parsed_blocks (
          block_id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES documents(document_id),
          block_order INTEGER NOT NULL,
          kind TEXT NOT NULL,
          text TEXT NOT NULL,
          page INTEGER,
          paragraph INTEGER,
          heading_path_json TEXT,
          sheet TEXT,
          row_number INTEGER,
          cell_range TEXT,
          UNIQUE (document_id, block_order),
          UNIQUE (document_id, block_id)
        );

        CREATE TABLE analysis_runs (
          run_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL UNIQUE REFERENCES analysis_tasks(task_id),
          raw_text TEXT NOT NULL,
          candidate_drafts_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE analysis_sections (
          section_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES analysis_tasks(task_id),
          section_key TEXT NOT NULL,
          summary TEXT NOT NULL,
          block_ids_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (task_id, section_key)
        );

        CREATE TABLE analysis_section_evidence (
          section_id TEXT NOT NULL REFERENCES analysis_sections(section_id),
          evidence_id TEXT NOT NULL REFERENCES evidence(evidence_id),
          PRIMARY KEY (section_id, evidence_id)
        );

        CREATE TABLE evidence (
          evidence_id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL,
          document_id TEXT REFERENCES documents(document_id),
          block_id TEXT REFERENCES parsed_blocks(block_id),
          quote TEXT NOT NULL,
          title TEXT,
          site TEXT,
          url TEXT,
          published_at TEXT,
          retrieved_at TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (document_id, block_id, quote)
        );

        CREATE TABLE knowledge_candidates (
          candidate_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES analysis_tasks(task_id),
          company_id TEXT NOT NULL REFERENCES companies(company_id),
          section_key TEXT NOT NULL,
          knowledge_type TEXT NOT NULL,
          statement TEXT NOT NULL,
          value TEXT,
          effective_at TEXT,
          status TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          high_impact INTEGER NOT NULL,
          sensitive INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE candidate_evidence (
          candidate_id TEXT NOT NULL REFERENCES knowledge_candidates(candidate_id),
          evidence_id TEXT NOT NULL REFERENCES evidence(evidence_id),
          PRIMARY KEY (candidate_id, evidence_id)
        );

        CREATE TABLE knowledge (
          knowledge_id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL REFERENCES companies(company_id),
          knowledge_type TEXT NOT NULL,
          statement TEXT NOT NULL,
          value TEXT,
          effective_at TEXT,
          status TEXT NOT NULL,
          version INTEGER NOT NULL,
          supersedes_id TEXT REFERENCES knowledge(knowledge_id),
          source_candidate_id TEXT NOT NULL REFERENCES knowledge_candidates(candidate_id),
          created_at TEXT NOT NULL
        );

        CREATE TABLE knowledge_evidence (
          knowledge_id TEXT NOT NULL REFERENCES knowledge(knowledge_id),
          evidence_id TEXT NOT NULL REFERENCES evidence(evidence_id),
          PRIMARY KEY (knowledge_id, evidence_id)
        );

        CREATE TABLE confirmation_records (
          confirmation_id TEXT PRIMARY KEY,
          candidate_id TEXT NOT NULL REFERENCES knowledge_candidates(candidate_id),
          action TEXT NOT NULL,
          before_json TEXT NOT NULL,
          after_json TEXT,
          expected_version INTEGER NOT NULL,
          resulting_knowledge_id TEXT REFERENCES knowledge(knowledge_id),
          created_at TEXT NOT NULL
        );

        CREATE INDEX companies_name_idx ON companies(canonical_name);
        CREATE INDEX company_aliases_alias_idx ON company_aliases(alias);
        CREATE INDEX parsed_blocks_document_idx ON parsed_blocks(document_id, block_order);
        CREATE INDEX candidates_status_idx ON knowledge_candidates(status, updated_at DESC);
        CREATE INDEX knowledge_company_idx ON knowledge(company_id, status, knowledge_type);
      `);
      this.#db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)').run(this.#now().toISOString());
    });
  }

  #migrateCompanyListSchema(): void {
    const applied = this.#db.prepare('SELECT 1 AS applied FROM schema_migrations WHERE version = 3').get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec(`
        CREATE TABLE company_lists (
          list_id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES documents(document_id),
          conversation_id TEXT NOT NULL UNIQUE REFERENCES conversations(conversation_id),
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE company_list_rows (
          row_id TEXT PRIMARY KEY,
          list_id TEXT NOT NULL REFERENCES company_lists(list_id),
          row_order INTEGER NOT NULL,
          original_value TEXT NOT NULL,
          normalized_name TEXT,
          match_status TEXT NOT NULL,
          confirmation_status TEXT NOT NULL,
          option_ids_json TEXT NOT NULL,
          confirmed_company_id TEXT REFERENCES companies(company_id),
          evidence_id TEXT NOT NULL REFERENCES evidence(evidence_id),
          error_code TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (list_id, row_order)
        );

        CREATE TABLE company_research_requests (
          request_id TEXT PRIMARY KEY,
          list_id TEXT NOT NULL REFERENCES company_lists(list_id),
          company_id TEXT NOT NULL REFERENCES companies(company_id),
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (list_id, company_id)
        );

        CREATE INDEX company_list_rows_status_idx ON company_list_rows(list_id, confirmation_status, match_status);
        CREATE INDEX company_research_requests_status_idx ON company_research_requests(status, created_at);
      `);
      this.#db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)').run(this.#now().toISOString());
    });
  }

  #migrateCompanyResearchSchema(): void {
    const applied = this.#db.prepare('SELECT 1 AS applied FROM schema_migrations WHERE version = 4').get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec(`
        ALTER TABLE company_research_requests ADD COLUMN conversation_id TEXT REFERENCES conversations(conversation_id);

        CREATE TABLE company_research_runs (
          run_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL UNIQUE REFERENCES analysis_tasks(task_id),
          company_id TEXT REFERENCES companies(company_id),
          intent TEXT NOT NULL,
          explicit_search INTEGER NOT NULL,
          trigger_reason TEXT,
          public_query TEXT,
          search_executed_at TEXT,
          summary TEXT,
          raw_text TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE web_search_results (
          result_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES company_research_runs(run_id),
          evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(evidence_id),
          rank INTEGER NOT NULL,
          access_status TEXT NOT NULL,
          UNIQUE (run_id, rank)
        );

        CREATE INDEX company_research_runs_company_idx ON company_research_runs(company_id, updated_at DESC);
        CREATE INDEX web_search_results_run_idx ON web_search_results(run_id, rank);
      `);
      this.#db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (4, ?)').run(this.#now().toISOString());
    });
  }

  #migrateIndustrySchema(): void {
    const applied = this.#db.prepare('SELECT 1 AS applied FROM schema_migrations WHERE version = 5').get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec(`
        CREATE TABLE industries (
          industry_id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          summary TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE industry_nodes (
          node_id TEXT PRIMARY KEY,
          industry_id TEXT NOT NULL REFERENCES industries(industry_id),
          node_order INTEGER NOT NULL,
          stage TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (industry_id, node_order),
          UNIQUE (industry_id, stage, name)
        );

        CREATE TABLE industry_materials (
          industry_id TEXT NOT NULL REFERENCES industries(industry_id),
          conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
          document_id TEXT NOT NULL REFERENCES documents(document_id),
          evidence_id TEXT REFERENCES evidence(evidence_id),
          created_at TEXT NOT NULL,
          PRIMARY KEY (industry_id, conversation_id, document_id)
        );

        CREATE TABLE company_industries (
          company_id TEXT NOT NULL REFERENCES companies(company_id),
          industry_id TEXT NOT NULL REFERENCES industries(industry_id),
          node_id TEXT REFERENCES industry_nodes(node_id),
          position_label TEXT NOT NULL,
          status TEXT NOT NULL,
          evidence_id TEXT REFERENCES evidence(evidence_id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (company_id, industry_id)
        );

        CREATE INDEX industry_nodes_industry_idx ON industry_nodes(industry_id, node_order);
        CREATE INDEX industry_materials_document_idx ON industry_materials(document_id, industry_id);
        CREATE INDEX company_industries_industry_idx ON company_industries(industry_id, status, company_id);
      `);
      this.#db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?)').run(this.#now().toISOString());
    });
  }

  #migrateConversationThreadSchema(): void {
    const applied = this.#db.prepare('SELECT 1 AS applied FROM schema_migrations WHERE version = 6').get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec(`
        ALTER TABLE conversations ADD COLUMN thread_id TEXT;
        UPDATE conversations SET thread_id = conversation_id WHERE thread_id IS NULL;

        CREATE TABLE conversation_reuse_suggestions (
          suggestion_id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL UNIQUE REFERENCES conversations(conversation_id),
          target_conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
          score REAL NOT NULL,
          reason TEXT NOT NULL,
          status TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          provider_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX conversations_thread_idx ON conversations(thread_id, created_at);
        CREATE INDEX conversation_reuse_status_idx ON conversation_reuse_suggestions(status, updated_at);
      `);
      this.#db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (6, ?)').run(this.#now().toISOString());
    });
  }

  #migrateOrganizationEvidenceSchema(): void {
    const applied = this.#db.prepare('SELECT 1 AS applied FROM schema_migrations WHERE version = 7').get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec(`
        ALTER TABLE company_relations ADD COLUMN source_candidate_id TEXT REFERENCES knowledge_candidates(candidate_id);
        ALTER TABLE company_relations ADD COLUMN evidence_id TEXT REFERENCES evidence(evidence_id);
        ALTER TABLE company_relations ADD COLUMN updated_at TEXT;
        UPDATE company_relations SET updated_at = created_at WHERE updated_at IS NULL;
      `);
      this.#db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (7, ?)').run(this.#now().toISOString());
    });
  }

  #migrateEvidenceReviewSchema(): void {
    const applied = this.#db.prepare('SELECT 1 AS applied FROM schema_migrations WHERE version = 8').get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec(`
        ALTER TABLE candidate_evidence ADD COLUMN status TEXT NOT NULL DEFAULT 'supporting';
        ALTER TABLE candidate_evidence ADD COLUMN updated_at TEXT;
      `);
      this.#db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (8, ?)').run(this.#now().toISOString());
    });
  }

  #migrateAuditSchema(): void {
    const applied = this.#db.prepare('SELECT 1 AS applied FROM schema_migrations WHERE version = 9').get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec(`
        CREATE TABLE audit_records (
          audit_id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          before_json TEXT,
          after_json TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX audit_records_entity_idx ON audit_records(entity_type, entity_id, created_at DESC);
        CREATE INDEX audit_records_created_idx ON audit_records(created_at DESC);
      `);
      this.#db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (9, ?)').run(this.#now().toISOString());
    });
  }

  #migrateCompanyWatchSchema(): void {
    const applied = this.#db.prepare('SELECT 1 AS applied FROM schema_migrations WHERE version = 10').get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec('ALTER TABLE companies ADD COLUMN watched INTEGER NOT NULL DEFAULT 0 CHECK (watched IN (0, 1))');
      this.#db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (10, ?)').run(this.#now().toISOString());
    });
  }

  #migrateAnalysisRuntimeSchema(): void {
    const applied = this.#db.prepare('SELECT 1 AS applied FROM schema_migrations WHERE version = 11').get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec(`
        ALTER TABLE analysis_tasks ADD COLUMN variant TEXT;
        ALTER TABLE analysis_runs ADD COLUMN tool_usage_json TEXT NOT NULL DEFAULT '[]';
      `);
      this.#db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (11, ?)').run(this.#now().toISOString());
    });
  }

  #migrateIntakeIdempotencySchema(): void {
    const applied = this.#db.prepare('SELECT 1 AS applied FROM schema_migrations WHERE version = 12').get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec(`
        CREATE TABLE intake_idempotency (
          source_channel TEXT NOT NULL,
          source_message_id TEXT NOT NULL,
          source_attachment_key TEXT NOT NULL DEFAULT '',
          conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
          created_at TEXT NOT NULL,
          PRIMARY KEY (source_channel, source_message_id, source_attachment_key),
          UNIQUE (conversation_id)
        );
      `);
      this.#db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (12, ?)').run(this.#now().toISOString());
    });
  }

  #migrateInteractionSchema(): void {
    const applied = this.#db.prepare(
      'SELECT 1 AS applied FROM schema_migrations WHERE version = 12',
    ).get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec(`
        ALTER TABLE industries ADD COLUMN watched INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE industries ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

        CREATE TABLE notification_reads (
          notification_id TEXT PRIMARY KEY,
          read_at TEXT NOT NULL
        );
      `);
      this.#db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (12, ?)',
      ).run(this.#now().toISOString());
    });
  }

  #migrateResearchProductSchema(): void {
    const applied = this.#db.prepare(
      'SELECT 1 AS applied FROM schema_migrations WHERE version = 13',
    ).get();
    if (applied) return;
    this.#transaction(() => {
      this.#db.exec(`
        ALTER TABLE company_research_runs ADD COLUMN workflow_skill TEXT;
        ALTER TABLE company_research_runs ADD COLUMN workflow_context_json TEXT;

        CREATE TABLE conversation_industries (
          conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
          industry_id TEXT NOT NULL REFERENCES industries(industry_id),
          role TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (conversation_id, industry_id)
        );

        INSERT OR IGNORE INTO conversation_industries (
          conversation_id, industry_id, role, created_at
        )
        SELECT conversation_id, industry_id, 'primary', created_at
        FROM industry_materials;

        CREATE TABLE industry_research_runs (
          run_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL UNIQUE REFERENCES analysis_tasks(task_id),
          industry_id TEXT NOT NULL REFERENCES industries(industry_id),
          intent TEXT NOT NULL,
          explicit_search INTEGER NOT NULL,
          trigger_reason TEXT,
          public_query TEXT,
          search_executed_at TEXT,
          summary TEXT,
          raw_text TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE industry_web_search_results (
          result_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES industry_research_runs(run_id),
          evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(evidence_id),
          rank INTEGER NOT NULL,
          access_status TEXT NOT NULL,
          UNIQUE (run_id, rank)
        );

        CREATE INDEX conversation_industries_industry_idx
          ON conversation_industries(industry_id, created_at DESC);
        CREATE INDEX industry_research_runs_industry_idx
          ON industry_research_runs(industry_id, updated_at DESC);
        CREATE INDEX industry_web_search_results_run_idx
          ON industry_web_search_results(run_id, rank);
      `);
      this.#db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (13, ?)',
      ).run(this.#now().toISOString());
    });
  }

  #migrateSchemaReconciliation(): void {
    const applied = this.#db.prepare(
      'SELECT 1 AS applied FROM schema_migrations WHERE version = 14',
    ).get();
    if (applied) return;
    this.#transaction(() => {
      const tableExists = (tableName: string): boolean => Boolean(this.#db.prepare(`
        SELECT 1 AS present FROM sqlite_schema WHERE type = 'table' AND name = ?
      `).get(tableName));
      const industryColumns = new Set(
        (this.#db.prepare('PRAGMA table_info(industries)').all() as unknown as Array<{ name: string }>)
          .map((column) => column.name),
      );

      if (!tableExists('intake_idempotency')) {
        this.#db.exec(`
          CREATE TABLE intake_idempotency (
            source_channel TEXT NOT NULL,
            source_message_id TEXT NOT NULL,
            source_attachment_key TEXT NOT NULL DEFAULT '',
            conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
            created_at TEXT NOT NULL,
            PRIMARY KEY (source_channel, source_message_id, source_attachment_key),
            UNIQUE (conversation_id)
          );
        `);
      }
      if (!industryColumns.has('watched')) {
        this.#db.exec('ALTER TABLE industries ADD COLUMN watched INTEGER NOT NULL DEFAULT 0;');
      }
      if (!industryColumns.has('version')) {
        this.#db.exec('ALTER TABLE industries ADD COLUMN version INTEGER NOT NULL DEFAULT 1;');
      }
      if (!tableExists('notification_reads')) {
        this.#db.exec(`
          CREATE TABLE notification_reads (
            notification_id TEXT PRIMARY KEY,
            read_at TEXT NOT NULL
          );
        `);
      }
      this.#db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (14, ?)',
      ).run(this.#now().toISOString());
    });
  }

  #migrateIntakeAttachmentIdempotencySchema(): void {
    const applied = this.#db.prepare(
      'SELECT 1 AS applied FROM schema_migrations WHERE version = 15',
    ).get();
    if (applied) return;
    this.#transaction(() => {
      const columns = new Set(
        (this.#db.prepare('PRAGMA table_info(intake_idempotency)').all() as unknown as Array<{ name: string }>)
          .map((column) => column.name),
      );
      if (!columns.has('source_attachment_key')) {
        this.#db.exec(`
          ALTER TABLE intake_idempotency RENAME TO intake_idempotency_legacy;
          CREATE TABLE intake_idempotency (
            source_channel TEXT NOT NULL,
            source_message_id TEXT NOT NULL,
            source_attachment_key TEXT NOT NULL DEFAULT '',
            conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
            created_at TEXT NOT NULL,
            PRIMARY KEY (source_channel, source_message_id, source_attachment_key),
            UNIQUE (conversation_id)
          );
          INSERT INTO intake_idempotency (
            source_channel, source_message_id, source_attachment_key,
            conversation_id, created_at
          )
          SELECT source_channel, source_message_id, '', conversation_id, created_at
          FROM intake_idempotency_legacy;
          DROP TABLE intake_idempotency_legacy;
        `);
      }
      this.#db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (15, ?)',
      ).run(this.#now().toISOString());
    });
  }

  #migrateCompanyIndustryNormalizationSchema(): void {
    const applied = this.#db.prepare(
      'SELECT 1 AS applied FROM schema_migrations WHERE version = 16',
    ).get();
    if (applied) return;
    this.#transaction(() => {
      const now = this.#now().toISOString();
      this.#normalizeExistingCompanyNames(now);
      this.#reclassifyIndustriesInternal(now);
      this.#db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (16, ?)',
      ).run(now);
    });
  }

  #migrateSubjectIdentitySchema(): void {
    const applied = this.#db.prepare(
      'SELECT 1 AS applied FROM schema_migrations WHERE version = 17',
    ).get();
    const columns = new Set(
      (this.#db.prepare('PRAGMA table_info(companies)').all() as unknown as Array<{
        name: string;
      }>).map((column) => column.name),
    );
    const complete = [
      'subject_kind',
      'subject_kind_status',
      'suggested_subject_kind',
      'subject_kind_reason',
    ].every((column) => columns.has(column)) && this.#databaseTableExists('subject_company_links');
    if (applied && complete) return;
    this.#transaction(() => {
      const now = this.#now().toISOString();
      if (!columns.has('subject_kind')) {
        this.#db.exec("ALTER TABLE companies ADD COLUMN subject_kind TEXT NOT NULL DEFAULT 'unknown'");
      }
      if (!columns.has('subject_kind_status')) {
        this.#db.exec("ALTER TABLE companies ADD COLUMN subject_kind_status TEXT NOT NULL DEFAULT 'pending'");
      }
      if (!columns.has('suggested_subject_kind')) {
        this.#db.exec('ALTER TABLE companies ADD COLUMN suggested_subject_kind TEXT');
      }
      if (!columns.has('subject_kind_reason')) {
        this.#db.exec('ALTER TABLE companies ADD COLUMN subject_kind_reason TEXT');
      }
      this.#db.exec(`
        CREATE TABLE IF NOT EXISTS subject_company_links (
          subject_id TEXT PRIMARY KEY REFERENCES companies(company_id),
          company_id TEXT NOT NULL REFERENCES companies(company_id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (subject_id != company_id)
        );
        CREATE INDEX IF NOT EXISTS subject_company_links_company_idx
          ON subject_company_links(company_id, updated_at DESC);
      `);
      this.#normalizeExistingCompanyNames(now);
      const companies = this.#db.prepare(`
        SELECT company_id, canonical_name FROM companies WHERE status != 'merged'
      `).all() as unknown as Array<{
        company_id: string;
        canonical_name: string;
      }>;
      for (const company of companies) {
        const suggestion = suggestSubjectKind(
          company.canonical_name,
          this.#latestSubjectAnalysisSummary(company.company_id),
        );
        this.#db.prepare(`
          UPDATE companies SET suggested_subject_kind = ?, subject_kind_reason = ?
          WHERE company_id = ?
        `).run(suggestion.kind, suggestion.reason, company.company_id);
      }
      this.#db.prepare(
        'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (17, ?)',
      ).run(now);
    });
  }

  #migrateCompanyQuickCardSchema(): void {
    const applied = this.#db.prepare(
      'SELECT 1 AS applied FROM schema_migrations WHERE version = 18',
    ).get();
    if (applied && this.#databaseTableExists('company_quick_card_results')) return;
    this.#transaction(() => {
      this.#db.exec(`
        CREATE TABLE IF NOT EXISTS company_quick_card_results (
          run_id TEXT PRIMARY KEY REFERENCES company_research_runs(run_id),
          result_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
      this.#db.prepare(
        'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (18, ?)',
      ).run(this.#now().toISOString());
    });
  }

  #normalizeExistingCompanyNames(now: string): void {
    const companies = this.#db.prepare(`
      SELECT company_id, canonical_name FROM companies
      WHERE status != 'merged' ORDER BY company_id
    `).all() as unknown as Array<{
      company_id: string;
      canonical_name: string;
    }>;
    for (const company of companies) {
      const candidate = this.#companyNameCleanupCandidate(
        company.company_id,
        company.canonical_name,
      );
      let canonicalName = company.canonical_name;
      if (
        candidate
        && candidate !== company.canonical_name
        && isSafeNormalizedCompanyName(candidate)
      ) {
        const conflict = this.#db.prepare(`
          SELECT company_id FROM companies
          WHERE canonical_name = ? AND company_id != ? AND status != 'merged'
        `).get(candidate, company.company_id) as {
          company_id: string;
        } | undefined;
        if (conflict) {
          if (this.#databaseTableExists('subject_company_links')) {
            this.#prepareSubjectLinksForMerge(
              company.company_id,
              conflict.company_id,
              now,
            );
          }
          this.#mergeExistingCompany(
            company.company_id,
            conflict.company_id,
            now,
          );
          continue;
        } else {
          this.#db.prepare(`
            UPDATE companies SET canonical_name = ?, status = ?, version = version + 1,
              updated_at = ? WHERE company_id = ?
          `).run(
            candidate,
            hasLegalEntitySuffix(candidate) ? 'active' : 'provisional',
            now,
            company.company_id,
          );
          canonicalName = candidate;
        }
      }
      const aliases = this.#db.prepare(`
        SELECT alias_id, alias, alias_type, created_at
        FROM company_aliases WHERE company_id = ?
      `).all(company.company_id) as unknown as Array<{
        alias_id: string;
        alias: string;
        alias_type: string;
        created_at: string;
      }>;
      for (const alias of aliases) {
        const normalizedAlias = normalizeCompanyNameCandidate(alias.alias);
        const cleanedAlias = normalizedAlias
          ? canonicalCompanyName(normalizedAlias)
          : undefined;
        if (cleanedAlias === alias.alias && cleanedAlias !== canonicalName) continue;
        this.#db.prepare('DELETE FROM company_aliases WHERE alias_id = ?')
          .run(alias.alias_id);
        if (
          cleanedAlias
          && cleanedAlias !== canonicalName
          && isSafeNormalizedCompanyName(cleanedAlias)
        ) {
          this.#db.prepare(`
            INSERT OR IGNORE INTO company_aliases (
              alias_id, company_id, alias, alias_type, created_at
            ) VALUES (?, ?, ?, ?, ?)
          `).run(
            alias.alias_id,
            company.company_id,
            cleanedAlias,
            alias.alias_type,
            alias.created_at,
          );
        }
      }
      for (const alias of companyAliases(canonicalName)) {
        this.#db.prepare(`
          INSERT OR IGNORE INTO company_aliases (
            alias_id, company_id, alias, alias_type, created_at
          ) VALUES (?, ?, ?, 'short_name', ?)
        `).run(this.#nextId(), company.company_id, alias, now);
      }
    }
  }

  #mergeExistingCompany(
    sourceCompanyId: string,
    targetCompanyId: string,
    now: string,
  ): void {
    if (sourceCompanyId === targetCompanyId) return;
    const source = this.#db.prepare(`
      SELECT canonical_name, status, watched FROM companies
      WHERE company_id = ?
    `).get(sourceCompanyId) as {
      canonical_name: string;
      status: string;
      watched: number;
    } | undefined;
    const target = this.#db.prepare(`
      SELECT canonical_name, status, watched FROM companies
      WHERE company_id = ? AND status != 'merged'
    `).get(targetCompanyId) as {
      canonical_name: string;
      status: string;
      watched: number;
    } | undefined;
    if (!source || !target) return;

    const aliases = this.#db.prepare(`
      SELECT alias, alias_type, created_at FROM company_aliases
      WHERE company_id = ?
    `).all(sourceCompanyId) as unknown as Array<{
      alias: string;
      alias_type: string;
      created_at: string;
    }>;
    this.#db.prepare('DELETE FROM company_aliases WHERE company_id = ?')
      .run(sourceCompanyId);
    for (const alias of [
      {
        alias: source.canonical_name,
        alias_type: 'merged_name',
        created_at: now,
      },
      ...aliases,
    ]) {
      const normalized = normalizeCompanyNameCandidate(alias.alias);
      const cleaned = normalized ? canonicalCompanyName(normalized) : undefined;
      if (
        !cleaned
        || cleaned === target.canonical_name
        || !isSafeNormalizedCompanyName(cleaned)
      ) continue;
      this.#db.prepare(`
        INSERT OR IGNORE INTO company_aliases (
          alias_id, company_id, alias, alias_type, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        this.#nextId(),
        targetCompanyId,
        cleaned,
        alias.alias_type,
        alias.created_at,
      );
    }

    this.#db.prepare(`
      INSERT OR IGNORE INTO conversation_companies (
        conversation_id, company_id, role, created_at
      )
      SELECT conversation_id, ?, role, created_at
      FROM conversation_companies WHERE company_id = ?
    `).run(targetCompanyId, sourceCompanyId);
    this.#db.prepare('DELETE FROM conversation_companies WHERE company_id = ?')
      .run(sourceCompanyId);

    const relations = this.#db.prepare(`
      SELECT relation_id, from_company_id, to_company_id,
        relation_type, status, created_at
      FROM company_relations
      WHERE from_company_id = ? OR to_company_id = ?
      ORDER BY relation_id
    `).all(sourceCompanyId, sourceCompanyId) as unknown as Array<{
      relation_id: string;
      from_company_id: string;
      to_company_id: string;
      relation_type: string;
      status: string;
      created_at: string;
    }>;
    for (const relation of relations) {
      const fromCompanyId = relation.from_company_id === sourceCompanyId
        ? targetCompanyId
        : relation.from_company_id;
      const toCompanyId = relation.to_company_id === sourceCompanyId
        ? targetCompanyId
        : relation.to_company_id;
      this.#db.prepare('DELETE FROM company_relations WHERE relation_id = ?')
        .run(relation.relation_id);
      if (fromCompanyId === toCompanyId) continue;
      const existing = this.#db.prepare(`
        SELECT relation_id, status FROM company_relations
        WHERE from_company_id = ? AND to_company_id = ? AND relation_type = ?
      `).get(fromCompanyId, toCompanyId, relation.relation_type) as {
        relation_id: string;
        status: string;
      } | undefined;
      if (existing) {
        this.#db.prepare(`
          UPDATE company_relations SET status = ? WHERE relation_id = ?
        `).run(
          mergedPlacementStatus(existing.status, relation.status),
          existing.relation_id,
        );
      } else {
        this.#db.prepare(`
          INSERT INTO company_relations (
            relation_id, from_company_id, to_company_id,
            relation_type, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          relation.relation_id,
          fromCompanyId,
          toCompanyId,
          relation.relation_type,
          relation.status,
          relation.created_at,
        );
      }
    }

    const placements = this.#db.prepare(`
      SELECT industry_id, node_id, position_label, status,
        evidence_id, created_at, updated_at
      FROM company_industries WHERE company_id = ?
      ORDER BY industry_id
    `).all(sourceCompanyId) as unknown as Array<{
      industry_id: string;
      node_id: string | null;
      position_label: string;
      status: string;
      evidence_id: string | null;
      created_at: string;
      updated_at: string;
    }>;
    for (const placement of placements) {
      const existing = this.#db.prepare(`
        SELECT status, position_label FROM company_industries
        WHERE company_id = ? AND industry_id = ?
      `).get(targetCompanyId, placement.industry_id) as {
        status: string;
        position_label: string;
      } | undefined;
      if (existing) {
        this.#db.prepare(`
          UPDATE company_industries SET
            node_id = COALESCE(node_id, ?),
            position_label = CASE
              WHEN position_label = '产业链位置待确认' THEN ?
              ELSE position_label END,
            status = ?, evidence_id = COALESCE(evidence_id, ?),
            updated_at = ?
          WHERE company_id = ? AND industry_id = ?
        `).run(
          placement.node_id,
          placement.position_label,
          mergedPlacementStatus(existing.status, placement.status),
          placement.evidence_id,
          now,
          targetCompanyId,
          placement.industry_id,
        );
        this.#db.prepare(`
          DELETE FROM company_industries
          WHERE company_id = ? AND industry_id = ?
        `).run(sourceCompanyId, placement.industry_id);
      } else {
        this.#db.prepare(`
          UPDATE company_industries SET company_id = ?, updated_at = ?
          WHERE company_id = ? AND industry_id = ?
        `).run(
          targetCompanyId,
          now,
          sourceCompanyId,
          placement.industry_id,
        );
      }
    }

    this.#db.prepare(`
      UPDATE company_match_cases SET resolved_company_id = ?, updated_at = ?
      WHERE resolved_company_id = ?
    `).run(targetCompanyId, now, sourceCompanyId);
    this.#db.prepare(`
      UPDATE knowledge_candidates SET company_id = ?, updated_at = ?
      WHERE company_id = ?
    `).run(targetCompanyId, now, sourceCompanyId);
    this.#db.prepare('UPDATE knowledge SET company_id = ? WHERE company_id = ?')
      .run(targetCompanyId, sourceCompanyId);
    this.#reconcileMergedKnowledge(targetCompanyId);
    this.#db.prepare(`
      UPDATE company_list_rows SET confirmed_company_id = ?, updated_at = ?
      WHERE confirmed_company_id = ?
    `).run(targetCompanyId, now, sourceCompanyId);
    this.#db.prepare(`
      DELETE FROM company_research_requests
      WHERE company_id = ? AND EXISTS (
        SELECT 1 FROM company_research_requests target
        WHERE target.list_id = company_research_requests.list_id
          AND target.company_id = ?
      )
    `).run(sourceCompanyId, targetCompanyId);
    this.#db.prepare(`
      UPDATE company_research_requests SET company_id = ?
      WHERE company_id = ?
    `).run(targetCompanyId, sourceCompanyId);
    this.#db.prepare(`
      UPDATE company_research_runs SET company_id = ?, updated_at = ?
      WHERE company_id = ?
    `).run(targetCompanyId, now, sourceCompanyId);
    this.#replaceCompanyIdInOptions(
      'company_match_cases',
      'case_id',
      sourceCompanyId,
      targetCompanyId,
    );
    this.#replaceCompanyIdInOptions(
      'company_list_rows',
      'row_id',
      sourceCompanyId,
      targetCompanyId,
    );
    this.#db.prepare(`
      UPDATE companies SET
        status = ?, watched = CASE WHEN watched = 1 OR ? = 1 THEN 1 ELSE 0 END,
        version = version + 1, updated_at = ?
      WHERE company_id = ?
    `).run(
      target.status === 'active' || source.status === 'active'
        ? 'active'
        : 'provisional',
      source.watched,
      now,
      targetCompanyId,
    );
    this.#audit(
      'company.merge_normalization',
      'company',
      targetCompanyId,
      { sourceCompanyId, sourceName: source.canonical_name },
      { targetCompanyId, targetName: target.canonical_name },
      now,
    );
    this.#db.prepare('DELETE FROM companies WHERE company_id = ?')
      .run(sourceCompanyId);
  }

  #reconcileMergedKnowledge(companyId: string): void {
    const types = this.#db.prepare(`
      SELECT knowledge_type
      FROM knowledge
      WHERE company_id = ? AND status IN ('current', 'disputed')
      GROUP BY knowledge_type
      HAVING COUNT(*) > 1
    `).all(companyId) as unknown as Array<{ knowledge_type: string }>;
    for (const { knowledge_type: knowledgeType } of types) {
      const rows = this.#db.prepare(`
        SELECT knowledge_id, statement, value, effective_at, version,
          supersedes_id, status
        FROM knowledge
        WHERE company_id = ? AND knowledge_type = ?
          AND status IN ('current', 'disputed')
        ORDER BY version DESC, created_at DESC, knowledge_id DESC
      `).all(companyId, knowledgeType) as unknown as Array<{
        knowledge_id: string;
        statement: string;
        value: string | null;
        effective_at: string | null;
        version: number;
        supersedes_id: string | null;
        status: string;
      }>;
      const keeper = rows[0];
      const superseded = rows.slice(1);
      const distinctValues = new Set(
        rows.map((row) => normalizeComparable(
          `${row.statement}\u0000${row.value ?? ''}\u0000${row.effective_at ?? ''}`,
        )),
      );
      for (const row of superseded) {
        this.#db.prepare(`
          UPDATE knowledge SET status = 'superseded' WHERE knowledge_id = ?
        `).run(row.knowledge_id);
      }
      this.#db.prepare(`
        UPDATE knowledge SET status = ?, version = ?, supersedes_id = ?
        WHERE knowledge_id = ?
      `).run(
        distinctValues.size > 1 ? 'disputed' : 'current',
        Math.max(...rows.map((row) => row.version)),
        keeper.supersedes_id ?? superseded[0]?.knowledge_id ?? null,
        keeper.knowledge_id,
      );
    }
  }

  #confirmedLegalCompany(companyId: string): CompanyRecord {
    const company = this.#companyRecord(companyId);
    if (
      company.subjectKind !== 'legal_company'
      || company.subjectKindStatus !== 'confirmed'
    ) {
      throw new PlatformInputError(
        'target_company_not_confirmed',
        '目标主体必须先确认是法律公司',
      );
    }
    return company;
  }

  #databaseTableExists(tableName: string): boolean {
    return Boolean(this.#db.prepare(`
      SELECT 1 AS present FROM sqlite_schema
      WHERE type = 'table' AND name = ?
    `).get(tableName));
  }

  #prepareSubjectLinksForMerge(
    sourceCompanyId: string,
    targetCompanyId: string,
    now: string,
  ): void {
    this.#db.prepare(`
      DELETE FROM subject_company_links
      WHERE subject_id IN (?, ?)
    `).run(sourceCompanyId, targetCompanyId);
    this.#db.prepare(`
      UPDATE subject_company_links SET company_id = ?, updated_at = ?
      WHERE company_id = ? AND subject_id != ?
    `).run(targetCompanyId, now, sourceCompanyId, targetCompanyId);
  }

  #replaceCompanyIdInOptions(
    table: 'company_match_cases' | 'company_list_rows',
    idColumn: 'case_id' | 'row_id',
    sourceCompanyId: string,
    targetCompanyId: string,
  ): void {
    const rows = this.#db.prepare(`
      SELECT ${idColumn} AS row_id, option_ids_json
      FROM ${table} WHERE option_ids_json LIKE ?
    `).all(`%${sourceCompanyId}%`) as unknown as Array<{
      row_id: string;
      option_ids_json: string;
    }>;
    for (const row of rows) {
      const options = JSON.parse(row.option_ids_json) as string[];
      const replaced = [...new Set(options.map((companyId) =>
        companyId === sourceCompanyId ? targetCompanyId : companyId))];
      this.#db.prepare(`
        UPDATE ${table} SET option_ids_json = ? WHERE ${idColumn} = ?
      `).run(JSON.stringify(replaced), row.row_id);
    }
  }

  #companyNameCleanupCandidate(
    companyId: string,
    canonicalName: string,
  ): string | undefined {
    const suspicious = /^(?:创新组|创业组)\s*\d+\s*[+＋]|^一下|推荐|^[^\p{L}\p{N}]|(?:已经?|已)?(?:纳入|进入)|(?:^|[）)】])(?:受|由)|(?:BP|MP)\s*@?|\.ocr$/iu
      .test(canonicalName);
    if (suspicious) {
      const groupedDocument = this.#db.prepare(`
        SELECT document.file_name
        FROM conversation_companies company
        JOIN conversations conversation
          ON conversation.conversation_id = company.conversation_id
        JOIN documents document
          ON document.document_id = conversation.primary_document_id
        WHERE company.company_id = ? AND company.role = 'primary'
          AND (
            document.file_name GLOB '创新组*'
            OR document.file_name GLOB '创业组*'
          )
        ORDER BY conversation.updated_at DESC, document.document_id DESC
        LIMIT 1
      `).get(companyId) as { file_name: string } | undefined;
      const groupedCandidate = groupedDocument
        ? normalizeCompanyNameCandidate(groupedDocument.file_name)
        : undefined;
      const blocks = this.#db.prepare(`
        SELECT block.text
        FROM conversation_companies company
        JOIN conversations conversation
          ON conversation.conversation_id = company.conversation_id
        JOIN parsed_blocks block
          ON block.document_id = conversation.primary_document_id
        WHERE company.company_id = ? AND company.role = 'primary'
        ORDER BY conversation.updated_at DESC, block.block_order
        LIMIT 120
      `).all(companyId) as unknown as Array<{ text: string }>;
      const legalEntity = extractLegalCompanyName(
        blocks.map((block) => block.text).join('\n').slice(0, 80_000),
        { requireExplicitSubject: Boolean(groupedCandidate) },
      );
      if (legalEntity) return canonicalCompanyName(legalEntity);
      if (groupedCandidate) return canonicalCompanyName(groupedCandidate);
      const legalEntityFromName = extractLegalCompanyName(canonicalName);
      if (legalEntityFromName) return canonicalCompanyName(legalEntityFromName);
    }
    const normalized = normalizeCompanyNameCandidate(canonicalName);
    return normalized ? canonicalCompanyName(normalized) : undefined;
  }
}

function relationStatus(value: string): 'candidate' | 'confirmed' | 'conflicted' {
  if (value === 'confirmed' || value === 'active') return 'confirmed';
  if (value === 'conflicted' || value === 'disputed') return 'conflicted';
  return 'candidate';
}

function mergedPlacementStatus(existing: string, incoming: string): string {
  if (existing === 'confirmed' || incoming === 'confirmed') return 'confirmed';
  if (existing === 'conflicted' || incoming === 'conflicted') return 'conflicted';
  return 'candidate';
}

function notificationWithRead(
  notification: Omit<PlatformNotification, 'readAt'>,
  reads: ReadonlyMap<string, string>,
): PlatformNotification {
  const readAt = reads.get(notification.notificationId);
  return { ...notification, ...(readAt ? { readAt } : {}) };
}

function parsedBlockLocator(block: ParsedBlock): string | undefined {
  if (block.page !== undefined) return `page:${block.page}`;
  if (block.sheet && block.cellRange) return `sheet:${block.sheet}:${block.cellRange}`;
  if (block.sheet && block.row !== undefined) return `sheet:${block.sheet}:row:${block.row}`;
  if (block.paragraph !== undefined) return `paragraph:${block.paragraph}`;
  if (block.headingPath?.length) return `heading:${block.headingPath.join(' > ')}`;
  return undefined;
}

function normalizeCompanyResearchWorkflow(
  workflow: StartCompanyResearchInput['workflow'],
): NonNullable<StartCompanyResearchInput['workflow']> | undefined {
  if (!workflow) return undefined;
  if (!['diagnose-bp', 'screen-deal', 'extract-risk-flags'].includes(workflow.skill)) {
    throw new PlatformInputError(
      'invalid_workflow_skill',
      '不支持的投研 Skill',
    );
  }
  const requiredScopeValues = [
    workflow.scope.asOfDate,
    workflow.scope.transactionSide,
    workflow.scope.stage,
    workflow.scope.audience,
    workflow.scope.decisionOwner,
  ];
  if (requiredScopeValues.some((value) => !value.trim())) {
    throw new PlatformInputError(
      'workflow_scope_required',
      '请完整填写交易侧、阶段、受众、证据日期和决策负责人',
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(workflow.scope.asOfDate)) {
    throw new PlatformInputError(
      'workflow_as_of_date_invalid',
      '证据截止日期必须使用 YYYY-MM-DD',
    );
  }
  if (!['public', 'internal', 'restricted'].includes(workflow.scope.confidentiality)) {
    throw new PlatformInputError(
      'workflow_confidentiality_invalid',
      '保密级别无效',
    );
  }
  if (
    workflow.inputScopeApproval.approved !== true
    || !workflow.inputScopeApproval.approvedBy.trim()
    || Number.isNaN(Date.parse(workflow.inputScopeApproval.approvedAt))
    || !Array.isArray(workflow.inputScopeApproval.sourceIds)
    || workflow.inputScopeApproval.sourceIds.length === 0
    || workflow.inputScopeApproval.sourceIds.some((sourceId) => !sourceId.trim())
  ) {
    throw new PlatformInputError(
      'workflow_input_scope_approval_required',
      '运行投研 Skill 前必须确认本次输入材料范围',
    );
  }
  const sourceIds = [
    ...new Set(
      workflow.inputScopeApproval.sourceIds.map((sourceId) => sourceId.trim()),
    ),
  ];
  if (sourceIds.length !== workflow.inputScopeApproval.sourceIds.length) {
    throw new PlatformInputError(
      'workflow_input_scope_approval_invalid',
      '输入范围包含重复的材料来源',
    );
  }
  if (workflow.skill === 'screen-deal') {
    if (
      !workflow.scope.mode
      || !['one-minute', 'preliminary', 're-screen', 'gp-fit'].includes(workflow.scope.mode)
      || !workflow.scope.mandate?.trim()
    ) {
      throw new PlatformInputError(
        'screen_workflow_scope_incomplete',
        '项目初筛必须明确模式和投资 mandate',
      );
    }
  }
  if (workflow.methodAssumptionApproval) {
    if (
      workflow.methodAssumptionApproval.approved !== true
      || !workflow.methodAssumptionApproval.approvedBy.trim()
      || Number.isNaN(Date.parse(workflow.methodAssumptionApproval.approvedAt))
    ) {
      throw new PlatformInputError(
        'workflow_method_approval_invalid',
        '方法假设审批记录无效',
      );
    }
  }
  return {
    skill: workflow.skill,
    scope: {
      asOfDate: workflow.scope.asOfDate,
      transactionSide: workflow.scope.transactionSide.trim(),
      stage: workflow.scope.stage.trim(),
      audience: workflow.scope.audience.trim(),
      confidentiality: workflow.scope.confidentiality,
      decisionOwner: workflow.scope.decisionOwner.trim(),
      ...(workflow.scope.mode ? { mode: workflow.scope.mode } : {}),
      ...(workflow.scope.mandate?.trim() ? { mandate: workflow.scope.mandate.trim() } : {}),
    },
    inputScopeApproval: {
      approved: true,
      approvedBy: workflow.inputScopeApproval.approvedBy.trim(),
      approvedAt: new Date(workflow.inputScopeApproval.approvedAt).toISOString(),
      sourceIds,
    },
    ...(workflow.methodAssumptionApproval
      ? {
          methodAssumptionApproval: {
            approved: true,
            approvedBy: workflow.methodAssumptionApproval.approvedBy.trim(),
            approvedAt: new Date(workflow.methodAssumptionApproval.approvedAt).toISOString(),
          },
        }
      : {}),
  };
}

function pendingCompanyIdentityQuickCard(companyName: string): CompanyQuickCardResult {
  return {
    kind: 'company_research',
    status: 'pending_confirmation',
    companyName,
    identityState: 'ambiguous',
    companyIdentity: '匹配到多个已有主体，请在深度分析对话中确认',
    industryTrack: '待主体确认',
    financing: '待主体确认',
    keyPeople: '待主体确认',
    highlights: [],
    recentSignals: [],
    confidence: 0,
    confidenceLevel: '低',
    sourceCount: 0,
    materialCount: 0,
    formalKnowledgeCount: 0,
    pendingCandidateCount: 0,
    navigation: {},
    providerId: 'boyuan',
    modelId: 'identity-matcher',
    variant: 'deterministic',
    sessionId: '',
  };
}

function companyQuickCardConfidence(
  result: CompanyQuickCardExtractionResult,
  context: {
    identityState: 'existing' | 'provisional';
    sourceCount: number;
    materialCount: number;
    formalKnowledgeCount: number;
  },
): number {
  const disclosedText = [
    result.companyIdentity,
    result.industryTrack,
    result.financing,
    result.keyPeople,
  ].filter((value) => value !== '暂未检索到').length;
  const disclosedGroups = disclosedText
    + (result.highlights.length > 0 ? 1 : 0)
    + (result.recentSignals.length > 0 ? 1 : 0);
  return Math.min(90, Math.round(
    10
      + (context.identityState === 'existing' ? 15 : 5)
      + Math.min(25, context.sourceCount * 5)
      + Math.min(20, context.formalKnowledgeCount * 4)
      + Math.min(8, context.materialCount * 2)
      + (disclosedGroups / 6) * 12,
  ));
}

function quickCardConfidence(
  result: QuickCardExtractionResult,
  companyMatched: boolean,
): number {
  const disclosedText = [
    result.companyIdentity,
    result.industryTrack,
    result.financing,
    result.keyPeople,
  ].filter((value) => value !== '材料未披露').length;
  const disclosedFacts = disclosedText + (result.highlights.length > 0 ? 1 : 0);
  const mentionedRelationGroups = [
    result.competitorNames,
    result.upstreamNames,
    result.downstreamNames,
  ].filter((values) => values.length > 0).length;
  return Math.min(100, Math.round(
    (disclosedFacts / 5) * 70
      + (companyMatched ? 20 : 0)
      + (mentionedRelationGroups / 3) * 10,
  ));
}

function industryNameFrom(summary: string, companyName: string): string {
  const known = [
    '商业航天', '可控核聚变', '人工智能', '半导体', '新能源', '生物医药',
    '智能制造', '企业服务', '机器人', '低空经济', '卫星通信', '新材料',
  ].find((name) => summary.includes(name));
  if (known) return known;
  const short = companyName.replace(/(?:股份)?有限公司$/u, '').trim();
  return `${short || companyName}相关行业`.slice(0, 100);
}

function requiredMatch<T>(matches: Map<string, T>, key: string): T {
  const match = matches.get(key);
  if (!match) throw new Error(`semantic match missing: ${key}`);
  return match;
}

function requiredMaterial(materials: Map<string, CompanyMaterialRecord>, key: string): CompanyMaterialRecord {
  const material = materials.get(key);
  if (!material) throw new Error(`semantic material missing: ${key}`);
  return material;
}

function searchEvidence(documentId: string, fileName: string, block: ParsedBlock): EvidenceRecord {
  return {
    evidenceId: `search:${block.blockId}`,
    sourceType: 'material',
    fileName,
    documentId,
    blockId: block.blockId,
    quote: block.text.slice(0, 1200),
    ...(block.page !== undefined ? { page: block.page } : {}),
    ...(block.paragraph !== undefined ? { paragraph: block.paragraph } : {}),
    ...(block.headingPath ? { headingPath: block.headingPath } : {}),
    ...(block.sheet ? { sheet: block.sheet } : {}),
    ...(block.row !== undefined ? { row: block.row } : {}),
    ...(block.cellRange ? { cellRange: block.cellRange } : {}),
  };
}

function uniqueEvidence(values: EvidenceRecord[]): EvidenceRecord[] {
  return [...new Map(values.map((item) => [item.evidenceId, item])).values()];
}

function semanticText(values: string[], maxLength = 30_000): string {
  const normalized = values.map((value) => value.trim()).filter(Boolean).join('\n');
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

function boundedAiBlocks(blocks: ParsedBlock[]): ParsedBlock[] {
  const bounded: ParsedBlock[] = [];
  let remainingCharacters = MAX_AI_TOTAL_CHARACTERS;
  for (const block of blocks) {
    if (bounded.length >= MAX_AI_BLOCKS || remainingCharacters <= 0) break;
    const text = block.text.slice(0, Math.min(MAX_AI_BLOCK_CHARACTERS, remainingCharacters));
    if (!text) continue;
    bounded.push({ ...block, text });
    remainingCharacters -= text.length;
  }
  return bounded;
}

function safeFileName(value: string): string {
  const name = [...basename(value)]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? ' ' : character;
    })
    .join('')
    .trim();
  if (!name || name === '.' || name === '..') throw new PlatformInputError('invalid_file_name', 'file name is invalid');
  return [...name].slice(0, 180).join('');
}

function safeId(value: string): string {
  if (!/^[A-Za-z0-9_-]{8,128}$/u.test(value)) throw new Error('generated id is unsafe');
  return value;
}

function toStepRecord(row: StepRow): TaskStepRecord {
  return {
    stepId: row.step_id,
    name: row.step_name,
    position: row.position,
    status: row.status as TaskStepStatus,
    attempts: row.attempts,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
  };
}

function asDocumentParseStatus(value: string): DocumentRecord['parseStatus'] {
  if (value === 'queued' || value === 'processing' || value === 'parsed' || value === 'failed') return value;
  throw new Error(`invalid document parse status: ${value}`);
}

function asArchiveStatus(value: string): DocumentRecord['archiveStatus'] {
  if (value === 'stored' || value === 'archived' || value === 'pending_company') return value;
  throw new Error(`invalid archive status: ${value}`);
}

function classifyStepError(error: unknown): string {
  if (error instanceof DocumentParserError || error instanceof AnalysisAdapterError || error instanceof SearchAdapterError) return error.code;
  const message = error instanceof Error ? error.message : 'unknown';
  return message.replace(/[^a-z0-9_]/gi, '_').slice(0, 120) || 'unknown';
}

function assertKnownBlockIds(blockIds: string[], valid: Set<string>, context: string, allowEmpty: boolean): void {
  if (!allowEmpty && blockIds.length === 0) throw new AnalysisAdapterError('analysis_evidence_missing', `${context} has no evidence`);
  if (blockIds.some((blockId) => !valid.has(blockId))) {
    throw new AnalysisAdapterError('analysis_evidence_unknown', `${context} references an unknown blockId`);
  }
}

function extractCompanyName(fileName: string, blocks: ParsedBlock[]): string | undefined {
  const normalizedFileName = normalizeCompanyNameCandidate(fileName);
  const groupedMaterial = /^(?:创新组|创业组)\s*\d+\s*[+＋]/u.test(
    basename(fileName),
  );
  const blockText = blocks
    .slice(0, 120)
    .map((block) => block.text)
    .join('\n')
    .slice(0, 80_000);
  if (groupedMaterial) {
    const explicitLegalEntity = extractLegalCompanyName(blockText, {
      requireExplicitSubject: true,
    });
    if (explicitLegalEntity)
      return canonicalCompanyName(explicitLegalEntity);
  }
  if (groupedMaterial && normalizedFileName) {
    return canonicalCompanyName(normalizedFileName);
  }
  const legalEntity = extractLegalCompanyName(blockText);
  if (legalEntity) return canonicalCompanyName(legalEntity);
  const genericHeadings = new Set(['公司与团队', '公司介绍', '项目介绍', '核心产品', '商业计划书', '融资计划书']);
  const heading = blocks.find((block) => block.kind === 'heading' && block.text.length >= 2 && block.text.length <= 48 && !genericHeadings.has(block.text));
  const fromHeading = heading ? normalizeCompanyNameCandidate(heading.text) : undefined;
  if (fromHeading && fromHeading.length >= 2) return canonicalCompanyName(fromHeading);
  return normalizedFileName && normalizedFileName.length <= 80
    ? canonicalCompanyName(normalizedFileName)
    : undefined;
}

function canonicalCompanyName(value: string): string {
  return value.replace(/[\s\u3000]+/gu, '').replace(/^[-_—]+|[-_—]+$/gu, '');
}

function isSafeNormalizedCompanyName(value: string): boolean {
  const unsafe = [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 || character === '<' || character === '>';
  });
  const sentenceLike = /(?:[)）】]|^)(?:是|为|受|由)|(?:是|为)一家|(?:唯一|领先|专业)的/u
    .test(value);
  return value.length >= 2
    && value.length <= 80
    && /[\p{L}]/u.test(value)
    && !unsafe
    && !sentenceLike;
}

function assertCompanyListName(value: string): void {
  const unsafe = [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 || character === '<' || character === '>';
  });
  if (value.length < 2 || value.length > 80 || !/[\p{L}]/u.test(value) || unsafe) {
    throw new PlatformInputError('invalid_company_name', '公司名称格式无效');
  }
}

function organizationCandidateName(value: string | undefined, statement: string): string | undefined {
  for (const source of [value, statement]) {
    if (!source) continue;
    const legal = extractLegalCompanyName(source);
    if (legal) return canonicalCompanyName(legal);
    const group = source.match(/[\p{Script=Han}A-Za-z0-9（）()·&]{2,80}?(?:集团|研究院|中心)/u)?.[0];
    if (group) return canonicalCompanyName(group);
    const trimmed = canonicalCompanyName(source.replace(/^["“']|["”']$/gu, ''));
    if (source === value && trimmed.length >= 2 && trimmed.length <= 80 && !/[，。；;：:\n]/u.test(trimmed)) return trimmed;
  }
  return undefined;
}

const LEGACY_AUTOMATIC_INDUSTRY_NAMES = new Set([
  '商业航天',
  '可控核聚变',
  '人工智能',
  '半导体',
  '新能源',
  '生物医药',
  '智能制造',
  '企业服务',
  '机器人',
  '低空经济',
  '卫星通信',
  '新材料',
]);

function isLegacyGeneratedIndustryName(name: string): boolean {
  return name.endsWith('相关行业') || LEGACY_AUTOMATIC_INDUSTRY_NAMES.has(name);
}

function isCompanyListFile(fileName: string): boolean {
  const extension = extname(fileName).toLowerCase();
  return extension === '.csv' || extension === '.xlsx';
}

async function* singleChunk(value: Uint8Array): AsyncGenerator<Uint8Array> {
  yield value;
}

function hasLegalEntitySuffix(value: string): boolean {
  return /(?:股份有限公司|有限责任公司|有限公司)$/u.test(value);
}

function suggestSubjectKind(value: string, analysisSummary?: string): {
  kind: SubjectKind;
  reason: string;
} {
  if (hasLegalEntitySuffix(value) || /公司$/u.test(value)) {
    return { kind: 'legal_company', reason: '名称包含明确的法律公司后缀' };
  }
  if (/(?:研究院|研究所|大学|学院|实验室|中心)$/u.test(value)) {
    return { kind: 'institution', reason: '名称符合机构命名特征' };
  }
  if (/(?:团队|创新组|创业组)$/u.test(value)) {
    return { kind: 'team', reason: '名称符合团队命名特征' };
  }
  const summary = analysisSummary?.trim();
  if (summary) {
    if (
      /(?:法律主体|工商主体|运营主体|融资主体|项目公司|公司全称)\s*(?:为|是|[:：])?\s*[^。；;\n]{0,80}(?:股份有限公司|有限责任公司|有限公司)/u.test(summary)
    ) {
      return { kind: 'legal_company', reason: '材料分析明确披露了法律公司主体' };
    }
    if (/(?:主体类型|组织性质)\s*(?:为|是|[:：])?\s*(?:研究院|研究所|大学|学院|实验室|中心)/u.test(summary)) {
      return { kind: 'institution', reason: '材料分析将主体描述为机构' };
    }
    if (/(?:主体类型|组织形式|项目团队)\s*(?:为|是|[:：])?\s*(?:团队|创新组|创业组)/u.test(summary)) {
      return { kind: 'team', reason: '材料分析将主体描述为团队' };
    }
    if (
      /(?:项目|产品|系统|平台|技术).{0,32}(?:阶段|研发|验证|测试|商业化|应用|解决方案)/u.test(summary)
      || /(?:项目名称|产品名称|技术名称|本项目|该项目)/u.test(summary)
      || /材料主体为[^。；;\n]{0,80}项目/u.test(summary)
    ) {
      return { kind: 'project', reason: '材料分析表明该主体是项目、产品或技术' };
    }
  }
  if (
    /^基于/u.test(value)
    || /(?:项目|系统|平台|软件|技术(?:研究|开发)?|测试|测压|压力计|受感部|飞行器|装备制造|设计及应用|工艺|导航员)(?:$|——)/u.test(value)
  ) {
    return { kind: 'project', reason: '名称更像项目、产品或技术名称' };
  }
  if (summary) {
    return { kind: 'unknown', reason: '材料分析未能可靠确定主体类型' };
  }
  return { kind: 'unknown', reason: '尚无足够名称或材料证据判断主体类型' };
}

function companyAliases(value: string): string[] {
  const short = value.replace(/(?:股份有限公司|有限责任公司|有限公司)$/u, '');
  return short && short !== value ? [short] : [];
}

function extractDeclaredAliases(blocks: ParsedBlock[]): string[] {
  const aliases = new Set<string>();
  const pattern = /(?:公司简称|简称|品牌(?:名)?)\s*[:：]\s*([\p{Script=Han}A-Za-z0-9（）()\u00b7&]{2,32})/giu;
  for (const block of blocks.slice(0, 120)) {
    for (const match of block.text.matchAll(pattern)) {
      if (match[1]) aliases.add(canonicalCompanyName(match[1]));
    }
  }
  return [...aliases];
}

function normalizeComparable(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
}
