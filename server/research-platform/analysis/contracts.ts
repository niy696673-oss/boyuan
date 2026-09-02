import type { ParsedBlock } from '../parsers/contracts.js';

export const BP_SECTION_KEYS = [
  'company_and_project_stage',
  'founders_team_and_governance',
  'product_portfolio',
  'core_technology_and_ip',
  'technology_readiness_and_production',
  'industry_market_and_policy',
  'industry_chain_position',
  'customers_orders_and_scenarios',
  'supply_chain_and_partners',
  'business_model_and_competition',
  'financing_valuation_equity_and_use',
  'financial_operations_plans_risks',
  'provenance_versions_conflicts_confirmations',
] as const;

export type BpSectionKey = typeof BP_SECTION_KEYS[number];

export const BP_SECTION_TITLES: Record<BpSectionKey, string> = {
  company_and_project_stage: '01 公司主体与项目阶段',
  founders_team_and_governance: '02 创始人、团队与治理',
  product_portfolio: '03 产品矩阵',
  core_technology_and_ip: '04 核心技术与知识产权',
  technology_readiness_and_production: '05 技术成熟度与生产能力',
  industry_market_and_policy: '06 行业、市场和政策',
  industry_chain_position: '07 产业链位置',
  customers_orders_and_scenarios: '08 客户、订单与应用场景',
  supply_chain_and_partners: '09 供应链与合作方',
  business_model_and_competition: '10 商业模式和竞争优势',
  financing_valuation_equity_and_use: '11 融资、估值、股权和资金用途',
  financial_operations_plans_risks: '12 财务经营、规划、风险与待验证',
  provenance_versions_conflicts_confirmations: '13 来源、时间、版本、冲突和人工确认',
};

export interface AnalysisSectionDraft {
  key: BpSectionKey;
  summary: string;
  blockIds: string[];
}

export interface KnowledgeCandidateDraft {
  sectionKey: BpSectionKey;
  knowledgeType: string;
  statement: string;
  value?: string;
  effectiveAt?: string;
  blockIds: string[];
  highImpact: boolean;
  sensitive: boolean;
}

export interface AnalysisPersonDraft {
  name: string;
  role: string;
  summary: string;
  blockIds: string[];
}

export type AnalysisRelationCategory = 'upstream' | 'downstream' | 'customer' | 'competitor';

export interface AnalysisRelationDraft {
  targetName: string;
  category: AnalysisRelationCategory;
  relationType: string;
  description: string;
  blockIds: string[];
}

export interface MaterialAnalysisInput {
  taskId: string;
  conversationId: string;
  documentId: string;
  fileName: string;
  companyId: string;
  companyName: string;
  blocks: ParsedBlock[];
  existingKnowledge: Array<{ knowledgeType: string; statement: string; value?: string }>;
  sessionId?: string;
}

export interface MaterialAnalysisResult {
  providerId: string;
  modelId: string;
  variant: string;
  sessionId: string;
  toolUsage: string[];
  sections: AnalysisSectionDraft[];
  candidates: KnowledgeCandidateDraft[];
  people: AnalysisPersonDraft[];
  relations: AnalysisRelationDraft[];
  rawText: string;
}

export interface MaterialAnalysisPort {
  analyze(input: MaterialAnalysisInput): Promise<MaterialAnalysisResult>;
}

export class AnalysisAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AnalysisAdapterError';
    this.code = code;
  }
}
