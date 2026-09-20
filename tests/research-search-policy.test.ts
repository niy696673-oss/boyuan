// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { planCompanyPublicQuery } from '../server/research-platform/research/search-policy.js';

describe('公司公开检索查询规划', () => {
  it('500 字关注点中的内部代号、联系方式和私有链接不进入公网查询', () => {
    const focus = '关注融资和竞争；内部代号松针，联系人 private@example.com，资料 https://private.example.com/secret。'.padEnd(500, '密');
    expect(planCompanyPublicQuery('白杨智能有限公司', focus))
      .toBe('白杨智能有限公司 公司简介 主营业务 核心产品 官网 投资者关系 竞品 竞争格局 融资 金额 估值 日期');
  });

  it('将用户要求映射为受控研究维度而不发送原始意图', () => {
    const query = planCompanyPublicQuery(
      '白杨智能有限公司',
      '请核验竞品、上游供应、下游客户和最新公开进展，内部项目代号为松针',
    );

    expect(query).toBe(
      '白杨智能有限公司 公司简介 主营业务 核心产品 官网 投资者关系 竞品 竞争格局 上游 供应商 下游 客户 应用 最新 公开进展',
    );
    expect(query).not.toContain('松针');
  });

  it('普通研究聚焦公司基础资料，不默认查询最新融资', () => {
    expect(planCompanyPublicQuery('白杨智能有限公司', '公司基础研究'))
      .toBe('白杨智能有限公司 公司简介 主营业务 核心产品 官网 投资者关系');
  });
});
