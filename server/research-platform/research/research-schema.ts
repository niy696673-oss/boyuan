import { AnalysisAdapterError } from '../analysis/contracts.js';
import type { CompanyResearchCandidateDraft } from './contracts.js';

export function parseResearchJson(rawText: string): { summary: string; candidates: CompanyResearchCandidateDraft[] } {
  let value: unknown;
  try {
    value = JSON.parse(extractJson(rawText));
  } catch (error) {
    throw new AnalysisAdapterError('research_json_invalid', 'company research did not return valid JSON', { cause: error });
  }
  if (!isRecord(value) || typeof value.summary !== 'string' || !Array.isArray(value.candidates)) {
    throw new AnalysisAdapterError('research_schema_invalid', 'company research JSON must contain summary and candidates');
  }
  return { summary: value.summary.trim(), candidates: value.candidates.map(parseCandidate) };
}

function parseCandidate(value: unknown, index: number): CompanyResearchCandidateDraft {
  if (!isRecord(value) || typeof value.knowledgeType !== 'string' || typeof value.statement !== 'string'
    || typeof value.highImpact !== 'boolean' || typeof value.sensitive !== 'boolean' || !Array.isArray(value.evidenceUrls)) {
    throw new AnalysisAdapterError('research_candidate_invalid', `invalid research candidate at index ${index}`);
  }
  const knowledgeType = value.knowledgeType.trim();
  const statement = value.statement.trim();
  const evidenceUrls = [...new Set(value.evidenceUrls.filter((url): url is string => typeof url === 'string').map((url) => url.trim()).filter(Boolean))];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractJson(value: string): string {
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}
