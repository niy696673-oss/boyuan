// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  createOpenCodeCompanyQuickCardAdapter,
  parseCompanyQuickCardJson,
} from '../server/research-platform/company-quick-card/opencode-company-quick-card.js';
import {
  COMPANY_QUICK_CARD_LIST_FIELDS,
  COMPANY_QUICK_CARD_TEXT_FIELDS,
} from '../server/research-platform/company-quick-card/contracts.js';
import { createRuntimeCompanyQuickCardAdapter } from '../server/research-platform/company-quick-card/runtime-company-quick-card.js';
import {
  COMPANY_QUICK_CARD_COMMON_LIST_FIELDS,
  COMPANY_QUICK_CARD_CORE_TEXT_FIELDS,
} from '../shared/company-quick-card.js';

const fields = {
  companyIdentity: '博源科技有限公司 · 杭州 · 2021 年成立',
  productTechnology: 'AI 推理基础设施研究工作台',
  industryTrack: '企业研究智能化',
  marketView: '机构研究智能化需求增长，规模待核验',
  financing: '暂未检索到',
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
};

describe('OpenCode 公司快速卡适配器', () => {
  it('复用 BP Luna 配置和公司通用字段，并禁止模型调用工具', async () => {
    expect(COMPANY_QUICK_CARD_TEXT_FIELDS).toEqual(COMPANY_QUICK_CARD_CORE_TEXT_FIELDS);
    expect(COMPANY_QUICK_CARD_LIST_FIELDS.slice(0, COMPANY_QUICK_CARD_COMMON_LIST_FIELDS.length))
      .toEqual(COMPANY_QUICK_CARD_COMMON_LIST_FIELDS);
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'company-quick-session' }))
      .mockResolvedValueOnce(jsonResponse({
        info: { providerID: 'openai', modelID: 'gpt-5.6-luna', variant: 'none' },
        parts: [{ type: 'text', text: JSON.stringify(fields) }],
      }));
    const adapter = createOpenCodeCompanyQuickCardAdapter({
      baseUrl: new URL('http://127.0.0.1:4096'),
      directory: '/workspace',
      model: { providerId: 'openai', modelId: 'gpt-5.6-luna' },
      variant: 'none',
      fetcher,
    });

    await expect(adapter.analyze({
      conversationId: 'conversation-one',
      companyName: '博源科技有限公司',
      identityState: 'existing',
      existingKnowledge: [{ knowledgeType: 'industry', statement: '企业研究智能化' }],
      materialSummaries: ['公司形成机构知识沉淀闭环。'],
      webResults: [{
        title: '产品更新',
        url: 'https://example.com/update',
        site: 'example.com',
        highlights: ['发布新一代研究工作台'],
        accessStatus: 'accessible',
        retrievedAt: '2026-08-29T00:00:00.000Z',
      }],
    })).resolves.toMatchObject({
      ...fields,
      modelId: 'gpt-5.6-luna',
      sessionId: 'company-quick-session',
    });

    const body = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)) as {
      tools: Record<string, boolean>;
      parts: Array<{ text: string }>;
    };
    expect(body.tools).toEqual({ '*': false });
    expect(body.parts[0]?.text).toContain('recentSignals');
    expect(body.parts[0]?.text).toContain('平台正式知识');
    expect(body.parts[0]?.text).toContain('competitorNames');
    expect(body.parts[0]?.text).toContain('financingAmountWan');
    expect(fetcher.mock.calls.every((call) => call[1]?.signal === undefined)).toBe(true);
  });

  it('拒绝未知字段、缺失字段与类型错误', () => {
    expect(() => parseCompanyQuickCardJson(JSON.stringify({
      ...fields,
      evidence: [],
    }))).toThrow('unknown fields');
    const missing: Record<string, unknown> = { ...fields };
    Reflect.deleteProperty(missing, 'companyIdentity');
    expect(() => parseCompanyQuickCardJson(JSON.stringify(missing))).toThrow('companyIdentity');
    expect(() => parseCompanyQuickCardJson(JSON.stringify({
      ...fields,
      recentSignals: '发布新产品',
    }))).toThrow('recentSignals');
    expect(() => parseCompanyQuickCardJson(JSON.stringify({
      ...fields,
      financingAmountWan: '2000',
    }))).toThrow('financingAmountWan');
    expect(() => parseCompanyQuickCardJson(JSON.stringify({
      ...fields,
      industryTags: ['模型随意生成的行业'],
    }))).toThrow('industryTags');
  });

  it('默认跟随已有 BP Luna 配置，也允许公司快速卡单独覆盖模型', () => {
    expect(createRuntimeCompanyQuickCardAdapter({}, { directory: '/workspace' })).toBeUndefined();
    expect(createRuntimeCompanyQuickCardAdapter({
      BOYUAN_QUICK_CARD_ADAPTER: 'opencode',
      BOYUAN_QUICK_CARD_PROVIDER_ID: 'openai',
      BOYUAN_QUICK_CARD_MODEL_ID: 'gpt-5.6-luna',
      BOYUAN_OPENCODE_BASE_URL: 'http://127.0.0.1:4173/opencode-api/',
    }, { directory: '/workspace' })).toBeTruthy();
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
