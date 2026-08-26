import type { IndustryResearchPort } from './contracts.js';

export function createDeterministicIndustryResearchAdapter(): IndustryResearchPort {
  return {
    async analyze(input) {
      const evidenceCount = input.materials.length + input.webResults.length;
      return {
        providerId: 'deterministic-test',
        modelId: 'industry-research-fixture-v1',
        sessionId: input.sessionId ?? `industry-research-${input.taskId}`,
        summary: `已围绕“${input.intent}”分析 ${input.industryName}，共使用 ${evidenceCount} 条可追溯来源。`,
        rawText: JSON.stringify({ deterministic: true, evidenceCount }),
      };
    },
  };
}
