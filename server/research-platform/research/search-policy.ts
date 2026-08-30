import type { SearchTriggerReason } from '../search/contracts.js';

export function researchSearchTrigger(
  explicit: boolean,
  knowledge: Array<{ status: string; created_at: string }>,
  now: Date,
): SearchTriggerReason | 'not_needed' {
  if (explicit) return 'user_requested';
  if (knowledge.some((item) => item.status === 'disputed')) return 'internal_conflict';
  if (knowledge.length === 0) return 'information_missing';
  const newest = Math.max(...knowledge.map((item) => Date.parse(item.created_at)).filter(Number.isFinite));
  if (!Number.isFinite(newest) || now.getTime() - newest > 90 * 24 * 60 * 60 * 1_000) return 'possibly_outdated';
  return 'not_needed';
}

export function planCompanyPublicQuery(
  companyName: string,
  intent: string,
): string {
  const terms = ['公司', '业务', '产品'];
  const dimensions: Array<{ pattern: RegExp; terms: string[] }> = [
    { pattern: /竞品|竞争|同类/u, terms: ['竞品', '竞争格局'] },
    { pattern: /上游|供应|供应链/u, terms: ['上游', '供应商'] },
    { pattern: /下游|客户|应用/u, terms: ['下游', '客户', '应用'] },
    { pattern: /最新|近期|进展|动态|融资/u, terms: ['最新', '进展', '融资'] },
  ];
  for (const dimension of dimensions) {
    if (dimension.pattern.test(intent)) terms.push(...dimension.terms);
  }
  if (!terms.includes('最新')) terms.push('最新', '融资');
  return [companyName, ...new Set(terms)].join(' ');
}
