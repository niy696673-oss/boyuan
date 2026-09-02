import {
  AnalysisAdapterError,
  BP_SECTION_KEYS,
  type AnalysisPersonDraft,
  type AnalysisRelationCategory,
  type AnalysisRelationDraft,
  type AnalysisSectionDraft,
  type BpSectionKey,
  type KnowledgeCandidateDraft,
} from './contracts.js';

export interface ValidatedAnalysisPayload {
  sections: AnalysisSectionDraft[];
  candidates: KnowledgeCandidateDraft[];
  people: AnalysisPersonDraft[];
  relations: AnalysisRelationDraft[];
}

export function parseAnalysisJson(rawText: string): ValidatedAnalysisPayload {
  let value: unknown;
  try {
    value = JSON.parse(extractJson(rawText));
  } catch (error) {
    throw new AnalysisAdapterError('analysis_json_invalid', 'analysis did not return valid JSON', { cause: error });
  }
  if (!isRecord(value) || !Array.isArray(value.sections) || !Array.isArray(value.candidates)) {
    throw new AnalysisAdapterError('analysis_schema_invalid', 'analysis JSON must contain sections and candidates');
  }
  const people = value.people ?? [];
  const relations = value.relations ?? [];
  if (!Array.isArray(people) || !Array.isArray(relations)) {
    throw new AnalysisAdapterError('analysis_schema_invalid', 'analysis people and relations must be arrays when present');
  }
  const sections = value.sections.map(parseSection);
  const keys = sections.map((section) => section.key);
  if (keys.length !== BP_SECTION_KEYS.length || BP_SECTION_KEYS.some((key, index) => keys[index] !== key)) {
    throw new AnalysisAdapterError('analysis_sections_invalid', 'analysis must return all 13 sections in the required order');
  }
  return {
    sections,
    candidates: value.candidates.map(parseCandidate),
    people: people.map(parsePerson),
    relations: relations.map(parseRelation),
  };
}

function parseSection(value: unknown, index: number): AnalysisSectionDraft {
  if (!isRecord(value) || !isSectionKey(value.key) || typeof value.summary !== 'string') {
    throw new AnalysisAdapterError('analysis_section_invalid', `invalid analysis section at index ${index}`);
  }
  return { key: value.key, summary: value.summary.trim(), blockIds: parseBlockIds(value.blockIds, `section ${value.key}`) };
}

function parseCandidate(value: unknown, index: number): KnowledgeCandidateDraft {
  if (!isRecord(value) || !isSectionKey(value.sectionKey) || typeof value.knowledgeType !== 'string'
    || typeof value.statement !== 'string' || typeof value.highImpact !== 'boolean' || typeof value.sensitive !== 'boolean') {
    throw new AnalysisAdapterError('analysis_candidate_invalid', `invalid candidate at index ${index}`);
  }
  const knowledgeType = value.knowledgeType.trim();
  const statement = value.statement.trim();
  if (!knowledgeType || !statement) throw new AnalysisAdapterError('analysis_candidate_invalid', `empty candidate at index ${index}`);
  return {
    sectionKey: value.sectionKey,
    knowledgeType,
    statement,
    ...(typeof value.value === 'string' && value.value.trim() ? { value: value.value.trim() } : {}),
    ...(typeof value.effectiveAt === 'string' && value.effectiveAt.trim() ? { effectiveAt: value.effectiveAt.trim() } : {}),
    blockIds: parseBlockIds(value.blockIds, `candidate ${index}`),
    highImpact: value.highImpact,
    sensitive: value.sensitive,
  };
}

function parsePerson(value: unknown, index: number): AnalysisPersonDraft {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.role !== 'string'
    || typeof value.summary !== 'string') {
    throw new AnalysisAdapterError('analysis_person_invalid', `invalid person at index ${index}`);
  }
  const name = value.name.trim();
  const role = value.role.trim();
  const summary = value.summary.trim();
  if (!name || !role || !summary) {
    throw new AnalysisAdapterError('analysis_person_invalid', `empty person field at index ${index}`);
  }
  return {
    name,
    role,
    summary,
    blockIds: parseRequiredBlockIds(value.blockIds, `person ${index}`),
  };
}

function parseRelation(value: unknown, index: number): AnalysisRelationDraft {
  if (!isRecord(value) || typeof value.targetName !== 'string' || !isRelationCategory(value.category)
    || typeof value.relationType !== 'string' || typeof value.description !== 'string') {
    throw new AnalysisAdapterError('analysis_relation_invalid', `invalid relation at index ${index}`);
  }
  const targetName = value.targetName.trim();
  const relationType = value.relationType.trim();
  const description = value.description.trim();
  if (!targetName || !relationType || !description) {
    throw new AnalysisAdapterError('analysis_relation_invalid', `empty relation field at index ${index}`);
  }
  return {
    targetName,
    category: value.category,
    relationType,
    description,
    blockIds: parseRequiredBlockIds(value.blockIds, `relation ${index}`),
  };
}

function parseBlockIds(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new AnalysisAdapterError('analysis_evidence_invalid', `${context} has invalid blockIds`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function parseRequiredBlockIds(value: unknown, context: string): string[] {
  const blockIds = parseBlockIds(value, context);
  if (blockIds.length === 0) {
    throw new AnalysisAdapterError('analysis_evidence_invalid', `${context} must cite at least one blockId`);
  }
  return blockIds;
}

function isSectionKey(value: unknown): value is BpSectionKey {
  return typeof value === 'string' && (BP_SECTION_KEYS as readonly string[]).includes(value);
}

function isRelationCategory(value: unknown): value is AnalysisRelationCategory {
  return value === 'upstream' || value === 'downstream' || value === 'customer' || value === 'competitor';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractJson(value: string): string {
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}
