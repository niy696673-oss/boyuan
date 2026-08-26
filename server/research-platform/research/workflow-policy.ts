import { AnalysisAdapterError } from '../analysis/contracts.js';
import type {
  CompanyResearchWorkflowContext,
  CompanyResearchResult,
} from './contracts.js';

export function validateWorkflowResearchOutput<
  Result extends Pick<CompanyResearchResult, 'summary' | 'candidates'>,
>(
  result: Result,
  context: CompanyResearchWorkflowContext,
): Result {
  if (!result.summary.trim()) {
    throw new AnalysisAdapterError(
      'workflow_output_policy_violation',
      'Workflow output policy rejected an empty internal draft',
    );
  }
  if (result.candidates.length > 0) {
    throw new AnalysisAdapterError(
      'workflow_output_policy_violation',
      'Workflow output policy rejected knowledge candidates from an internal draft',
    );
  }

  const alwaysForbidden = workflowOutputViolation(
    result.summary,
    ALWAYS_FORBIDDEN_WORKFLOW_OUTPUT,
  );
  if (alwaysForbidden) {
    throw new AnalysisAdapterError(
      'workflow_output_policy_violation',
      `Workflow output policy rejected ${alwaysForbidden}`,
    );
  }

  if (!context.gates.methodAssumptionApproval?.approved) {
    const methodViolation = workflowOutputViolation(
      result.summary,
      METHOD_APPROVAL_REQUIRED_OUTPUT,
    );
    if (methodViolation) {
      throw new AnalysisAdapterError(
        'workflow_output_policy_violation',
        `Workflow output policy rejected ${methodViolation} without method_assumption_approval`,
      );
    }
  }

  const summary = result.summary.startsWith('【内部草稿｜非投资决定】')
    ? result.summary
    : `【内部草稿｜非投资决定】\n${result.summary}`;
  return summary === result.summary ? result : { ...result, summary };
}

interface WorkflowOutputRule {
  label: string;
  patterns: readonly RegExp[];
  allowedPatterns?: readonly RegExp[];
}

const PENDING_SEVERITY_LANGUAGE: readonly RegExp[] = [
  /^(?:严重度|严重性|风险等级|风险级别|风险|severity|risk[\s_-]?rating)\s*(?:须|需|待)(?:由)?(?:负责人|专业人员)?(?:确认|决定|评估|定级)$/iu,
  /^(?:严重度|严重性|风险等级|风险级别|风险|severity|risk[\s_-]?rating)\s*[:：=]\s*(?:待(?:负责人|专业人员)?(?:确认|决定|评估|定级)|待定|未知|unknown|pending|not[\s_-]?rated)$/iu,
  /^风险\s*[:：=]?\s*高低\s*(?:须|需|待)(?:由)?负责人(?:确认|决定|评估)$/u,
  /^是否(?:属于|为)?\s*(?:严重|重大|高|中|低)\s*风险\s*(?:须|需|待)(?:由)?负责人(?:确认|决定|评估)$/u,
  /^(?:风险|risk)\s*(?:很|较|偏)?(?:严重|重大|高|中|低)\s*[,，:]?\s*(?:须|需|待)(?:由)?(?:负责人|专业人员)?(?:确认|决定|评估|定级)$/iu,
];

const METHOD_APPROVAL_REQUIRED_OUTPUT: readonly WorkflowOutputRule[] = [
  {
    label: 'a numeric score',
    patterns: [
      /(?:(?:评分|得分|总分|综合分|打分结果)\s*(?:为|是|[:：=])?|(?:score|rating)\s*[:=])\s*[-+]?\d+(?:\.\d+)?(?:\s*(?:\/\s*\d+|%|分))?/iu,
      /^已审批方法观察：/u,
    ],
  },
  {
    label: 'a severity rating',
    patterns: [
      /(?:严重度|严重性|风险等级|风险级别|severity|risk[\s_-]?rating)\s*(?:为|是|[:：=])?\s*(?:critical|high|medium|low|严重|重大|较高|较低|高|中|低)/iu,
      /(?:定级|评级)\s*(?:为|是|[:：=])?\s*(?:critical|high|medium|low|严重|重大|较高|较低|高|中|低)/iu,
      /(?:风险|risk)\s*(?:为|是|[:：=])\s*(?:critical|high|medium|low|严重|重大|较高|较低|高|中|低)/iu,
      /(?:风险|risk)\s*(?:很|较|偏)?(?:严重|重大|高|中|低)/iu,
      /(?:critical|high|medium|low|严重|重大|较高|较低|高|中|低)\s*(?:度)?风险/iu,
    ],
    allowedPatterns: PENDING_SEVERITY_LANGUAGE,
  },
];

const ALWAYS_FORBIDDEN_WORKFLOW_OUTPUT: readonly WorkflowOutputRule[] = [
  {
    label: 'an institutional investment decision',
    patterns: [
      /(?:本基金|本机构|投资委员会|投委会|\binstitution\b|\bfund\b|\bIC\b)\s*(?:决定|决议|批准|否决|同意|拒绝|通过|decision)/iu,
      /(?:本基金|本机构|投资委员会|投委会)\s*(?:将|会|拟|计划)?\s*(?:投资|推进|立项|通过|拒绝|否决|搁置|暂缓)(?:该|本)?项目/u,
      /(?:本轮|本次(?:初筛|筛选|评审)?|初筛环节|筛选环节)\s*(?:已经|已)?\s*(?:决定|决议|批准|否决|同意|拒绝|通过)/u,
      /(?:本轮|本次(?:初筛|筛选|评审)?|初筛环节|筛选环节)\s*(?:已经|已)?\s*(?:形成|作出|给出|确定)\s*(?:推进|搁置|暂缓|拒绝|否决|通过|投资|立项)\s*(?:决定|决议|结论)/u,
    ],
  },
  {
    label: 'a populated owner decision',
    patterns: [
      /(?:owner_decision|institutional_decision)\s*[:：=]\s*["']?(?:advance|hold|request[-_ ]evidence|decline|approve|reject|推进|搁置|补充证据|拒绝|通过)/iu,
    ],
  },
  {
    label: 'an unauthorized investment recommendation',
    patterns: [
      /(?<!是否)(?:建议|应当|应该|推荐)\s*(?:直接|继续)?\s*(?:(?:该|本)?项目\s*)?(?:投资|推进|进入(?:下一轮)?尽调|启动(?:下一轮)?尽调|开展(?:下一轮)?尽调|拒绝|放弃|搁置|暂缓|立项|通过)/u,
      /(?:该|本)?项目\s*(?:建议|应当|应该|推荐)\s*(?:直接|继续)?\s*(?:投资|推进|进入(?:下一轮)?尽调|启动(?:下一轮)?尽调|开展(?:下一轮)?尽调|拒绝|放弃|搁置|暂缓|立项|通过)/u,
      /(?:初筛|筛选)(?:结果|结论)?\s*建议\s*[:：=]?\s*(?:推进|进入下一轮|搁置|暂缓|暂不推进|补充证据|拒绝|不通过|通过|否决)/u,
      /(?:投资结论|项目结论)\s*(?:为|是|[:：=])\s*(?:推进|投资|立项|拒绝|放弃|通过|否决)/u,
      /(?:该|本)?项目\s*(?:值得|适合)\s*(?:投资|推进|立项)/u,
      /(?<!是否)(?:可以|可)\s*(?:继续)?\s*(?:投资|推进|立项)(?:该|本)?项目/u,
    ],
  },
  {
    label: 'an unauthorized screening conclusion',
    patterns: [
      /(?:初筛|筛选)\s*(?:结果|结论)\s*(?:为|是|[:：=])\s*(?:advance|hold|request[-_ ]evidence|decline|pass|approve|reject|推进|进入下一轮|搁置|暂缓|补充证据|拒绝|不通过|通过|否决)/iu,
      /(?:初筛|筛选)\s*[:：=]\s*(?:advance|hold|request[-_ ]evidence|decline|pass|approve|reject|推进|进入下一轮|搁置|暂缓|补充证据|拒绝|不通过|通过|否决)/iu,
      /(?:初筛|筛选)\s*(?:为|是|[:：=])?\s*(?:advance|hold|decline|pass|approve|reject|推进|搁置|暂缓|拒绝|不通过|通过|否决)(?:\s|$)/iu,
      /(?:初步)?(?:初筛|筛选)\s*(?:结果|结论)?\s*(?:认为|判断|显示)\s*(?:可|可以|应|应该)?\s*(?:继续)?\s*(?:推进|投资|进入下一轮|通过|拒绝|搁置|暂缓)/u,
    ],
    allowedPatterns: [
      /^(?:尚未|未)(?:形成|作出|给出|确定)?\s*(?:初筛|筛选)(?:结果|结论)$/u,
      /^(?:初筛|筛选)(?:结果|结论)\s*[:：=]\s*(?:待(?:负责人)?(?:决定|确认)|待定|未形成|pending|blank)$/iu,
    ],
  },
  {
    label: 'an unauthorized professional conclusion',
    patterns: [
      /(?:公司|管理层|创始人|该主体).{0,12}(?:已被(?:确认|认定|判定)|构成|实施).{0,4}(?:违法|犯罪|欺诈|舞弊|财务造假|专利侵权|偷税|逃税|审计不合格)/u,
    ],
  },
  {
    label: 'external-release language',
    patterns: [
      /(?:已经|已)\s*(?:对外|向(?:外部|外界|客户|投资人|第三方))\s*(?:发布|分享|发送|披露|提供|交付)/u,
      /(?:可直接|已获批准|获准)\s*(?:对外|向(?:外部|外界|客户|投资人|第三方))\s*(?:发布|分享|发送|披露|提供|交付)/u,
      /(?:对外|外部)(?:发布|分享|发送|披露)(?:状态)?\s*[:：=]\s*(?:已完成|完成|已发送|已发布|sent|published)/iu,
      /(?:报告|材料|产物|摘要)?\s*(?:已经|已)\s*外发/u,
      /(?:报告|材料|产物|摘要)?\s*(?:已经|已)\s*(?:发送|提供|交付|分享|披露|发布)(?:给|至|到)?\s*(?:外部|外界|客户|投资人|第三方)/u,
      /(?:报告|材料|产物|摘要)\s*(?:已经|已)\s*(?:发|发送|提供|交付|分享|披露|发布)(?:给|至|到)\s*(?:外部)?(?:投资人|客户|第三方|外界)/u,
      /(?:我们|团队|本机构)\s*(?:已经|已)\s*把\s*(?:报告|材料|产物|摘要)\s*(?:发|发送|提供|交付|分享|披露|发布)(?:给|至|到)\s*(?:外部|外界|客户|投资人|第三方)/u,
    ],
  },
  {
    label: 'an external-state mutation claim',
    patterns: [
      /(?:已经|已)(?:写入|更新|同步到)\s*(?:CRM|pipeline|机构记忆|外部系统)/iu,
    ],
  },
];

function workflowOutputViolation(
  summary: string,
  rules: readonly WorkflowOutputRule[],
): string | undefined {
  const segments = summary
    .split(/[\n。！？!?；;]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  for (const segment of segments) {
    const policySegments = [segment, stripWorkflowSummaryLabel(segment)];
    for (const rule of rules) {
      if (!rule.patterns.some((pattern) => policySegments.some((candidate) => pattern.test(candidate)))) continue;
      if (rule.allowedPatterns?.some((pattern) => policySegments.some((candidate) => pattern.test(candidate)))) continue;
      return rule.label;
    }
  }
  return undefined;
}

function stripWorkflowSummaryLabel(segment: string): string {
  return segment.replace(
    /^(?:材料披露|证据缺口|待确认问题|模型推断（待负责人确认）|已审批方法观察)\s*[:：]\s*/u,
    '',
  );
}
