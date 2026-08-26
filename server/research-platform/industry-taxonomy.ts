export interface IndustryClassificationInput {
  industryMarketSummary: string;
  industryChainSummary: string;
}

export interface CanonicalIndustryRef {
  key: string;
  name: string;
}

interface CanonicalIndustryDefinition extends CanonicalIndustryRef {
  keywords: readonly string[];
}

export const CANONICAL_INDUSTRY_TAXONOMY = [
  {
    key: "artificial-intelligence-enterprise-services",
    name: "人工智能与企业服务",
    keywords: [
      "人工智能",
      "企业服务",
      "企业智能化",
      "大模型",
      "机器学习",
      "智能决策",
      "SaaS",
    ],
  },
  {
    key: "semiconductor-integrated-circuit",
    name: "半导体与集成电路",
    keywords: [
      "半导体",
      "集成电路",
      "芯片",
      "晶圆",
      "微电子",
      "碳化硅",
      "氮化镓",
      "功率器件",
      "封测",
      "光刻",
      "Chiplet",
      "D2D",
      "CPU",
      "GPU",
    ],
  },
  {
    key: "aerospace-high-end-equipment",
    name: "航空航天与高端装备",
    keywords: [
      "航空航天",
      "航空",
      "航天",
      "飞行器",
      "航空发动机",
      "发动机",
      "涡轮",
      "飞控",
      "高端装备",
      "飞机",
      "军机",
      "民机",
      "客机",
      "机翼",
      "波音",
      "空客",
    ],
  },
  {
    key: "instrumentation-testing-sensing",
    name: "仪器仪表与检测传感",
    keywords: [
      "仪器仪表",
      "传感器",
      "检测技术",
      "压力测量",
      "压力计",
      "计量",
      "在线校准",
      "测量设备",
      "检测设备",
      "测试仪器",
    ],
  },
  {
    key: "industrial-software-smart-manufacturing",
    name: "工业软件与智能制造",
    keywords: [
      "工业软件",
      "智能制造",
      "机器人",
      "自动化",
      "MES",
      "CAE",
      "CAD",
      "数字孪生",
      "生产线",
      "工业物联网",
      "预测性维护",
      "设备维护",
      "仿真软件",
      "软件平台",
      "中间件",
      "设计协同",
      "研发协同",
      "PLM",
    ],
  },
  {
    key: "new-energy-green-technology",
    name: "新能源与绿色技术",
    keywords: [
      "新能源",
      "光伏",
      "储能",
      "电池",
      "氢能",
      "制氢",
      "电解槽",
      "燃料电池",
      "充电桩",
      "电网",
    ],
  },
  {
    key: "optoelectronics-communications",
    name: "光电与通信",
    keywords: [
      "光电",
      "光纤",
      "激光",
      "光子",
      "通信",
      "天线",
      "基站",
      "雷达",
      "卫星互联网",
      "射频",
      "卫通",
      "北斗",
      "数据链",
    ],
  },
  {
    key: "advanced-materials",
    name: "先进材料",
    keywords: [
      "新材料",
      "先进材料",
      "合金",
      "复合材料",
      "涂层",
      "粉末",
      "陶瓷",
      "磁性材料",
      "高分子",
    ],
  },
  {
    key: "medical-life-sciences",
    name: "医疗与生命科技",
    keywords: [
      "医疗",
      "临床",
      "诊断",
      "药物",
      "生物",
      "手术",
      "影像",
      "健康",
      "医疗器械",
    ],
  },
  {
    key: "other-frontier-technology",
    name: "其他前沿科技",
    keywords: [],
  },
] as const satisfies readonly CanonicalIndustryDefinition[];

export function classifyCanonicalIndustry(
  input: IndustryClassificationInput,
): CanonicalIndustryRef {
  const text =
    `${input.industryMarketSummary}\n${input.industryChainSummary}`.toLocaleLowerCase(
      "zh-CN",
    );
  let best: CanonicalIndustryDefinition | undefined;
  let bestScore = 0;
  for (const industry of CANONICAL_INDUSTRY_TAXONOMY.slice(0, -1)) {
    const score = industry.keywords.reduce(
      (sum, keyword) => sum + occurrences(text, keyword),
      0,
    );
    if (score > bestScore) {
      best = industry;
      bestScore = score;
    }
  }
  return toRef(best ?? CANONICAL_INDUSTRY_TAXONOMY.at(-1)!);
}

function occurrences(text: string, keyword: string): number {
  return text.split(keyword.toLocaleLowerCase("zh-CN")).length - 1;
}

function toRef(industry: CanonicalIndustryDefinition): CanonicalIndustryRef {
  return { key: industry.key, name: industry.name };
}
