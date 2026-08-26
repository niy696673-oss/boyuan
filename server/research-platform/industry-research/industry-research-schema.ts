import { AnalysisAdapterError } from '../analysis/contracts.js';

export function parseIndustryResearchJson(rawText: string): { summary: string } {
  let value: unknown;
  try {
    value = JSON.parse(extractJson(rawText));
  } catch (error) {
    throw new AnalysisAdapterError(
      'industry_research_json_invalid',
      'industry research did not return valid JSON',
      { cause: error },
    );
  }
  if (!isRecord(value) || typeof value.summary !== 'string' || !value.summary.trim()) {
    throw new AnalysisAdapterError(
      'industry_research_schema_invalid',
      'industry research JSON must contain a non-empty summary',
    );
  }
  return { summary: value.summary.trim() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractJson(value: string): string {
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}
