import type { ConversationRelatednessPort, RelatedConversationCandidate } from './contracts.js';

export function createDeterministicConversationRelatednessAdapter(): ConversationRelatednessPort {
  return {
    async suggest(input) {
      const ranked = input.candidates.map((candidate) => score(input.companyName, input.content, candidate))
        .sort((left, right) => right.score - left.score || left.candidate.conversationId.localeCompare(right.candidate.conversationId));
      const best = ranked[0];
      if (!best || best.score < 0.62) {
        return { providerId: 'deterministic-relatedness-demo', modelId: 'company-theme-v1', score: best?.score ?? 0, reason: '未发现足够相关的历史材料' };
      }
      return {
        providerId: 'deterministic-relatedness-demo',
        modelId: 'company-theme-v1',
        targetConversationId: best.candidate.conversationId,
        score: best.score,
        reason: best.sameCompany ? '公司主体一致，且材料主题存在关联' : '材料项目或研究主题高度相关',
      };
    },
  };
}

function score(companyName: string | undefined, content: string, candidate: RelatedConversationCandidate): {
  candidate: RelatedConversationCandidate; score: number; sameCompany: boolean;
} {
  const sameCompany = Boolean(companyName && candidate.companyName && normalize(companyName) === normalize(candidate.companyName));
  const currentTerms = terms(content);
  const candidateTerms = new Set(terms(candidate.content));
  const overlap = currentTerms.filter((term) => candidateTerms.has(term)).length / Math.max(1, Math.min(currentTerms.length, candidateTerms.size));
  return { candidate, sameCompany, score: Math.min(1, (sameCompany ? 0.65 : 0) + overlap * 0.35) };
}

function terms(value: string): string[] {
  const normalized = value.normalize('NFKC').toLowerCase();
  const latin = normalized.match(/[a-z0-9]{3,}/gu) ?? [];
  const han = normalized.match(/[\p{Script=Han}]{2,8}/gu) ?? [];
  return [...new Set([...latin, ...han])].slice(0, 200);
}

function normalize(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
}
