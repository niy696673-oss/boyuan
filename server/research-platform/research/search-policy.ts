import type { CompanyQuickCardFields } from '../company-quick-card/contracts.js';
import type { SearchTriggerReason } from '../search/contracts.js';

export function researchSearchTrigger(
  explicit: boolean,
  knowledge: Array<{ status: string; created_at: string }>,
  now: Date,
): SearchTriggerReason | 'not_needed' {
  if (explicit) return 'user_requested';
  if (knowledge.some((item) => item.status === 'disputed')) return 'internal_conflict';
  if (knowledge.length === 0) return 'information_missing';
  const newest = Math.max(...knowledge.map((item) => Date.parse(item.created_at)).filter(Number.isFinite));
  if (!Number.isFinite(newest) || now.getTime() - newest > 90 * 24 * 60 * 60 * 1_000) return 'possibly_outdated';
  return 'not_needed';
}

// Only public dimensions cross the search boundary; raw conversation text may
// include private contacts, document excerpts or internal project names.
const dimensions: Array<{ pattern: RegExp; terms: string[]; fields: Array<keyof CompanyQuickCardFields> }> = [
  { pattern: /业务|产品|技术|做什么|主营|business|product/iu, terms: ['主营业务', '核心产品'], fields: ['productTechnology'] },
  { pattern: /竞品|竞争|同类|competitor/iu, terms: ['竞品', '竞争格局'], fields: ['competitorNames'] },
  { pattern: /上游|供应|供应链|supplier/iu, terms: ['上游', '供应商'], fields: ['upstreamNames'] },
  { pattern: /下游|客户|应用|customer/iu, terms: ['下游', '客户', '应用'], fields: ['downstreamNames'] },
  { pattern: /最新|近期|进展|动态|recent|latest/iu, terms: ['最新', '公开进展'], fields: ['recentSignals'] },
  { pattern: /融资|估值|funding|valuation/iu, terms: ['融资', '金额', '估值', '日期'], fields: ['financing'] },
  { pattern: /团队|创始人|管理层|关键人|founder|team/iu, terms: ['创始人', '管理层'], fields: ['keyPeople'] },
  { pattern: /所在地|总部|地址|headquarter/iu, terms: ['总部', '所在地'], fields: ['companyRegion'] },
  { pattern: /风险|问题|挑战|risk/iu, terms: ['业务风险', '年报风险因素'], fields: ['riskSignals'] },
  { pattern: /市场|规模|份额|market/iu, terms: ['市场', '规模', '份额'], fields: ['marketView'] },
];

export function planCompanyPublicQuery(companyName: string, intent: string): string {
  const terms = ['公司简介', '主营业务', '核心产品', '官网', '投资者关系'];
  for (const dimension of dimensions) if (dimension.pattern.test(intent)) terms.push(...dimension.terms);
  return [companyName, ...new Set(terms)].join(' ');
}

export function planCompanyFollowUp(companyName: string, focus: string, fields: CompanyQuickCardFields): string | undefined {
  const terms: string[] = [];
  if (missing(fields.companyIdentity)) terms.push('公司主体', '公司简介');
  if (missing(fields.productTechnology)) terms.push('主营业务', '核心产品');
  if (missing(fields.industryTrack)) terms.push('行业');
  for (const dimension of dimensions) {
    if (dimension.pattern.test(focus) && dimension.fields.some(field => missing(fields[field]))) terms.push(...dimension.terms);
  }
  return terms.length ? [companyName, ...new Set(terms), '官网', '年报', '公开披露'].join(' ') : undefined;
}

function missing(value: CompanyQuickCardFields[keyof CompanyQuickCardFields]): boolean {
  if (Array.isArray(value)) return value.length === 0 || value.every(item => missing(item));
  return value == null || (typeof value === 'string' && (!value.trim() || /暂未|未检索到|未披露|待核验|待确认|不详|未知|暂无|无法确认|资料不足/u.test(value)));
}
