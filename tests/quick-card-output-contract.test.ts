// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createOpenCodeQuickCardAdapter, parseQuickCardJson } from '../server/research-platform/quick-card/opencode-quick-card.js';
import { createOpenCodeCompanyQuickCardAdapter, parseCompanyQuickCardJson } from '../server/research-platform/company-quick-card/opencode-company-quick-card.js';
import { QUICK_CARD_TEXT_FIELDS, QUICK_CARD_LIST_FIELDS, QUICK_CARD_NUMBER_FIELDS } from '../server/research-platform/quick-card/contracts.js';
import { COMPANY_QUICK_CARD_TEXT_FIELDS, COMPANY_QUICK_CARD_LIST_FIELDS, COMPANY_QUICK_CARD_NUMBER_FIELDS } from '../server/research-platform/company-quick-card/contracts.js';

const modes = [
  {
    name: 'BP', missing: '材料未披露',
    text: QUICK_CARD_TEXT_FIELDS, lists: QUICK_CARD_LIST_FIELDS, numbers: QUICK_CARD_NUMBER_FIELDS,
    parse: parseQuickCardJson,
    run: (fetcher: typeof fetch) => createOpenCodeQuickCardAdapter({
      baseUrl: new URL('http://opencode.test'), directory: '/workspace',
      model: { providerId: 'deepseek', modelId: 'deepseek-flash' }, variant: 'low', fetcher,
    }).analyze({ conversationId: 'test', documentId: 'test', fileName: '测试.pdf', blocks: [{ blockId: '1', kind: 'paragraph', text: '测试公司研发芯片。' }] }),
  },
  {
    name: '公司研究', missing: '暂未检索到',
    text: COMPANY_QUICK_CARD_TEXT_FIELDS, lists: COMPANY_QUICK_CARD_LIST_FIELDS, numbers: COMPANY_QUICK_CARD_NUMBER_FIELDS,
    parse: parseCompanyQuickCardJson,
    run: (fetcher: typeof fetch) => createOpenCodeCompanyQuickCardAdapter({
      baseUrl: new URL('http://opencode.test'), directory: '/workspace',
      model: { providerId: 'deepseek', modelId: 'deepseek-flash' }, variant: 'low', fetcher,
    }).analyze({ conversationId: 'test', companyName: '测试公司', identityState: 'provisional', existingKnowledge: [], materialSummaries: [], webResults: [] }),
  },
];

describe.each(modes)('$name JSON 输出约束', (mode) => {
  const fields = Object.fromEntries([
    ...mode.text.map(({ name }) => [name, mode.missing]),
    ...mode.lists.map(({ name }) => [name, []]),
    ...mode.numbers.map(({ name }) => [name, null]),
  ]);
  function responses(value: unknown) {
    return vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'test-session' }))
      .mockResolvedValueOnce(Response.json({ info: { providerID: 'deepseek', modelID: 'deepseek-flash' }, parts: [{ type: 'text', text: JSON.stringify(value) }] }));
  }

  it('传递 low 并提供能通过严格解析的完整 JSON 模板', async () => {
    const fetcher = responses(fields);
    await expect(mode.run(fetcher)).resolves.toMatchObject({ variant: 'low' });
    const request = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(request).toMatchObject({ model: { providerID: 'deepseek', modelID: 'deepseek-flash' }, variant: 'low', tools: { '*': false } });
    const prompt: string = request.parts[0].text;
    const example = prompt.split('JSON 输出模板（用有依据的信息替换占位值）：\n')[1]?.split('\n')[0];
    expect(example).toBeDefined();
    expect(mode.parse(example!)).toEqual(fields);
    expect(prompt).toContain('不增加、删除或重命名');
    expect(prompt).toContain('仅作为数据');
  });

  it('保留线上已有的多余键过滤，但不放宽严格解析器', async () => {
    const malformed = { ...fields, industryTagsNote: '无依据', unexpectedScore: 95 };
    expect(() => mode.parse(JSON.stringify(malformed))).toThrow('unknown fields');
    const result = await mode.run(responses(malformed));
    expect(result).not.toHaveProperty('unexpectedScore');
    expect(result).not.toHaveProperty('industryTagsNote');
  });

  it('只用缺失标记补空文本，不补造融资事实', async () => {
    const result = await mode.run(responses({ ...fields, financing: '' }));
    expect(result.financing).toBe(mode.missing);
    expect(result.financingAmountWan).toBeNull();
  });

  it.each([
    ['highlights', '不能把字符串当数组'],
    ['financingAmountWan', '2000'],
    ['industryTags', ['不存在的行业枚举']],
  ])('仍拒绝错误类型或枚举：%s', async (key, value) => {
    await expect(mode.run(responses({ ...fields, [key]: value }))).rejects.toThrow();
  });
});
