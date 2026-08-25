import type { ParsedBlock } from '../parsers/contracts.js';

export interface CompanyNameExtraction {
  name: string;
  blockId: string;
  originalText: string;
}

export interface CompanyListExtractionInput {
  fileName: string;
  blocks: ParsedBlock[];
}

export interface CompanyListExtractionOutput {
  providerId: string;
  modelId: string;
  companies: CompanyNameExtraction[];
}

export interface CompanyListExtractionPort {
  extract(input: CompanyListExtractionInput): Promise<CompanyListExtractionOutput>;
}

export class CompanyListExtractionError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CompanyListExtractionError';
    this.code = code;
  }
}
