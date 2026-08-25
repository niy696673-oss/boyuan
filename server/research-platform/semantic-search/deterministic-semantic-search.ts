import type {
  SemanticCorpusItem,
  SemanticSearchHit,
  SemanticSearchPort,
} from './contracts.js';

const CONCEPTS = [
  ['人工智能', 'AI', '智能化', '智能决策', '机器学习'],
  ['融资', '募资', '投资', '估值', '资金'],
  ['产业链', '供应链', '上游', '中游', '下游'],
  ['客户', '用户', '采购方', '订单'],
  ['创始人', '创始团队', '核心团队', '管理层'],
  ['竞争对手', '竞品', '对标公司', '可比公司'],
] as const;

export function createDeterministicSemanticSearchAdapter(): SemanticSearchPort {
  return {
    async search(input) {
      const hits = input.items
        .map((item) => scoreItem(input.query, item))
        .filter((hit): hit is SemanticSearchHit => Boolean(hit))
        .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
        .slice(0, input.limit);
      return { providerId: 'deterministic-semantic-demo', modelId: 'concept-retrieval-v1', hits };
    },
  };
}

function scoreItem(query: string, item: SemanticCorpusItem): SemanticSearchHit | undefined {
  const normalizedQuery = normalize(query);
  const haystack = normalize(`${item.title} ${item.content}`);
  const queryTerms = expandConcepts(normalizedQuery);
  const matched = queryTerms.filter((term) => haystack.includes(term));
  if (matched.length === 0) return undefined;
  const exact = haystack.includes(normalizedQuery);
  const score = Math.min(1, (exact ? 0.75 : 0.45) + (matched.length / queryTerms.length) * 0.25);
  const evidence = item.evidence.filter((candidate) => {
    const quote = normalize(candidate.quote);
    return queryTerms.some((term) => quote.includes(term));
  });
  return {
    id: item.id,
    type: item.type,
    score,
    reason: exact ? `内容直接涉及“${query.trim()}”` : `语义关联：${matched.slice(0, 3).join('、')}`,
    evidenceIds: (evidence.length ? evidence : item.evidence).slice(0, 3).map((candidate) => candidate.evidenceId),
  };
}

function expandConcepts(query: string): string[] {
  const terms = new Set([query]);
  for (const group of CONCEPTS) {
    if (group.some((term) => query.includes(normalize(term)))) {
      group.forEach((term) => terms.add(normalize(term)));
    }
  }
  return [...terms].filter(Boolean);
}

function normalize(value: string): string {
  return value.normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '').toLowerCase();
}
