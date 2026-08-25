import { createHash } from "node:crypto";
import type { Company, IndustryEdge, IndustryNode } from "../src/types.js";
import type { ModelResult } from "./platform/contracts.js";

type StageDefinition = { name: string; keywords: string[] };
type IndustryDefinition = {
  name: string;
  description: string;
  keywords: string[];
  stages: StageDefinition[];
};

export type IndustryAssignment = {
  companyId: string;
  industry: string;
  stage: string;
  confidence: number;
  reason: string;
};

export const INDUSTRY_TAXONOMY: IndustryDefinition[] = [
  {
    name: "半导体与集成电路",
    description: "覆盖材料设备、芯片设计、制造封测与模组应用。",
    keywords: [
      "半导体",
      "芯片",
      "晶圆",
      "集成电路",
      "微电子",
      "碳化硅",
      "氮化镓",
    ],
    stages: [
      {
        name: "材料与设备",
        keywords: [
          "材料",
          "晶圆",
          "光刻",
          "镀膜",
          "检测设备",
          "碳化硅",
          "氮化镓",
          "硅片",
        ],
      },
      {
        name: "芯片设计",
        keywords: [
          "芯片",
          "IC",
          "集成电路",
          "射频",
          "微波",
          "模拟",
          "功率器件",
          "传感芯片",
        ],
      },
      {
        name: "制造与封测",
        keywords: ["制造", "封装", "封测", "SOP", "测试", "晶圆加工"],
      },
      {
        name: "模组与系统",
        keywords: ["模组", "模块", "板卡", "系统", "终端", "应用"],
      },
    ],
  },
  {
    name: "航空航天与高端装备",
    description: "覆盖航空材料工艺、核心部件、测试仿真与整机系统。",
    keywords: [
      "航空",
      "航天",
      "飞行器",
      "发动机",
      "涡轮",
      "机翼",
      "气动",
      "叶片",
    ],
    stages: [
      {
        name: "材料与制造工艺",
        keywords: [
          "合金",
          "复合材料",
          "涂层",
          "铸造",
          "增材",
          "3D打印",
          "蒙皮",
          "材料",
        ],
      },
      {
        name: "核心部件",
        keywords: ["发动机", "叶片", "涡轮", "密封", "电机", "部件", "结构件"],
      },
      {
        name: "测试与仿真",
        keywords: ["测试", "测压", "测角", "风洞", "仿真", "测量", "态势感知"],
      },
      {
        name: "飞行器与系统",
        keywords: ["飞行器", "整机", "航空电子", "导航", "机翼", "系统集成"],
      },
    ],
  },
  {
    name: "工业软件与智能制造",
    description: "覆盖研发设计、数字化生产、自动化与工业检测运维。",
    keywords: [
      "工业软件",
      "智能制造",
      "数字化",
      "机器人",
      "自动化",
      "仿真软件",
      "管理系统",
      "生产线",
    ],
    stages: [
      {
        name: "研发设计与仿真",
        keywords: ["设计", "仿真", "CAE", "CAD", "网格", "优化软件", "模型"],
      },
      {
        name: "生产数字化",
        keywords: [
          "数字化",
          "车间",
          "MES",
          "管理系统",
          "协同",
          "管控平台",
          "生产线",
        ],
      },
      {
        name: "机器人与自动化",
        keywords: [
          "机器人",
          "自动化",
          "柔性单元",
          "驱动",
          "智能装备",
          "操作平台",
        ],
      },
      {
        name: "检测与运维",
        keywords: ["检测", "测量", "运维", "监测", "质量", "视觉"],
      },
    ],
  },
  {
    name: "新能源与绿色技术",
    description: "覆盖新能源材料器件、氢能、储能电力与新能源汽车。",
    keywords: [
      "新能源",
      "光伏",
      "储能",
      "电池",
      "氢能",
      "制氢",
      "汽车",
      "充电",
      "电力",
    ],
    stages: [
      {
        name: "材料与核心器件",
        keywords: [
          "材料",
          "磁芯",
          "电池材料",
          "功率器件",
          "电源",
          "电机",
          "膜",
        ],
      },
      {
        name: "氢能与燃料电池",
        keywords: ["氢能", "制氢", "燃料电池", "电解槽", "氢"],
      },
      {
        name: "储能与电力系统",
        keywords: ["储能", "光伏", "电网", "电力", "逆变器", "充电"],
      },
      {
        name: "新能源汽车",
        keywords: ["汽车", "车载", "新能源汽车", "动力电池", "底盘", "充电桩"],
      },
    ],
  },
  {
    name: "光电与通信",
    description: "覆盖光电器件、通信芯片模组、网络设备与行业应用。",
    keywords: ["光电", "通信", "光纤", "激光", "射频", "天线", "网络", "传感"],
    stages: [
      {
        name: "光电材料与器件",
        keywords: ["光电", "激光", "光学", "OLED", "光子", "器件"],
      },
      {
        name: "通信芯片与模组",
        keywords: ["通信芯片", "射频", "基带", "模组", "天线", "微波"],
      },
      {
        name: "网络与传输设备",
        keywords: ["光纤", "网络", "传输", "基站", "路由", "通信设备"],
      },
      {
        name: "感知与终端应用",
        keywords: ["传感", "视觉", "终端", "摄像", "雷达", "测量"],
      },
    ],
  },
  {
    name: "先进材料",
    description: "覆盖金属合金、复合材料、功能材料与表面工程。",
    keywords: [
      "新材料",
      "合金",
      "复合材料",
      "涂层",
      "粉末",
      "陶瓷",
      "磁性材料",
      "高分子",
    ],
    stages: [
      {
        name: "原料与配方",
        keywords: ["配方", "原料", "粉末", "合金", "高分子", "树脂"],
      },
      {
        name: "材料制备",
        keywords: ["制备", "雾化", "冶炼", "烧结", "成型", "增材"],
      },
      {
        name: "表面与精密加工",
        keywords: ["涂层", "镀膜", "表面", "精密加工", "热处理"],
      },
      {
        name: "终端材料应用",
        keywords: ["航空", "汽车", "电子", "医疗", "建筑", "应用"],
      },
    ],
  },
  {
    name: "医疗与生命科技",
    description: "覆盖医疗器械、诊断检测、数字医疗与临床应用。",
    keywords: ["医疗", "临床", "诊断", "药物", "生物", "手术", "影像", "健康"],
    stages: [
      {
        name: "核心技术与部件",
        keywords: ["生物材料", "传感", "芯片", "算法", "核心部件"],
      },
      {
        name: "诊断与医疗器械",
        keywords: ["诊断", "检测", "医疗器械", "影像", "设备"],
      },
      {
        name: "数字医疗",
        keywords: ["数字医疗", "软件", "AI", "数据", "平台"],
      },
      {
        name: "临床与健康服务",
        keywords: ["临床", "医院", "手术", "康复", "健康"],
      },
    ],
  },
  {
    name: "其他前沿科技",
    description: "暂未归入主要赛道的技术项目，保留 BP 证据与后续细分空间。",
    keywords: [],
    stages: [
      { name: "核心技术", keywords: ["技术", "研发", "专利", "算法"] },
      {
        name: "产品与解决方案",
        keywords: ["产品", "设备", "平台", "解决方案"],
      },
      { name: "行业应用", keywords: ["应用", "客户", "市场", "服务"] },
    ],
  },
];

function occurrences(text: string, keyword: string) {
  if (!keyword) return 0;
  return text.toLowerCase().split(keyword.toLowerCase()).length - 1;
}

function companyText(company: Company) {
  return [
    company.standardName,
    ...company.aliases,
    company.description,
    ...company.evidence
      .slice(0, 3)
      .flatMap((evidence) => [
        evidence.fileName,
        evidence.excerpt.slice(0, 6000),
      ]),
  ].join("\n");
}

export function classifyCompanyFromEvidence(
  company: Company,
): IndustryAssignment {
  const text = companyText(company);
  const scored = INDUSTRY_TAXONOMY.slice(0, -1)
    .map((industry) => {
      const industryScore = industry.keywords.reduce(
        (sum, keyword) => sum + occurrences(text, keyword) * 2,
        0,
      );
      const stages = industry.stages.map((stage) => ({
        stage,
        score: stage.keywords.reduce(
          (sum, keyword) => sum + occurrences(text, keyword),
          0,
        ),
      }));
      const bestStage = stages.sort(
        (left, right) => right.score - left.score,
      )[0];
      return { industry, score: industryScore + bestStage.score, bestStage };
    })
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  const fallback = INDUSTRY_TAXONOMY.at(-1)!;
  const industry = best?.score > 0 ? best.industry : fallback;
  const stage =
    best?.score > 0 && best.bestStage.score > 0
      ? best.bestStage.stage
      : industry.stages[0];
  const confidence =
    best?.score > 0 ? Math.min(0.96, 0.62 + best.score * 0.025) : 0.55;
  return {
    companyId: company.id,
    industry: industry.name,
    stage: stage.name,
    confidence: Number(confidence.toFixed(2)),
    reason:
      best?.score > 0
        ? `BP 中与“${industry.name} / ${stage.name}”相关的技术、产品或应用描述最集中。`
        : "BP 证据不足以稳定归入主要赛道，暂归其他前沿科技。",
  };
}

function stripJsonFence(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = (fenced || value).trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  return start >= 0 && end > start ? source.slice(start, end + 1) : source;
}

export function assignmentsFromModel(text: string, companies: Company[]) {
  try {
    const payload = JSON.parse(stripJsonFence(text)) as {
      assignments?: unknown[];
    };
    const companyIds = new Set(companies.map((company) => company.id));
    const validTargets = new Map(
      INDUSTRY_TAXONOMY.flatMap((industry) =>
        industry.stages.map((stage) => [
          `${industry.name}|${stage.name}`,
          { industry, stage },
        ]),
      ) as Array<
        [string, { industry: IndustryDefinition; stage: StageDefinition }]
      >,
    );
    return (payload.assignments || []).flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const companyId = String(item.companyId || "");
      const industryName = String(item.industry || "");
      const stageName = String(item.stage || "");
      if (
        !companyIds.has(companyId) ||
        !validTargets.has(`${industryName}|${stageName}`)
      )
        return [];
      return [
        {
          companyId,
          industry: industryName,
          stage: stageName,
          confidence: Math.max(
            0.5,
            Math.min(0.99, Number(item.confidence) || 0.75),
          ),
          reason: String(item.reason || "GPT 根据 BP 证据完成行业归类。").slice(
            0,
            240,
          ),
        } satisfies IndustryAssignment,
      ];
    });
  } catch {
    return [];
  }
}

export function mergeAssignments(
  companies: Company[],
  modelResult?: ModelResult,
) {
  const modelRows = modelResult
    ? assignmentsFromModel(modelResult.text, companies)
    : [];
  const byCompany = new Map(modelRows.map((row) => [row.companyId, row]));
  return companies.map(
    (company) =>
      byCompany.get(company.id) || classifyCompanyFromEvidence(company),
  );
}

function stableId(prefix: string, ...parts: string[]) {
  return `${prefix}-${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 14)}`;
}

export function buildIndustryGraph(
  assignments: IndustryAssignment[],
  provider: string,
  model: string,
) {
  const activeIndustries = INDUSTRY_TAXONOMY.filter((industry) =>
    assignments.some((row) => row.industry === industry.name),
  );
  const now = new Date().toISOString();
  const nodes: IndustryNode[] = [];
  const edges: IndustryEdge[] = [];
  for (const industry of activeIndustries) {
    const rootId = stableId("industry", industry.name);
    nodes.push({
      id: rootId,
      name: industry.name,
      parentId: null,
      level: 0,
      source: "bp_formal_analysis",
      status: "confirmed",
      confidence: 0.9,
      description: industry.description,
      updatedAt: now,
    });
    const activeStages = industry.stages.filter((stage) =>
      assignments.some(
        (row) => row.industry === industry.name && row.stage === stage.name,
      ),
    );
    activeStages.forEach((stage, index) => {
      const stageId = stableId("stage", industry.name, stage.name);
      nodes.push({
        id: stageId,
        name: stage.name,
        parentId: rootId,
        level: 1,
        source: "bp_formal_analysis",
        status: "confirmed",
        confidence: 0.88,
        description: `${industry.name}产业链中的${stage.name}环节。`,
        updatedAt: now,
      });
      if (index > 0) {
        const previous = activeStages[index - 1];
        edges.push({
          id: stableId("edge", industry.name, previous.name, stage.name),
          fromNodeId: stableId("stage", industry.name, previous.name),
          toNodeId: stageId,
          relation: "upstream_of",
          label: `${previous.name}支撑${stage.name}`,
          source: `bp_formal_analysis:${provider}/${model}`,
        });
      }
    });
  }
  return { nodes, edges };
}

export function industryAnalysisPrompt(companies: Company[]) {
  const choices = INDUSTRY_TAXONOMY.map(
    (industry) =>
      `${industry.name}: ${industry.stages.map((stage) => stage.name).join("、")}`,
  ).join("\n");
  return [
    "请根据每家公司 BP 证据完成正式行业归类。每家公司只能选择一个最主要行业和一个产业链环节。",
    "只能从以下分类中选择：",
    choices,
    "严格输出 JSON，不要输出解释或 Markdown。格式为：",
    '{"assignments":[{"companyId":"公司ID","industry":"行业","stage":"产业链环节","confidence":0.0,"reason":"不超过60字的BP证据依据"}]}',
    `必须覆盖全部 ${companies.length} 家公司。`,
  ].join("\n");
}
