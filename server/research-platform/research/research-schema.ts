import { AnalysisAdapterError } from '../analysis/contracts.js';
import type {
  CompanyResearchCandidateDraft,
  CompanyResearchRelationCategory,
  CompanyResearchRelationDraft,
} from './contracts.js';

const RESEARCH_FIELDS = new Set(['summary', 'candidates', 'relations']);
const WORKFLOW_RESEARCH_FIELDS = new Set(['summary', 'decision', 'candidates']);
const SOURCE_EXCERPT_FIELDS = new Set(['state', 'category', 'sourceId', 'quote']);
const CONTROLLED_ITEM_FIELDS = new Set(['state', 'category']);
const METHOD_SCORE_FIELDS = new Set([
  'state',
  'category',
  'score',
  'scale',
  'riskLevel',
  'sourceIds',
]);
const WORKFLOW_SUMMARY_STATES = new Set([
  'source_excerpt',
  'evidence_gap',
  'pending_question',
  'method_score',
]);
const WORKFLOW_CATEGORIES = new Set([
  'company_stage',
  'team_governance',
  'product',
  'technology_ip',
  'maturity_capacity',
  'market_policy',
  'industry_chain',
  'customers_orders',
  'supply_chain',
  'business_model',
  'financing_equity',
  'financials_risks',
  'source_conflict',
]);
const WORKFLOW_CATEGORY_LABELS: Record<string, string> = {
  company_stage: '公司主体与项目阶段',
  team_governance: '团队与治理',
  product: '产品矩阵',
  technology_ip: '核心技术与知识产权',
  maturity_capacity: '技术成熟度与生产能力',
  market_policy: '行业、市场与政策',
  industry_chain: '产业链位置',
  customers_orders: '客户、订单与应用场景',
  supply_chain: '供应链与合作方',
  business_model: '商业模式与竞争优势',
  financing_equity: '融资、估值、股权与资金用途',
  financials_risks: '财务经营、规划与风险',
  source_conflict: '来源、时间、版本与冲突',
};
const RISK_LEVELS = new Set(['low', 'medium', 'high', 'unknown']);
const RESEARCH_CANDIDATE_FIELDS = new Set([
  'knowledgeType',
  'statement',
  'value',
  'effectiveAt',
  'evidenceUrls',
  'highImpact',
  'sensitive',
]);
const RESEARCH_RELATION_FIELDS = new Set([
  'targetName',
  'category',
  'relationType',
  'description',
  'evidenceUrls',
]);
const RESEARCH_RELATION_CATEGORIES = new Set<CompanyResearchRelationCategory>([
  'upstream',
  'downstream',
  'customer',
  'competitor',
]);

export function parseResearchJson(
  rawText: string,
  options: {
    requireBlankDecision?: boolean;
    workflowMaterials?: readonly { sourceId: string; excerpt: string }[];
    workflowMethodApproved?: boolean;
  } = {},
): {
  summary: string;
  candidates: CompanyResearchCandidateDraft[];
  relations: CompanyResearchRelationDraft[];
} {
  let value: unknown;
  try {
    value = JSON.parse(extractJson(rawText));
  } catch (error) {
    throw new AnalysisAdapterError('research_json_invalid', 'company research did not return valid JSON', { cause: error });
  }
  if (!isRecord(value) || !Array.isArray(value.candidates)) {
    throw new AnalysisAdapterError('research_schema_invalid', 'company research JSON must contain summary and candidates');
  }
  if (options.requireBlankDecision && value.decision !== null) {
    throw new AnalysisAdapterError(
      'research_schema_invalid',
      'workflow research JSON must contain decision: null',
    );
  }
  assertKnownFields(
    value,
    options.requireBlankDecision ? WORKFLOW_RESEARCH_FIELDS : RESEARCH_FIELDS,
    'research_schema_invalid',
    'company research JSON',
  );
  const summary = options.requireBlankDecision
    ? parseWorkflowSummary(
        value.summary,
        options.workflowMaterials,
        options.workflowMethodApproved === true,
      )
    : typeof value.summary === 'string'
      ? value.summary.trim()
      : invalidResearchSummary();
  const relationValues = options.requireBlankDecision ? [] : value.relations ?? [];
  if (!Array.isArray(relationValues)) {
    throw new AnalysisAdapterError(
      'research_schema_invalid',
      'company research relations must be an array when present',
    );
  }
  return {
    summary,
    candidates: value.candidates.map(parseCandidate),
    relations: relationValues.map(parseRelation),
  };
}

function parseWorkflowSummary(
  value: unknown,
  workflowMaterials: readonly { sourceId: string; excerpt: string }[] | undefined,
  methodApproved: boolean,
): string {
  if (!Array.isArray(value)) {
    throw new AnalysisAdapterError(
      'research_schema_invalid',
      'workflow research summary must be a structured array',
    );
  }
  const materials = new Map(
    (workflowMaterials ?? []).map((material) => [material.sourceId, material.excerpt]),
  );
  return value.map((item, index) => {
    if (!isRecord(item)
      || typeof item.state !== 'string'
      || !WORKFLOW_SUMMARY_STATES.has(item.state)
      || typeof item.category !== 'string'
      || !WORKFLOW_CATEGORIES.has(item.category)) {
      throw new AnalysisAdapterError(
        'research_schema_invalid',
        `invalid workflow summary item at index ${index}`,
      );
    }
    const label = WORKFLOW_CATEGORY_LABELS[item.category];
    if (!label) throw new Error('workflow_category_label_missing');
    if (item.state === 'source_excerpt') {
      return parseSourceExcerpt(item, index, label, materials);
    }
    if (item.state === 'method_score') {
      return parseMethodScore(item, index, label, materials, methodApproved);
    }
    assertKnownFields(
      item,
      CONTROLLED_ITEM_FIELDS,
      'research_schema_invalid',
      `workflow summary item at index ${index}`,
    );
    return item.state === 'evidence_gap'
      ? `证据缺口：${label}相关材料未充分披露。`
      : `待确认问题：请负责人核验${label}相关事实与证据？`;
  }).join('\n');
}

function parseSourceExcerpt(
  item: Record<string, unknown>,
  index: number,
  label: string,
  materials: ReadonlyMap<string, string>,
): string {
  assertKnownFields(
    item,
    SOURCE_EXCERPT_FIELDS,
    'research_schema_invalid',
    `workflow summary item at index ${index}`,
  );
  if (typeof item.sourceId !== 'string' || typeof item.quote !== 'string') {
    throw new AnalysisAdapterError(
      'research_schema_invalid',
      `invalid workflow source excerpt at index ${index}`,
    );
  }
  const sourceId = item.sourceId.trim();
  const quote = normalizeExcerpt(item.quote);
  const sourceExcerpt = materials.get(sourceId);
  if (!sourceId || quote.length < 4 || quote.length > 600 || sourceExcerpt === undefined) {
    throw new AnalysisAdapterError(
      'research_schema_invalid',
      `workflow source excerpt at index ${index} is not from a frozen source`,
    );
  }
  if (!normalizeExcerpt(sourceExcerpt).includes(quote)) {
    throw new AnalysisAdapterError(
      'research_schema_invalid',
      `workflow source excerpt at index ${index} is not an exact material quote`,
    );
  }
  return `材料摘录（${label}）：${quote}`;
}

function parseMethodScore(
  item: Record<string, unknown>,
  index: number,
  label: string,
  materials: ReadonlyMap<string, string>,
  methodApproved: boolean,
): string {
  assertKnownFields(
    item,
    METHOD_SCORE_FIELDS,
    'research_schema_invalid',
    `workflow summary item at index ${index}`,
  );
  if (!methodApproved
    || typeof item.score !== 'number'
    || typeof item.scale !== 'number'
    || !Number.isFinite(item.score)
    || !Number.isFinite(item.scale)
    || item.scale <= 0
    || item.scale > 1000
    || item.score < 0
    || item.score > item.scale
    || typeof item.riskLevel !== 'string'
    || !RISK_LEVELS.has(item.riskLevel)
    || !Array.isArray(item.sourceIds)
    || item.sourceIds.some((sourceId) => typeof sourceId !== 'string')) {
    throw new AnalysisAdapterError(
      'research_schema_invalid',
      `invalid or unapproved workflow method score at index ${index}`,
    );
  }
  const sourceIds = [...new Set(item.sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean))];
  if (sourceIds.length === 0 || sourceIds.some((sourceId) => !materials.has(sourceId))) {
    throw new AnalysisAdapterError(
      'research_schema_invalid',
      `workflow method score at index ${index} references an unapproved source`,
    );
  }
  const riskLabel = {
    low: '低',
    medium: '中',
    high: '高',
    unknown: '待确认',
  }[item.riskLevel];
  return `已审批方法观察（${label}）：评分 ${item.score}/${item.scale}；风险等级 ${riskLabel}。`;
}

function normalizeExcerpt(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function invalidResearchSummary(): never {
  throw new AnalysisAdapterError(
    'research_schema_invalid',
    'company research summary must be a string',
  );
}

function parseCandidate(value: unknown, index: number): CompanyResearchCandidateDraft {
  if (!isRecord(value) || typeof value.knowledgeType !== 'string' || typeof value.statement !== 'string'
    || typeof value.highImpact !== 'boolean' || typeof value.sensitive !== 'boolean' || !Array.isArray(value.evidenceUrls)
    || value.evidenceUrls.some((url) => typeof url !== 'string')
    || (value.value !== undefined && typeof value.value !== 'string')
    || (value.effectiveAt !== undefined && typeof value.effectiveAt !== 'string')) {
    throw new AnalysisAdapterError('research_candidate_invalid', `invalid research candidate at index ${index}`);
  }
  assertKnownFields(
    value,
    RESEARCH_CANDIDATE_FIELDS,
    'research_candidate_invalid',
    `research candidate at index ${index}`,
  );
  const knowledgeType = value.knowledgeType.trim();
  const statement = value.statement.trim();
  const evidenceUrls = parseEvidenceUrls(
    value.evidenceUrls,
    'research_candidate_invalid',
    `research candidate at index ${index}`,
  );
  if (!knowledgeType || !statement || evidenceUrls.length === 0) {
    throw new AnalysisAdapterError('research_candidate_invalid', `empty research candidate at index ${index}`);
  }
  return {
    knowledgeType,
    statement,
    ...(typeof value.value === 'string' && value.value.trim() ? { value: value.value.trim() } : {}),
    ...(typeof value.effectiveAt === 'string' && value.effectiveAt.trim() ? { effectiveAt: value.effectiveAt.trim() } : {}),
    evidenceUrls,
    highImpact: value.highImpact,
    sensitive: value.sensitive,
  };
}

function parseRelation(value: unknown, index: number): CompanyResearchRelationDraft {
  if (!isRecord(value)
    || typeof value.targetName !== 'string'
    || !isResearchRelationCategory(value.category)
    || typeof value.relationType !== 'string'
    || typeof value.description !== 'string') {
    throw new AnalysisAdapterError(
      'research_relation_invalid',
      `invalid research relation at index ${index}`,
    );
  }
  assertKnownFields(
    value,
    RESEARCH_RELATION_FIELDS,
    'research_relation_invalid',
    `research relation at index ${index}`,
  );
  const targetName = value.targetName.trim();
  const relationType = value.relationType.trim();
  const description = value.description.trim();
  const evidenceUrls = parseEvidenceUrls(
    value.evidenceUrls,
    'research_relation_invalid',
    `research relation at index ${index}`,
  );
  if (!targetName || !relationType || !description) {
    throw new AnalysisAdapterError(
      'research_relation_invalid',
      `empty research relation at index ${index}`,
    );
  }
  return {
    targetName,
    category: value.category,
    relationType,
    description,
    evidenceUrls,
  };
}

function parseEvidenceUrls(
  value: unknown,
  code: string,
  label: string,
): string[] {
  if (!Array.isArray(value) || value.some((url) => typeof url !== 'string')) {
    throw new AnalysisAdapterError(code, `${label} has invalid evidenceUrls`);
  }
  const urls = [...new Set(value.map((url) => url.trim()).filter(Boolean))];
  if (urls.length === 0) {
    throw new AnalysisAdapterError(code, `${label} must cite at least one evidence URL`);
  }
  return urls;
}

function isResearchRelationCategory(
  value: unknown,
): value is CompanyResearchRelationCategory {
  return typeof value === 'string'
    && RESEARCH_RELATION_CATEGORIES.has(value as CompanyResearchRelationCategory);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertKnownFields(
  value: Record<string, unknown>,
  knownFields: ReadonlySet<string>,
  code: string,
  label: string,
): void {
  const unknownFields = Object.keys(value).filter((field) => !knownFields.has(field));
  if (unknownFields.length > 0) {
    throw new AnalysisAdapterError(
      code,
      `${label} contains unknown fields: ${unknownFields.join(', ')}`,
    );
  }
}

function extractJson(value: string): string {
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}
