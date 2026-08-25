export type SemanticEntityType = 'company' | 'material' | 'conversation' | 'industry';

export interface SemanticCorpusEvidence {
  evidenceId: string;
  quote: string;
}

export interface SemanticCorpusItem {
  id: string;
  type: SemanticEntityType;
  title: string;
  content: string;
  evidence: SemanticCorpusEvidence[];
}

export interface SemanticSearchInput {
  query: string;
  items: SemanticCorpusItem[];
  limit: number;
}

export interface SemanticSearchHit {
  id: string;
  type: SemanticEntityType;
  score: number;
  reason: string;
  evidenceIds: string[];
}

export interface SemanticSearchOutput {
  providerId: string;
  modelId: string;
  hits: SemanticSearchHit[];
}

export interface SemanticSearchPort {
  search(input: SemanticSearchInput): Promise<SemanticSearchOutput>;
}

export class SemanticSearchAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SemanticSearchAdapterError';
    this.code = code;
  }
}
