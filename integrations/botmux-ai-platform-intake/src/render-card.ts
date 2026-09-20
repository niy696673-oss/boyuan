import { renderCompletionCard } from './intake-delivery.js';
import { parseCompanyQuickCard, parseQuickCard } from './platform-client.js';

/** Offline JSON boundary shared by benchmarks; never invent missing facts or fund scores. */
export function renderApiResult(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_card_input');
  const input = value as Record<string, unknown>;
  const links = { deepAnalysisUrl: '' };
  if (input.kind === 'bp') return renderCompletionCard({ kind: 'bp', result: parseQuickCard(input.result), links });
  if (input.kind === 'company_research') return renderCompletionCard({ kind: 'company_research', result: parseCompanyQuickCard(input.result), links });
  throw new Error('invalid_card_kind');
}
