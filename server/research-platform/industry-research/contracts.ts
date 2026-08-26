import type { WebSearchResultItem } from '../search/contracts.js';

export interface IndustryResearchMaterial {
  evidenceId: string;
  fileName: string;
  excerpt: string;
  locator?: string;
}

export interface IndustryResearchInput {
  taskId: string;
  conversationId: string;
  industryId: string;
  industryName: string;
  intent: string;
  industrySummary: string;
  nodes: Array<{
    stage: 'upstream' | 'midstream' | 'downstream';
    name: string;
    description?: string;
  }>;
  materials: IndustryResearchMaterial[];
  webResults: WebSearchResultItem[];
  sessionId?: string;
}

export interface IndustryResearchResult {
  providerId: string;
  modelId: string;
  sessionId: string;
  summary: string;
  rawText: string;
}

export interface IndustryResearchPort {
  analyze(input: IndustryResearchInput): Promise<IndustryResearchResult>;
}
