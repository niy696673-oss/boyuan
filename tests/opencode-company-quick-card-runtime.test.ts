// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  createOpenCodeCompanyQuickCardAdapter,
  parseCompanyQuickCardJson,
} from '../server/research-platform/company-quick-card/opencode-company-quick-card.js';
import { createRuntimeCompanyQuickCardAdapter } from '../server/research-platform/company-quick-card/runtime-company-quick-card.js';

const fields = {
  companyIdentity: '博源科技有限公司 · 杭州 · 2021 年成立',
  industryTrack: '企业研究智能化',
  financing: '暂未检索到',
  keyPeople: 'CEO 田阳',
  highlights: ['机构知识沉淀闭环'],
  recentSignals: ['发布新一代研究工作台'],
};

describe('OpenCode 公司快速卡适配器', () => {
  it('复用 Luna 配置但使用独立公司研究契约，并禁止模型调用工具', async () => {
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
    expect(body.parts[0]?.text).not.toContain('competitorNames');
    expect(fetcher.mock.calls.every((call) => call[1]?.signal === undefined)).toBe(true);
  });

  it('拒绝 BP 专属字段、缺失字段与类型错误', () => {
    expect(() => parseCompanyQuickCardJson(JSON.stringify({
      ...fields,
      competitorNames: ['竞品甲'],
    }))).toThrow('unknown fields');
    const missing: Record<string, unknown> = { ...fields };
    Reflect.deleteProperty(missing, 'companyIdentity');
    expect(() => parseCompanyQuickCardJson(JSON.stringify(missing))).toThrow('companyIdentity');
    expect(() => parseCompanyQuickCardJson(JSON.stringify({
      ...fields,
      recentSignals: '发布新产品',
    }))).toThrow('recentSignals');
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
