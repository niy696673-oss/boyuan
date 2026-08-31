import type {
  FundMatchCandidate,
  FundMatchDimension,
  FundMatchProjectInput,
  FundMatchSummary,
  FundProfile,
} from './contracts.js';
import { MOCK_CHENGDU_FUND_SOURCE } from './mock-chengdu-funds.js';

const MISSING_MARKERS = ['材料未披露', '暂未检索到', '待主体确认', '未知', '未披露'];

export function matchFunds(
  input: FundMatchProjectInput,
  funds: FundProfile[],
): FundMatchSummary {
  const eligible = funds.filter((fund) => (
    fund.investmentPeriodActive
    && fund.capitalAvailable
    && fund.availableAmountWan >= fund.ticketMinWan
  ));
  const source = funds[0]?.source ?? MOCK_CHENGDU_FUND_SOURCE;
  const base = {
    eligibleFundCount: eligible.length,
    excludedFundCount: funds.length - eligible.length,
    source,
  };
  if (eligible.length === 0) {
    return { status: 'unavailable', alternatives: [], ...base };
  }
  if (!hasMatchingInput(input)) {
    return { status: 'insufficient_input', alternatives: [], ...base };
  }
  const candidates = eligible
    .map((fund) => scoreFund(input, fund))
    .sort((left, right) => right.score - left.score || left.fundId.localeCompare(right.fundId));
  return {
    status: 'matched',
    recommended: candidates[0],
    alternatives: candidates.slice(1, 3),
    ...base,
  };
}

function scoreFund(input: FundMatchProjectInput, fund: FundProfile): FundMatchCandidate {
  const dimensions = [
    industryDimension(input.industryTags, fund.industryPreferences),
    stageDimension(input.financingStage, fund.stagePreferences),
    ticketDimension(input.financingAmountWan, fund.ticketMinWan, fund.ticketMaxWan),
    regionDimension(input.companyRegion, fund.regionPreference),
    capacityDimension(input.financingAmountWan, fund.availableAmountWan),
  ];
  return {
    fundId: fund.fundId,
    fundName: fund.fundName,
    score: dimensions.reduce((sum, item) => sum + item.score, 0),
    dimensions,
  };
}

function industryDimension(projectTags: string[], preferences: string[]): FundMatchDimension {
  const project = new Set(projectTags.filter(isKnown).map(canonicalIndustry));
  const fund = new Set(preferences.map(canonicalIndustry));
  const matches = [...project].filter((tag) => fund.has(tag));
  return dimension(
    'industry',
    '投资领域',
    matches.length > 0 ? 40 : 0,
    40,
    project.size === 0
      ? '行业标签未披露'
      : matches.length > 0 ? `匹配：${matches.join('、')}` : '与基金主要投资领域不匹配',
  );
}

function stageDimension(stage: string, preferences: string[]): FundMatchDimension {
  if (!isKnown(stage)) return dimension('stage', '投资阶段', 0, 20, '融资阶段未披露');
  const normalized = canonicalStage(stage);
  const matched = preferences.some((item) => canonicalStage(item) === normalized);
  return dimension(
    'stage',
    '投资阶段',
    matched ? 20 : 0,
    20,
    matched ? `匹配：${stage}` : `项目为${stage}，不在基金偏好阶段内`,
  );
}

function ticketDimension(amount: number | null, minimum: number, maximum: number): FundMatchDimension {
  if (amount === null) return dimension('ticket', '单笔金额', 10, 20, '融资金额未披露');
  const matched = amount >= minimum && amount <= maximum;
  return dimension(
    'ticket',
    '单笔金额',
    matched ? 20 : 0,
    20,
    matched
      ? `融资 ${amount} 万元位于 ${minimum}–${maximum} 万元范围内`
      : `融资 ${amount} 万元超出 ${minimum}–${maximum} 万元范围`,
  );
}

function regionDimension(projectRegion: string, preference: string): FundMatchDimension {
  if (!isKnown(projectRegion)) return dimension('region', '投资区域', 5, 10, '公司区域未披露');
  if (preference === '全国' || (preference.includes('全国') && !preference.includes('为主'))) {
    return dimension('region', '投资区域', 10, 10, `区域可投：${projectRegion}`);
  }
  if (isChengduChongqing(projectRegion) && preference.includes('成渝')) {
    return dimension('region', '投资区域', 10, 10, `属于重点区域：${projectRegion}`);
  }
  if (preference.includes('面向全国')) {
    return dimension('region', '投资区域', 6, 10, `可投但非重点区域：${projectRegion}`);
  }
  return dimension('region', '投资区域', 0, 10, `不符合投资区域：${projectRegion}`);
}

function capacityDimension(amount: number | null, available: number): FundMatchDimension {
  if (amount === null) return dimension('capacity', '资金能力', 5, 10, '融资金额未披露');
  if (available >= amount * 2) {
    return dimension('capacity', '资金能力', 10, 10, `可投资金余额 ${available} 万元较充足`);
  }
  if (available >= amount) {
    return dimension('capacity', '资金能力', 8, 10, `可投资金余额 ${available} 万元可覆盖本轮融资`);
  }
  return dimension('capacity', '资金能力', 0, 10, `可投资金余额 ${available} 万元不足以覆盖本轮融资`);
}

function dimension(
  key: FundMatchDimension['key'],
  label: string,
  score: number,
  maxScore: number,
  summary: string,
): FundMatchDimension {
  return { key, label, score, maxScore, summary };
}

function hasMatchingInput(input: FundMatchProjectInput): boolean {
  return input.industryTags.some(isKnown)
    || isKnown(input.financingStage)
    || input.financingAmountWan !== null
    || isKnown(input.companyRegion);
}

function isKnown(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized) && !MISSING_MARKERS.some((marker) => normalized.includes(marker));
}

function canonicalIndustry(value: string): string {
  const normalized = value.toLowerCase().replace(/\s+/gu, '');
  if (
    normalized.includes('aiinfra')
    || normalized.includes('ai推理基础设施')
    || normalized.includes('算力基础设施')
    || normalized.includes('算力调度')
    || normalized.includes('异构算力')
  ) return 'AI推理基础设施';
  if (normalized.includes('physicalai') || normalized.includes('机器人传感')) {
    return '机器人传感/Physical AI';
  }
  return value.trim();
}

function canonicalStage(value: string): string {
  return value.toLowerCase().replace(/[\s-]+/gu, '').replace(/轮$/u, '');
}

function isChengduChongqing(value: string): boolean {
  return /成都|四川|重庆|成渝/u.test(value);
}
