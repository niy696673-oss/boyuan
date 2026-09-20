// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDeepSeekSearchAdapter } from '../server/research-platform/search/deepseek-search.js';
import { createRuntimeResearchAdapters } from '../server/research-platform/research/runtime-research.js';

const company = { companyName: '腾讯', query: '腾讯 主营业务 官网', reason: 'user_requested' as const, maxResults: 5 };
const urls = ['https://www.tencent.com/about', 'https://www.tencent.com/products'];
function response(text: string, stop = 'end_turn') {
  return { stop_reason: stop, content: [
    { type: 'text', text: '我来检索腾讯，稍后提供结果。' },
    { type: 'web_search_tool_result', content: urls.map(url => ({ type: 'web_search_result', url, title: '公开信息', encrypted_content: 'opaque' })) },
    { type: 'text', text },
  ] };
}
function search(payload: unknown) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
  const adapter = createDeepSeekSearchAdapter({ apiKey: 'test', fetcher });
  return { run: () => adapter.search(company), fetcher };
}
describe('DeepSeek 搜索证据', () => {
  it('保留逐来源的主营业务，不将同一开场白复制到每个网页', async () => {
    const test = search(response(JSON.stringify({ sources: [
      { url: urls[0], highlights: ['腾讯提供增值服务、营销服务、金融科技及企业服务。'] },
      { url: urls[1], highlights: ['产品包括微信、QQ及腾讯云。'] },
    ] })));
    const results = await test.run();
    expect(results[0]?.highlights.join('')).toContain('增值服务');
    expect(results[1]?.highlights.join('')).toContain('腾讯云');
    expect(results[1]?.highlights.join('')).not.toContain('增值服务');
    expect(results.every(x => !x.highlights.join('').includes('我来'))).toBe(true);
    const body = JSON.parse(String(test.fetcher.mock.calls[0]?.[1]?.body));
    expect(body.tools[0].type).toBe('web_search_20250305');
    expect(body.messages[0].content).toContain('主营业务');
    expect(body.system).toContain('非逐字引文');
    expect(test.fetcher.mock.calls[0]?.[1]?.signal).toBeDefined();
  });
  it('无来源的综合总结、伪造 URL 和截断 JSON 不冒充网页摘录', async () => {
    for (const payload of [
      response('以下是腾讯资料。\n\n腾讯提供增值服务。'),
      response(JSON.stringify({ sources: [{ url: 'https://fake.example/fact', highlights: ['伪造事实'] }] })),
      response('{"sources":[{"url":"https://www.tencent.com/about","highlights":["部分', 'max_tokens'),
    ]) {
      const results = await search(payload).run();
      expect(results.every(x => x.accessStatus === 'metadata_only' && x.highlights.length === 0)).toBe(true);
    }
  });
  it('去重 URL 和重复摘要，先选有实质信息的来源，拒绝工具调用前的 JSON', async () => {
    const payload = response(JSON.stringify({ sources: [
      { url: urls[1], highlights: ['微信是通信产品。', '微信是通信产品。'] },
      { url: urls[1] + '#section', highlights: ['QQ是通信产品。'] },
    ] }));
    payload.content.unshift({ type: 'text', text: JSON.stringify({ sources: [{ url: urls[0], highlights: ['前置猜测'] }] }) });
    const results = await search(payload).run();
    expect(results[0]?.url).toBe(urls[1]);
    expect(results[0]?.highlights.filter(x => x.includes('微信'))).toHaveLength(1);
    expect(results.flatMap(x => x.highlights).join('')).not.toContain('前置猜测');
  });
  it('运行时注册 DeepSeek 并使用独立搜索密钥与模型', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response('{"sources":[]}')));
    const { search } = createRuntimeResearchAdapters({ BOYUAN_SEARCH_ADAPTER: 'deepseek', DEEPSEEK_SEARCH_API_KEY: 'dedicated', DEEPSEEK_SEARCH_MODEL: 'search-model' }, { directory: '/tmp', fetcher });
    await search.search(company);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-api-key': 'dedicated' });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).model).toBe('search-model');
  });
});
