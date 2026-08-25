import {
  BP_SECTION_KEYS,
  type KnowledgeCandidateDraft,
  type MaterialAnalysisInput,
  type MaterialAnalysisPort,
  type MaterialAnalysisResult,
} from './contracts.js';

export interface DeterministicAnalysisOptions {
  createCandidates?: (input: MaterialAnalysisInput) => KnowledgeCandidateDraft[];
}

export function createDeterministicAnalysisAdapter(options: DeterministicAnalysisOptions = {}): MaterialAnalysisPort {
  return {
    async analyze(input): Promise<MaterialAnalysisResult> {
      const first = input.blocks[0];
      const sections = BP_SECTION_KEYS.map((key, index) => {
        const block = key === 'industry_chain_position'
          ? input.blocks.find((candidate) => /产业链|产业.*(?:上游|中游|下游)|(?:行业|市场).*(?:上游|中游|下游)/u.test(candidate.text))
          : input.blocks[index];
        return {
          key,
          summary: block ? block.text : '材料未披露',
          blockIds: block ? [block.blockId] : [],
        };
      });
      const candidates = options.createCandidates?.(input) ?? (first ? [{
        sectionKey: 'company_and_project_stage',
        knowledgeType: 'company_summary',
        statement: `${input.companyName}：${first.text}`,
        blockIds: [first.blockId],
        highImpact: false,
        sensitive: false,
      }] : []);
      return {
        providerId: 'deterministic-test',
        modelId: 'fixture-v1',
        variant: 'deterministic',
        sessionId: `fixture-${input.taskId}`,
        toolUsage: [],
        sections,
        candidates,
        rawText: JSON.stringify({ sections, candidates }),
      };
    },
  };
}
