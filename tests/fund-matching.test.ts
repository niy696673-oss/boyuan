import { describe, expect, it } from 'vitest';
import { matchFunds } from '../server/research-platform/fund-matching/fund-matcher.js';
import { MOCK_CHENGDU_FUNDS } from '../server/research-platform/fund-matching/mock-chengdu-funds.js';

describe('deterministic fund matching', () => {
  it('filters unavailable funds and ranks eligible funds from the supplied mock list', () => {
    const result = matchFunds({
      industryTags: ['AI推理基础设施'],
      financingStage: 'A轮',
      financingAmountWan: 8_000,
      companyRegion: '杭州',
    }, MOCK_CHENGDU_FUNDS);

    expect(result).toMatchObject({
      status: 'matched',
      eligibleFundCount: 3,
      excludedFundCount: 1,
      source: {
        fileName: '模拟私募基金清单_4只_成都.xlsx',
        asOfDate: '2026-08-28',
        simulated: true,
      },
      recommended: {
        fundId: 'F03',
        fundName: '成都元屿智算创业投资合伙企业（有限合伙）',
        score: 100,
      },
    });
    expect(result.alternatives.map(({ fundId, score }) => ({ fundId, score }))).toEqual([
      { fundId: 'F04', score: 76 },
      { fundId: 'F02', score: 60 },
    ]);
    expect(result.recommended?.dimensions).toEqual([
      expect.objectContaining({ key: 'industry', score: 40, maxScore: 40 }),
      expect.objectContaining({ key: 'stage', score: 20, maxScore: 20 }),
      expect.objectContaining({ key: 'ticket', score: 20, maxScore: 20 }),
      expect.objectContaining({ key: 'region', score: 10, maxScore: 10 }),
      expect.objectContaining({ key: 'capacity', score: 10, maxScore: 10 }),
    ]);
  });

  it('keeps the score explainable when financing details are missing', () => {
    const result = matchFunds({
      industryTags: ['机器人传感/Physical AI'],
      financingStage: '暂未检索到',
      financingAmountWan: null,
      companyRegion: '成都',
    }, MOCK_CHENGDU_FUNDS);

    expect(result.status).toBe('matched');
    expect(result.recommended).toMatchObject({ fundId: 'F04', score: 65 });
    expect(result.recommended?.dimensions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'stage', score: 0, summary: '融资阶段未披露' }),
      expect.objectContaining({ key: 'ticket', score: 10, summary: '融资金额未披露' }),
      expect.objectContaining({ key: 'capacity', score: 5, summary: '融资金额未披露' }),
    ]));
  });

  it('does not invent a match when no project matching input is available', () => {
    expect(matchFunds({
      industryTags: [],
      financingStage: '材料未披露',
      financingAmountWan: null,
      companyRegion: '材料未披露',
    }, MOCK_CHENGDU_FUNDS)).toMatchObject({
      status: 'insufficient_input',
      eligibleFundCount: 3,
      excludedFundCount: 1,
      alternatives: [],
    });
  });
});
