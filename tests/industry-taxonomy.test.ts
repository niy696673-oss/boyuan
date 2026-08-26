import { describe, expect, it } from "vitest";
import {
  CANONICAL_INDUSTRY_TAXONOMY,
  classifyCanonicalIndustry,
} from "../server/research-platform/industry-taxonomy.js";

describe("受控行业分类", () => {
  it("将不同公司的航空发动机与高端装备描述归入同一标准行业", () => {
    const engineMeasurementCompany = classifyCanonicalIndustry({
      industryMarketSummary:
        "面向航空发动机精细化测压与试验验证市场，服务航空工业客户。",
      industryChainSummary: "位于航空发动机测试与仿真环节。",
    });
    const flightEquipmentCompany = classifyCanonicalIndustry({
      industryMarketSummary:
        "聚焦高端装备领域，为飞行器提供核心部件与系统集成产品。",
      industryChainSummary: "处于航空航天产业链核心部件环节。",
    });

    expect(engineMeasurementCompany).toEqual({
      key: "aerospace-high-end-equipment",
      name: "航空航天与高端装备",
    });
    expect(flightEquipmentCompany).toEqual(engineMeasurementCompany);
    expect(engineMeasurementCompany.name).not.toContain("相关行业");
  });

  it("无法稳定匹配时统一归入其他前沿科技", () => {
    expect(
      classifyCanonicalIndustry({
        industryMarketSummary: "材料未披露明确行业。",
        industryChainSummary: "产业链位置有待进一步确认。",
      }),
    ).toEqual({
      key: "other-frontier-technology",
      name: "其他前沿科技",
    });
  });

  it("只公开稳定的受控行业 key 和展示名称", () => {
    expect(
      CANONICAL_INDUSTRY_TAXONOMY.map(({ key, name }) => ({ key, name })),
    ).toEqual([
      {
        key: "artificial-intelligence-enterprise-services",
        name: "人工智能与企业服务",
      },
      { key: "semiconductor-integrated-circuit", name: "半导体与集成电路" },
      { key: "aerospace-high-end-equipment", name: "航空航天与高端装备" },
      {
        key: "instrumentation-testing-sensing",
        name: "仪器仪表与检测传感",
      },
      {
        key: "industrial-software-smart-manufacturing",
        name: "工业软件与智能制造",
      },
      { key: "new-energy-green-technology", name: "新能源与绿色技术" },
      { key: "optoelectronics-communications", name: "光电与通信" },
      { key: "advanced-materials", name: "先进材料" },
      { key: "medical-life-sciences", name: "医疗与生命科技" },
      { key: "other-frontier-technology", name: "其他前沿科技" },
    ]);
    expect(
      CANONICAL_INDUSTRY_TAXONOMY.some(({ name }) => name.includes("相关行业")),
    ).toBe(false);
  });

  it("根据行业与产业链摘要识别半导体赛道", () => {
    expect(
      classifyCanonicalIndustry({
        industryMarketSummary: "公司面向第三代半导体和功率器件市场。",
        industryChainSummary: "处于碳化硅晶圆与芯片设计环节。",
      }),
    ).toEqual({
      key: "semiconductor-integrated-circuit",
      name: "半导体与集成电路",
    });
  });

  it("将人工智能和企业智能化服务归入同一标准行业", () => {
    expect(
      classifyCanonicalIndustry({
        industryMarketSummary: "公司面向人工智能和企业服务市场。",
        industryChainSummary: "位于企业智能化软件与解决方案环节。",
      }),
    ).toEqual({
      key: "artificial-intelligence-enterprise-services",
      name: "人工智能与企业服务",
    });
  });

  it.each([
    [
      "军民机与客机机翼",
      "主制造商服务军民机市场，并进入波音与空客客机机翼供应链。",
      "aerospace-high-end-equipment",
      "航空航天与高端装备",
    ],
    [
      "Chiplet",
      "围绕 Chiplet、D2D、CPU 和 GPU 提供芯粒互联能力。",
      "semiconductor-integrated-circuit",
      "半导体与集成电路",
    ],
    [
      "卫星射频",
      "提供卫星互联网射频前端，覆盖卫通、北斗及数据链场景。",
      "optoelectronics-communications",
      "光电与通信",
    ],
    [
      "工业预测维护",
      "工业物联网软件平台为制造企业提供设备预测性维护。",
      "industrial-software-smart-manufacturing",
      "工业软件与智能制造",
    ],
    [
      "压力检测",
      "提供非介入式压力计、压力测量设备和在线校准服务。",
      "instrumentation-testing-sensing",
      "仪器仪表与检测传感",
    ],
  ])("根据真实材料摘要识别%s赛道", (_label, summary, key, name) => {
    expect(
      classifyCanonicalIndustry({
        industryMarketSummary: summary,
        industryChainSummary: summary,
      }),
    ).toEqual({ key, name });
  });

  it("不使用公司名称作为行业分类 fallback", () => {
    const inputWithCompanyName = {
      companyName: "某某半导体有限公司",
      industryMarketSummary: "材料未披露明确行业。",
      industryChainSummary: "产业链位置有待进一步确认。",
    };

    expect(classifyCanonicalIndustry(inputWithCompanyName)).toEqual({
      key: "other-frontier-technology",
      name: "其他前沿科技",
    });
  });
});
