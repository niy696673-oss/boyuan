import type { WebSearchPort } from './contracts.js';

export function createDeterministicSearchAdapter(): WebSearchPort {
  return {
    async search(input) {
      const slug = encodeURIComponent(input.companyName);
      return [{
        title: `${input.companyName}公开信息`,
        url: `https://example.com/companies/${slug}`,
        site: 'example.com',
        highlights: [`${input.companyName}的公开信息已获取，触发原因为 ${input.reason}。`],
        accessStatus: 'accessible' as const,
        retrievedAt: '2026-08-24T00:00:00.000Z',
      }];
    },
  };
}
