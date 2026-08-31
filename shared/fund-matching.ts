export const FUND_INDUSTRY_TAGS = [
  'AI推理基础设施',
  '机器人传感/Physical AI',
  '商业航天高可靠电子',
  '量子科技',
  '半导体设备核心零部件',
  'HBM/先进封装',
  'CPO/光互连/高速网络',
  '新型显示与光电子',
] as const;

export interface FundMatchProjectInput {
  industryTags: string[];
  financingStage: string;
  financingAmountWan: number | null;
  companyRegion: string;
}

export interface FundMatchSource {
  fileName: string;
  asOfDate: string;
  simulated: boolean;
}

export interface FundProfile {
  fundId: string;
  fundName: string;
  fundType: string;
  establishedOn: string;
  investmentPeriodEnd: string;
  maturityOn: string;
  committedAmountWan: number;
  paidInAmountWan: number;
  investedAmountWan: number;
  availableAmountWan: number;
  totalAssetsWan: number;
  netAssetsWan: number;
  investorCount: number;
  investmentPeriodActive: boolean;
  capitalAvailable: boolean;
  ticketMinWan: number;
  concentrationLimit: number;
  ticketMaxWan: number;
  industryPreferences: string[];
  stagePreferences: string[];
  regionPreference: string;
  source: FundMatchSource;
}

export type FundMatchDimensionKey = 'industry' | 'stage' | 'ticket' | 'region' | 'capacity';

export interface FundMatchDimension {
  key: FundMatchDimensionKey;
  label: string;
  score: number;
  maxScore: number;
  summary: string;
}

export interface FundMatchCandidate {
  fundId: string;
  fundName: string;
  score: number;
  dimensions: FundMatchDimension[];
}

export interface FundMatchSummary {
  status: 'matched' | 'insufficient_input' | 'unavailable';
  recommended?: FundMatchCandidate;
  alternatives: FundMatchCandidate[];
  eligibleFundCount: number;
  excludedFundCount: number;
  source: FundMatchSource;
}
