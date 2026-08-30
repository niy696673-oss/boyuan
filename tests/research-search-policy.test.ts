// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { planCompanyPublicQuery } from '../server/research-platform/research/search-policy.js';

describe('公司公开检索查询规划', () => {
  it('将用户要求映射为受控研究维度而不发送原始意图', () => {
    const query = planCompanyPublicQuery(
      '白杨智能有限公司',
      '请核验竞品、上游供应、下游客户和最新公开进展，内部项目代号为松针',
    );

    expect(query).toBe(
      '白杨智能有限公司 公司 业务 产品 竞品 竞争格局 上游 供应商 下游 客户 应用 最新 进展 融资',
    );
    expect(query).not.toContain('松针');
  });

  it('普通研究仍保留产品、最新进展和融资基线', () => {
    expect(planCompanyPublicQuery('白杨智能有限公司', '公司基础研究'))
      .toBe('白杨智能有限公司 公司 业务 产品 最新 融资');
  });
});
