import { describe, expect, it } from 'vitest';
import { completionCard, companyResearchCompletionCard, processingCard, companyResearchProcessingCard, failureCard, companyResearchFailureCard } from '../src/cards.js';
import { renderApiResult } from '../src/render-card.js';
import { FeishuIntakeDelivery } from '../src/intake-delivery.js';
import { companyQuickCard, quickCard } from './helpers.js';

describe('external bot card contract', () => {
  it('never offers an internal link or claims background research for any state', () => {
    const links = { deepAnalysisUrl: 'https://private.example/workbench' };
    const cards = [processingCard('sample.pdf'), companyResearchProcessingCard('测试公司'),
      completionCard(quickCard(), links), completionCard(quickCard({ status: 'fallback' }), links),
      companyResearchCompletionCard(companyQuickCard(), links),
      companyResearchCompletionCard(companyQuickCard({ status: 'fallback' }), links),
      companyResearchCompletionCard(companyQuickCard({ status: 'pending_confirmation', identityState: 'ambiguous' }), links),
      failureCard('sample.pdf', links.deepAnalysisUrl), companyResearchFailureCard('测试公司', links.deepAnalysisUrl)];
    for (const card of cards) {
      expect(JSON.stringify(card)).not.toMatch(/open_url|private\.example|深度分析|深度研究|进入工作台|Luna/);
    }
  });

  it.each(['bp', 'company_research'] as const)('offline renderer matches actual delivery: %s', async (kind) => {
    const result = kind === 'bp' ? quickCard() : companyQuickCard();
    let sent: unknown;
    const delivery = new FeishuIntakeDelivery({ sendCard: async (input) => { sent = input.card; } });
    const common = { chatId: 'test', sessionId: 'test', messageId: 'test', fileKey: 'test', links: { deepAnalysisUrl: 'https://internal.example' } };
    if (kind === 'bp') await delivery.complete({ ...common, kind, result: quickCard() });
    else await delivery.complete({ ...common, kind, result: companyQuickCard() });
    expect(renderApiResult({ kind, result })).toEqual(sent);
    expect(() => renderApiResult({ kind, result: { ...result, fundMatch: undefined } })).toThrow();
  });
});
