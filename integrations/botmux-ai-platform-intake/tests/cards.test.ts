import { describe, expect, it } from 'vitest';
import { companyNetworkUrl, completionCard, industryChainUrl, processingCard } from '../src/cards.js';
import { quickCard } from './helpers.js';

describe('Feishu completion card', () => {
  it('renders an immediate processing state that promises an in-place update', () => {
    const card = processingCard('星河科技 BP.pdf');
    const text = JSON.stringify(card);

    expect(card.schema).toBe('2.0');
    expect(text).toContain('资料处理中');
    expect(text).toContain('星河科技 BP.pdf');
    expect(text).toContain('完成后本卡片会自动更新');
    expect(text).toContain('grey-50');
  });

  it('maps the design fields into Card 2.0 and links matched entities to their network pages', () => {
    const card = completionCard(quickCard({
      companyName: '星河科技',
      companyIdentity: '星河科技 · 杭州 · 2021 年成立',
      industryTrack: 'AI 算力基础设施 · 算力调度平台',
      financing: 'A 轮 · 8000 万元 · 估值待确认',
      keyPeople: 'CEO 张航 · CTO 李四 · 10 人',
      highlights: ['自研调度引擎', '头部客户背书', '团队英伟达系'],
      competitorNames: ['竞品甲', '竞品乙', '竞品丙'],
      upstreamNames: ['供应商甲'],
      downstreamNames: ['客户甲', '客户乙'],
      navigation: { companyId: 'company/1', industryId: 'industry/1' },
    }), {
      deepAnalysisUrl: 'https://demo.example/workbench/conversations/conversation-1',
      companyNetworkUrl: 'https://demo.example/companies/company%2F1?tab=relations',
      industryChainUrl: 'https://demo.example/industry/industry%2F1?tab=chain',
    });
    const text = JSON.stringify(card);

    expect(card.schema).toBe('2.0');
    expect(text).toContain('BP 导入 · 事实核验');
    expect(text).toContain('置信度高 86%');
    expect(text).toContain('公司身份');
    expect(text).toContain('行业 / 赛道');
    expect(text).toContain('融资信息');
    expect(text).toContain('团队关键人');
    expect(text).toContain('公司亮点');
    expect(text).toContain('本份 BP 提到竞品 3 家');
    expect(text).toContain('本份 BP 提到上游 1 家 / 下游 2 家');
    expect(text).toContain('https://demo.example/companies/company%2F1?tab=relations');
    expect(text).toContain('https://demo.example/industry/industry%2F1?tab=chain');
    expect(text).toContain('"type":"open_url"');
    expect(text).toContain('"background_style":"grey-50"');
    expect(text).toContain('"background_style":"white"');
    expect(text).toContain('"background_style":"blue-50"');
    expect(text).not.toContain('"background_style":"green-50"');
    expect(card.header).toBeUndefined();
    expect(text).not.toContain('blockId');
  });

  it('routes missing entity targets to the continuing deep-analysis conversation', () => {
    const deepAnalysisUrl = 'https://demo.example/workbench/conversations/conversation-1';
    const text = JSON.stringify(completionCard(quickCard({ navigation: {} }), { deepAnalysisUrl }));

    expect(text).toContain('未匹配到已有公司');
    expect(text).toContain('进入深度分析');
    expect(text.match(new RegExp(deepAnalysisUrl, 'gu'))).toHaveLength(2);
    expect(text).not.toContain('?tab=relations');
    expect(text).not.toContain('?tab=chain');
  });

  it('builds product deep links without reusing the OpenCode conversation path', () => {
    expect(companyNetworkUrl('https://demo.example/product', 'company/1')).toBe(
      'https://demo.example/product/companies/company%2F1?tab=relations',
    );
    expect(industryChainUrl('https://demo.example/product', 'industry/1')).toBe(
      'https://demo.example/product/industry/industry%2F1?tab=chain',
    );
  });
});
