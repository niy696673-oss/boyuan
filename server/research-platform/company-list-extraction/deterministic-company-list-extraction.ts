import type { ParsedBlock } from '../parsers/contracts.js';
import type { CompanyListExtractionPort, CompanyNameExtraction } from './contracts.js';

const LEGAL_NAME = /[\p{Script=Han}A-Za-z0-9（）()·&]{2,80}?(?:股份有限公司|有限责任公司|有限公司)/gu;

export function createDeterministicCompanyListExtractionAdapter(): CompanyListExtractionPort {
  return {
    async extract(input) {
      const companies = input.blocks.flatMap(extractFromBlock);
      return {
        providerId: 'deterministic-company-list-demo',
        modelId: 'free-layout-v1',
        companies: deduplicate(companies),
      };
    },
  };
}

function extractFromBlock(block: ParsedBlock): CompanyNameExtraction[] {
  const normalized = block.text.normalize('NFKC');
  const matches = [...normalized.matchAll(LEGAL_NAME)].map((match) => cleanCompanyName(match[0]));
  const names = matches.length ? matches : normalized
    .split(/[\t,，;；|、]/gu)
    .map(cleanCompanyName)
    .filter((value) => /(?:公司|集团|研究院|中心)$/u.test(value)
      || (block.kind === 'table_cell' && /(?:科技|智能|产业|创新|资本|投资|医药|数据|能源|机器人|网络)/u.test(value)));
  return [...new Set(names.filter((name) => name.length >= 2 && name.length <= 80))].map((name) => ({
    name,
    blockId: block.blockId,
    originalText: block.text,
  }));
}

function cleanCompanyName(value: string): string {
  return value
    .replace(/^[\s\d０-９一二三四五六七八九十百]+(?:名|位|、|[.．:：)）-])?\s*/u, '')
    .replace(/^(?:排名|序号|企业名称|公司名称|项目名称)\s*[:：]?\s*/u, '')
    .replace(/\s+/gu, '')
    .replace(/^[^\p{L}]+|[^\p{L}\p{N}（）()·&]+$/gu, '');
}

function deduplicate(values: CompanyNameExtraction[]): CompanyNameExtraction[] {
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = `${item.blockId}:${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
