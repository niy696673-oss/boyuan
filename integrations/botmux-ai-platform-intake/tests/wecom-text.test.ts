import { describe, expect, it } from 'vitest';
import { renderWeComCompletion, WECOM_TEXT_SOFT_LIMIT_BYTES } from '../src/wecom-text.js';
import { companyQuickCard, quickCard } from './helpers.js';

describe('WeCom text rendering', () => {
  it('keeps the BP card semantics and navigation links in normal text', () => {
    const rendered = renderWeComCompletion({
      kind: 'bp',
      chatId: 'chat',
      sessionId: 'wecom:message',
      messageId: 'message',
      fileKey: 'file',
      result: quickCard(),
      links: {
        deepAnalysisUrl: 'https://demo.example.com/workbench/conversations/c1',
        companyNetworkUrl: 'https://demo.example.com/companies/company-1/network',
        industryChainUrl: 'https://demo.example.com/industries/industry-1/chain',
      },
    });

    expect(rendered).toContain('【博源AI｜BP事实核验】');
    expect(rendered).toContain('公司：博源科技');
    expect(rendered).toContain('产品/技术：AI 推理基础设施研究工作台');
    expect(rendered).toContain('风险与待验证');
    expect(rendered).toContain('竞品2家：Iktos、晶泰科技');
    expect(rendered).toContain('推荐：成都元屿智算创业投资合伙企业（有限合伙）｜匹配度100%');
    expect(rendered).toContain('置信度：86%（高）');
    expect(rendered).toContain('查看深度分析：https://demo.example.com/workbench/conversations/c1');
    expect(rendered).toContain('公司网络：https://demo.example.com/companies/company-1/network');
    expect(rendered).not.toContain('Sol');
  });

  it('renders company quick research with the same business fields as the Feishu card', () => {
    const rendered = renderWeComCompletion({
      kind: 'company_research',
      chatId: 'chat',
      sessionId: 'wecom:message',
      messageId: 'message',
      fileKey: 'company-research',
      result: companyQuickCard(),
      links: { deepAnalysisUrl: 'https://demo.example.com/workbench/conversations/c2' },
    });

    expect(rendered).toContain('【博源AI｜公司快速研究】');
    expect(rendered).toContain('主体：已有正式主体');
    expect(rendered).toContain('近期信号');
    expect(rendered).toContain('基金匹配（确定性规则）');
    expect(rendered).toContain('公开来源5｜已有材料2｜正式知识3｜待确认1');
    expect(rendered).toContain('查看完整研究：https://demo.example.com/workbench/conversations/c2');
  });

  it('truncates a long result without losing the deep-analysis link', () => {
    const rendered = renderWeComCompletion({
      kind: 'bp',
      chatId: 'chat',
      sessionId: 'wecom:message',
      messageId: 'message',
      fileKey: 'file',
      result: quickCard({ highlights: Array.from({ length: 4 }, () => '很长的亮点'.repeat(200)) }),
      links: { deepAnalysisUrl: 'https://demo.example.com/workbench/conversations/c3' },
    });

    expect(Buffer.byteLength(rendered, 'utf8')).toBeLessThanOrEqual(WECOM_TEXT_SOFT_LIMIT_BYTES);
    expect(rendered).toContain('https://demo.example.com/workbench/conversations/c3');
  });
});
