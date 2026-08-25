export type SearchTriggerReason = 'user_requested' | 'information_missing' | 'possibly_outdated' | 'internal_conflict';

export interface WebSearchInput {
  companyName: string;
  reason: SearchTriggerReason;
  query: string;
  maxResults?: number;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  site: string;
  highlights: string[];
  accessStatus: 'accessible' | 'metadata_only';
  publishedAt?: string;
  retrievedAt: string;
}

export interface WebSearchPort {
  search(input: WebSearchInput): Promise<WebSearchResultItem[]>;
}

export class SearchAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SearchAdapterError';
    this.code = code;
  }
}
