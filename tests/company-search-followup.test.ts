// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformModule } from '../server/research-platform/platform-module.js';
import type { CompanyQuickCardAnalysisPort, CompanyQuickCardExtractionResult } from '../server/research-platform/company-quick-card/contracts.js';
import type { WebSearchPort } from '../server/research-platform/search/contracts.js';
import { SearchAdapterError } from '../server/research-platform/search/contracts.js';
import { planCompanyFollowUp } from '../server/research-platform/research/search-policy.js';

const missing: CompanyQuickCardExtractionResult = {
  companyIdentity: '白杨智能有限公司', productTechnology: '暂未检索到', industryTrack: '软件', marketView: '暂未检索到', financing: '暂未检索到', keyPeople: '暂未检索到', companyRegion: '暂未检索到', financingStage: '暂未检索到', financingAmountWan: null,
  highlights: [], riskSignals: [], diligenceQuestions: [], industryTags: [], recentSignals: [], competitorNames: [], upstreamNames: [], downstreamNames: [], providerId: 'test', modelId: 'test', variant: 'low', sessionId: 'test',
};
const source = { title: '公司官网', url: 'https://example.com/company', site: 'example.com', highlights: [], accessStatus: 'metadata_only' as const, retrievedAt: '2026-09-21T00:00:00Z' };

describe('共用公司研究的一次定向补查', () => {
  it('按缺项与关注点选词，常规未披露融资不触发追查，也不外传原始意图', () => {
    const basic = { ...missing, productTechnology: '工业软件' };
    expect(planCompanyFollowUp('白杨智能', '', basic)).toBeUndefined();
    expect(planCompanyFollowUp('白杨智能', '创始人是谁，内部邮件secret@private.com', basic)).toBe('白杨智能 创始人 管理层 官网 年报 公开披露');
    expect(planCompanyFollowUp('白杨智能', '', missing)).toContain('主营业务');
  });
  it.each(['success', 'search_error', 'extraction_error', 'no_new_evidence'] as const)('%s：并发、重放、重启仍只补查一次，失败保留原卡', async mode => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'boyuan-search-quality-'));
    const search = vi.fn<WebSearchPort['search']>().mockResolvedValueOnce([source]).mockImplementation(async () => {
      if (mode === 'search_error') throw new SearchAdapterError('timeout', 'timeout');
      return mode === 'no_new_evidence' ? [source] : [{ ...source, accessStatus: 'accessible', highlights: ['公司主营工业软件。'] }];
    });
    const analyze = vi.fn<CompanyQuickCardAnalysisPort['analyze']>().mockResolvedValueOnce(missing).mockImplementation(async input => {
      if (mode === 'extraction_error') throw new Error('invalid output');
      expect(input.webResults[0]?.highlights.join('')).toContain('公司主营工业软件');
      return { ...missing, productTechnology: '工业软件' };
    });
    const options = { dataRoot, search: { search }, companyQuickCardAnalysis: { analyze } };
    let platform = createPlatformModule(options);
    try {
      const started = await platform.startFeishuCompanyResearch({ companyName: '白杨智能有限公司', sourceMessageId: 'test-quality' });
      const id = started.conversation.conversationId;
      const cards = await Promise.all([platform.quickAnalyzeCompanyResearch(id), platform.quickAnalyzeCompanyResearch(id)]);
      expect(cards[0]).toEqual(cards[1]);
      expect(cards[0]?.productTechnology).toBe(mode === 'success' ? '工业软件' : '暂未检索到');
      expect(search).toHaveBeenCalledTimes(2);
      expect(search.mock.calls[1]?.[0]).toMatchObject({ reason: 'information_missing', query: expect.stringContaining('主营业务') });
      expect(analyze).toHaveBeenCalledTimes(mode === 'success' || mode === 'extraction_error' ? 2 : 1);
      platform.close();
      // Force regeneration after a restart: the persisted search claim still holds.
      const db = new DatabaseSync(join(dataRoot, 'database/platform.sqlite'));
      const row = db.prepare('SELECT search_followup_at, search_followup_error FROM company_research_runs').get();
      expect(row?.search_followup_at).toBeTruthy();
      expect(row?.search_followup_error).toBe(mode === 'search_error' ? 'timeout' : mode === 'extraction_error' ? 'supplemental_extraction_failed' : null);
      db.exec('DELETE FROM company_quick_card_results'); db.close();
      analyze.mockReset().mockResolvedValue(missing);
      platform = createPlatformModule(options);
      await platform.quickAnalyzeCompanyResearch(id);
      expect(search).toHaveBeenCalledTimes(2);
    } finally { platform.close(); await rm(dataRoot, { recursive: true, force: true }); }
  });
});
