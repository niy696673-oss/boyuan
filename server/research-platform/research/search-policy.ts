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
