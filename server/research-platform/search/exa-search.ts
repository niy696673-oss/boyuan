import type { WebSearchPort, WebSearchResultItem } from './contracts.js';
import { SearchAdapterError } from './contracts.js';

export interface ExaSearchOptions {
  apiKey: string;
  baseUrl?: URL;
  fetcher?: typeof fetch;
  now?: () => Date;
}

interface ExaResponse {
  results?: Array<{
    title?: unknown;
    url?: unknown;
    publishedDate?: unknown;
    highlights?: unknown;
    text?: unknown;
  }>;
}

export function createExaSearchAdapter(options: ExaSearchOptions): WebSearchPort {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? new URL('https://api.exa.ai');
  const now = options.now ?? (() => new Date());
  return {
    async search(input): Promise<WebSearchResultItem[]> {
      let response: Response;
      try {
        response = await fetcher(new URL('/search', baseUrl), {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-api-key': options.apiKey,
          },
          body: JSON.stringify({
            query: input.query,
            type: 'auto',
            numResults: input.maxResults ?? 5,
            contents: { highlights: true },
          }),
        });
      } catch (error) {
        throw new SearchAdapterError('exa_request_failed', 'Exa search request failed', { cause: error });
      }
      if (!response.ok) throw new SearchAdapterError('exa_http_error', `Exa returned HTTP ${response.status}`);
      let payload: ExaResponse;
      try {
        payload = await response.json() as ExaResponse;
      } catch (error) {
        throw new SearchAdapterError('exa_json_invalid', 'Exa returned invalid JSON', { cause: error });
      }
      if (!Array.isArray(payload.results)) throw new SearchAdapterError('exa_schema_invalid', 'Exa response has no results array');
      const retrievedAt = now().toISOString();
      return payload.results.flatMap((result) => {
        if (typeof result.url !== 'string' || !isHttpUrl(result.url)) return [];
        const highlights = Array.isArray(result.highlights)
          ? result.highlights.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
          : typeof result.text === 'string' && result.text.trim() ? [result.text.trim().slice(0, 1_200)] : [];
        const url = new URL(result.url);
        return [{
          title: typeof result.title === 'string' && result.title.trim() ? result.title.trim() : url.hostname,
          url: url.toString(),
          site: url.hostname,
          highlights,
          accessStatus: highlights.length ? 'accessible' : 'metadata_only',
          ...(typeof result.publishedDate === 'string' && result.publishedDate ? { publishedAt: result.publishedDate } : {}),
          retrievedAt,
        } satisfies WebSearchResultItem];
      });
    },
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
