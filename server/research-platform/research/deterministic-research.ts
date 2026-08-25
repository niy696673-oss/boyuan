import type { CompanyResearchPort } from './contracts.js';

export function createDeterministicResearchAdapter(): CompanyResearchPort {
  return {
    async analyze(input) {
      const source = input.webResults.find((result) => result.highlights.length > 0);
      return {
        providerId: 'deterministic-test',
        modelId: 'research-fixture-v1',
        sessionId: input.sessionId ?? `research-${input.taskId}`,
        summary: source ? `已根据公开来源核验 ${input.companyName}。` : `已根据现有正式知识分析 ${input.companyName}。`,
        candidates: source ? [{
          knowledgeType: 'external_company_update',
          statement: source.highlights[0] ?? source.title,
          evidenceUrls: [source.url],
          highImpact: false,
          sensitive: false,
        }] : [],
        rawText: JSON.stringify({ deterministic: true }),
      };
    },
  };
}
