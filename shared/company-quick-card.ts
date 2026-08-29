export const COMPANY_QUICK_CARD_CORE_TEXT_FIELDS = [
  { name: 'companyIdentity', label: '公司身份', prompt: '公司主体名称、所在地与成立时间' },
  { name: 'industryTrack', label: '行业 / 赛道', prompt: '行业与细分赛道' },
  { name: 'financing', label: '融资信息', prompt: '融资轮次、金额与估值' },
  { name: 'keyPeople', label: '团队关键人', prompt: '团队关键人、职位与团队规模' },
] as const;

export const COMPANY_QUICK_CARD_COMMON_LIST_FIELDS = [
  { name: 'highlights', label: '公司亮点', prompt: '公司核心亮点，最多 3 项', maximum: 3 },
] as const;

export const COMPANY_QUICK_CARD_VIEW_TEXT_FIELDS = [
  { name: 'companyName', label: '公司', prompt: '公司简称或主体名称' },
  ...COMPANY_QUICK_CARD_CORE_TEXT_FIELDS,
] as const;

export type CompanyQuickCardCoreFields =
  Record<typeof COMPANY_QUICK_CARD_CORE_TEXT_FIELDS[number]['name'], string>
  & Record<typeof COMPANY_QUICK_CARD_COMMON_LIST_FIELDS[number]['name'], string[]>;

export type CompanyQuickCardViewFields = CompanyQuickCardCoreFields & {
  companyName: string;
};
