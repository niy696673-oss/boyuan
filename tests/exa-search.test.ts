// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createExaSearchAdapter } from '../server/research-platform/search/exa-search.js';

describe('Exa search adapter', () => {
  it('does not turn the 30 second performance target into a request deadline', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const search = createExaSearchAdapter({ apiKey: 'test-key', fetcher });

    await search.search({
      companyName: '白杨智能',
      reason: 'user_requested',
      query: '白杨智能 公司研究',
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeUndefined();
  });
});
