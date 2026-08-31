export const COMPANY_QUICK_CARD_CORE_TEXT_FIELDS = [
  { name: 'companyIdentity', label: '公司身份', prompt: '公司主体名称、所在地与成立时间' },
  { name: 'productTechnology', label: '产品 / 技术路线', prompt: '核心产品、技术路线与关键技术栈' },
  { name: 'industryTrack', label: '行业 / 赛道', prompt: '行业与细分赛道' },
  { name: 'marketView', label: '市场维度', prompt: '来源明确给出的市场需求、规模、渗透率或市场定位；不得外推' },
  { name: 'financing', label: '融资信息', prompt: '融资轮次、金额与估值' },
  { name: 'keyPeople', label: '团队关键人', prompt: '团队关键人、职位与团队规模' },
  { name: 'companyRegion', label: '公司区域', prompt: '公司主要经营所在地，使用城市或省份简称' },
  { name: 'financingStage', label: '融资阶段', prompt: '本轮或最近一轮融资阶段，如天使轮、Pre-A轮、A轮、B轮' },
] as const;

export const COMPANY_QUICK_CARD_COMMON_LIST_FIELDS = [
  { name: 'highlights', label: '公司亮点', prompt: '公司核心亮点，最多 3 项', maximum: 3 },
  { name: 'riskSignals', label: '初步风险', prompt: '材料或来源明确支持的风险与待验证缺口，最多 3 项，不作专业定级', maximum: 3 },
  { name: 'diligenceQuestions', label: '建议尽调问题', prompt: '针对当前信息缺口生成的具体尽调问题，最多 3 项', maximum: 3 },
  { name: 'industryTags', label: '基金匹配行业标签', prompt: '从允许的基金行业标签中选择与公司直接相关的标签', maximum: 5 },
] as const;

export const COMPANY_QUICK_CARD_COMMON_NUMBER_FIELDS = [
  { name: 'financingAmountWan', label: '融资金额（万元）', prompt: '本轮计划融资金额，统一换算为万元；未披露时返回 null' },
] as const;

export const COMPANY_QUICK_CARD_VIEW_TEXT_FIELDS = [
  { name: 'companyName', label: '公司', prompt: '公司简称或主体名称' },
  ...COMPANY_QUICK_CARD_CORE_TEXT_FIELDS,
] as const;

export type CompanyQuickCardCoreFields =
  Record<typeof COMPANY_QUICK_CARD_CORE_TEXT_FIELDS[number]['name'], string>
  & Record<typeof COMPANY_QUICK_CARD_COMMON_LIST_FIELDS[number]['name'], string[]>
  & Record<typeof COMPANY_QUICK_CARD_COMMON_NUMBER_FIELDS[number]['name'], number | null>;

export type CompanyQuickCardViewFields = CompanyQuickCardCoreFields & {
  companyName: string;
};
