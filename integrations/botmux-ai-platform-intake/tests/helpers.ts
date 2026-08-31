import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CompanyQuickCardResult, IntakeConfig, PlatformConversation, QuickCardResult } from '../src/types.js';

export function tempDir() {
  const path = mkdtempSync(join(tmpdir(), 'boyuan-intake-'));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

export function testConfig(root: string, overrides: Partial<IntakeConfig> = {}): IntakeConfig {
  const attachmentRoot = join(root, 'attachments');
  mkdirSync(attachmentRoot, { recursive: true });
  return {
    schemaVersion: 1,
    larkAppId: 'cli_test_app',
    botmuxConfigPath: join(root, 'bots.json'),
    platformBaseUrl: 'http://127.0.0.1:4173',
    platformIntakeKey: 'platform-secret-123456',
    publicWorkbenchUrl: 'https://demo.example.com/workbench',
    publicProductUrl: 'https://demo.example.com',
    servicePort: 19470,
    attachmentRoot,
    statePath: join(root, 'state', 'jobs.json'),
    retryDelayMs: 1_500,
    timeoutMs: 600_000,
    ...overrides,
  };
}

export function quickCard(overrides: Partial<QuickCardResult> = {}): QuickCardResult {
  return {
    status: 'completed',
    companyName: '博源科技',
    companyIdentity: '博源科技 · 杭州 · 2021 年成立',
    productTechnology: 'AI 推理基础设施研究工作台',
    industryTrack: '企业研究智能化 · 机构知识平台',
    marketView: '机构研究智能化需求增长，规模待核验',
    financing: 'A 轮 · 2000 万元 · 估值待确认',
    keyPeople: 'CEO 田阳 · 团队规模材料未披露',
    companyRegion: '杭州',
    financingStage: 'A轮',
    financingAmountWan: 2_000,
    highlights: ['核心能力已形成', '机构知识沉淀闭环'],
    riskSignals: ['客户集中度待核验', '收入质量待核验'],
    diligenceQuestions: ['前五大客户收入占比是多少？', '本轮融资的具体资金用途是什么？'],
    industryTags: ['AI推理基础设施'],
    competitorNames: ['Iktos', '晶泰科技'],
    upstreamNames: ['模型服务商'],
    downstreamNames: ['投资机构', '产业集团'],
    confidence: 86,
    confidenceLevel: '高',
    navigation: {},
    fundMatch: {
      status: 'matched',
      recommended: {
        fundId: 'F03',
        fundName: '成都元屿智算创业投资合伙企业（有限合伙）',
        score: 100,
        dimensions: [
          { key: 'industry', label: '投资领域', score: 40, maxScore: 40, summary: '匹配：AI推理基础设施' },
          { key: 'stage', label: '投资阶段', score: 20, maxScore: 20, summary: '匹配：A轮' },
          { key: 'ticket', label: '单笔金额', score: 20, maxScore: 20, summary: '融资 2000 万元位于投资范围内' },
          { key: 'region', label: '投资区域', score: 10, maxScore: 10, summary: '区域可投：杭州' },
          { key: 'capacity', label: '资金能力', score: 10, maxScore: 10, summary: '可投资金余额充足' },
        ],
      },
      alternatives: [],
      eligibleFundCount: 3,
      excludedFundCount: 1,
      source: { fileName: '模拟私募基金清单_4只_成都.xlsx', asOfDate: '2026-08-28', simulated: true },
    },
    providerId: 'openai',
    modelId: 'gpt-5.6-luna',
    variant: 'none',
    sessionId: 'session-quick',
    ...overrides,
  };
}

export function companyQuickCard(overrides: Partial<CompanyQuickCardResult> = {}): CompanyQuickCardResult {
  return {
    kind: 'company_research',
    status: 'completed',
    companyName: '博源科技',
    identityState: 'existing',
    companyIdentity: '博源科技 · 杭州 · 2021 年成立',
    productTechnology: 'AI 推理基础设施研究工作台',
    industryTrack: '企业研究智能化 · 机构知识平台',
    marketView: '机构研究智能化需求增长，规模待核验',
    financing: 'A 轮 · 2000 万元',
    keyPeople: 'CEO 田阳',
    companyRegion: '杭州',
    financingStage: 'A轮',
    financingAmountWan: 2_000,
    highlights: ['机构知识沉淀闭环'],
    riskSignals: ['客户集中度待核验'],
    diligenceQuestions: ['前五大客户收入占比是多少？'],
    industryTags: ['AI推理基础设施'],
    recentSignals: ['发布新一代研究工作台'],
    competitorNames: ['竞品甲'],
    upstreamNames: ['模型服务商甲'],
    downstreamNames: ['投资机构甲'],
    confidence: 82,
    confidenceLevel: '高',
    sourceCount: 5,
    materialCount: 2,
    formalKnowledgeCount: 3,
    pendingCandidateCount: 1,
    navigation: {},
    fundMatch: quickCard().fundMatch,
    providerId: 'openai',
    modelId: 'gpt-5.6-luna',
    variant: 'none',
    sessionId: 'session-company-quick',
    ...overrides,
  };
}

export function conversation(id: string, status: PlatformConversation['status'] = 'completed'): PlatformConversation {
  return {
    conversationId: id,
    title: '测试材料',
    status,
    document: { fileName: `${id}.pdf`, materialType: 'BP' },
    company: { canonicalName: '博源科技' },
    analysisSections: [{ key: 'summary', summary: '公司定位清晰，核心能力已形成。' }],
    candidates: [{ status: 'pending' }, { status: 'confirmed' }],
    task: {},
  };
}
