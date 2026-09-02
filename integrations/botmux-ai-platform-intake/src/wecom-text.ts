import type {
  CompletionDeliveryInput,
  CompletionLinks,
} from './types.js';
import type { FundMatchSummary } from '../../../shared/fund-matching.js';

export const WECOM_TEXT_SOFT_LIMIT_BYTES = 6_000;

export function wecomProcessingText(
  kind: 'bp' | 'company_research',
  subject?: string,
): string {
  if (kind === 'company_research') {
    return `【博源AI】已收到${subject ? `“${subject}”` : ''}的研究请求，正在启动快速分析和后台深度研究。`;
  }
  return '【博源AI】已收到项目材料，正在接入并进行快速分析。';
}

export function wecomFailureText(
  kind: 'bp' | 'company_research',
  subject: string,
): string {
  if (kind === 'company_research') {
    return `【博源AI】“${subject}”研究请求接入失败，请稍后重试。`;
  }
  return `【博源AI】“${subject}”接入失败，请确认文件可正常打开且格式为 PDF、DOCX、XLSX 或 CSV 后重试。`;
}

export function renderWeComCompletion(input: CompletionDeliveryInput): string {
  return input.kind === 'company_research'
    ? renderCompanyResearch(input.result, input.links)
    : renderBp(input.result, input.links);
}

function renderBp(
  result: Extract<CompletionDeliveryInput, { kind: 'bp' }>['result'],
  links: CompletionLinks,
): string {
  if (result.status === 'fallback') {
    return fitWithFooter(
      ['【博源AI｜BP事实核验】', '快速分析未完成，深度分析仍在后台运行。'],
      linkFooter(links, '查看深度分析'),
    );
  }
  const body = [
    '【博源AI｜BP事实核验】',
    '',
    '▍主体概况',
    fieldLine('公司', result.companyName),
    fieldLine('主体', result.companyIdentity),
    fieldLine('产品/技术', result.productTechnology),
    fieldLine('行业/赛道', result.industryTrack),
    fieldLine('市场', result.marketView),
    fieldLine('融资', result.financing),
    fieldLine('团队', result.keyPeople),
    '',
    ...listSection('亮点', result.highlights, 4),
    ...listSection('风险与待验证', result.riskSignals, 4),
    ...listSection('建议尽调问题', result.diligenceQuestions, 4),
    ...relationSection(result.competitorNames, result.upstreamNames, result.downstreamNames),
    ...fundMatchSection(result.fundMatch),
    '▍结果依据',
    fieldLine('置信度', `${result.confidence}%（${result.confidenceLevel}）`),
    fieldLine('说明', '快速结果和基金匹配不构成投资判断。'),
  ];
  return fitWithFooter(body, linkFooter(links, '查看深度分析'));
}

function renderCompanyResearch(
  result: Extract<CompletionDeliveryInput, { kind: 'company_research' }>['result'],
  links: CompletionLinks,
): string {
  if (result.status === 'fallback') {
    return fitWithFooter(
      ['【博源AI｜公司快速研究】', `公司：${result.companyName}`, '快速分析未完成，深度研究仍在后台运行。'],
      linkFooter(links, '查看深度研究'),
    );
  }
  const identity = result.identityState === 'existing'
    ? '已有正式主体'
    : result.identityState === 'ambiguous'
      ? '存在同名或相似主体，待确认'
      : '新主体，待确认';
  const body = [
    '【博源AI｜公司快速研究】',
    '',
    '▍主体概况',
    fieldLine('公司', result.companyName),
    fieldLine('主体状态', identity),
    fieldLine('主体识别', result.companyIdentity),
    fieldLine('产品/技术', result.productTechnology),
    fieldLine('行业/赛道', result.industryTrack),
    fieldLine('市场', result.marketView),
    fieldLine('融资', result.financing),
    fieldLine('团队', result.keyPeople),
    '',
    ...listSection('亮点', result.highlights, 4),
    ...listSection('风险与待验证', result.riskSignals, 4),
    ...listSection('建议尽调问题', result.diligenceQuestions, 4),
    ...listSection('近期信号', result.recentSignals, 4),
    ...relationSection(result.competitorNames, result.upstreamNames, result.downstreamNames),
    ...fundMatchSection(result.fundMatch),
    '▍结果依据',
    fieldLine('公开来源', `${result.sourceCount}个`),
    fieldLine('已有材料', `${result.materialCount}份`),
    fieldLine('正式知识', `${result.formalKnowledgeCount}条`),
    fieldLine('待确认', `${result.pendingCandidateCount}条`),
    fieldLine('置信度', `${result.confidence}%（${result.confidenceLevel}）`),
    fieldLine('说明', '快速结果和基金匹配不构成投资判断。'),
  ];
  return fitWithFooter(body, linkFooter(links, '查看完整研究'));
}

function listSection(title: string, items: string[], limit: number): string[] {
  const selected = items.slice(0, limit);
  return [
    `▍${title}`,
    ...(selected.length === 0 ? ['• 暂未披露'] : selected.map((item) => `• ${item}`)),
    '',
  ];
}

function relationSection(
  competitors: string[],
  upstream: string[],
  downstream: string[],
): string[] {
  return [
    '▍关联线索',
    relationLine('竞品', competitors),
    relationLine('上游', upstream),
    relationLine('下游', downstream),
    '',
  ];
}

function relationLine(label: string, items: string[]): string {
  const preview = items.slice(0, 2).join('、');
  return fieldLine(label, `${items.length}家${preview ? `：${preview}${items.length > 2 ? '等' : ''}` : ''}`);
}

function fundMatchSection(result: FundMatchSummary): string[] {
  const source = `${result.source.simulated ? '模拟清单' : '基金清单'} · ${result.source.asOfDate}`;
  if (result.status !== 'matched' || !result.recommended) {
    const message = result.status === 'insufficient_input'
      ? '当前行业、阶段、金额和区域信息不足，暂不生成基金匹配度。'
      : '当前清单中暂无可参与匹配的基金。';
    return ['▍基金匹配', `• ${message}`, fieldLine('清单', source), ''];
  }
  const recommended = result.recommended;
  return [
    '▍基金匹配（确定性规则）',
    fieldLine('推荐基金', recommended.fundName),
    fieldLine('匹配度', `${recommended.score}%`),
    ...recommended.dimensions.map((item) => (
      fieldLine(item.label, `${item.score}/${item.maxScore} · ${item.summary}`)
    )),
    ...(result.alternatives.length > 0
      ? [fieldLine('备选基金', result.alternatives.map((item) => item.fundName).join('、'))]
      : []),
    fieldLine('清单', source),
    fieldLine('参与匹配', `${result.eligibleFundCount}只`),
    fieldLine('已排除', `${result.excludedFundCount}只`),
    '',
  ];
}

function linkFooter(links: CompletionLinks, deepLabel: string): string[] {
  return [
    '▍继续查看',
    fieldLine(deepLabel, links.deepAnalysisUrl),
    ...(links.companyNetworkUrl ? [fieldLine('公司网络', links.companyNetworkUrl)] : []),
    ...(links.industryChainUrl ? [fieldLine('产业链', links.industryChainUrl)] : []),
  ];
}

function fieldLine(label: string, value: string): string {
  return `${label}｜${value}`;
}

function fitWithFooter(bodyLines: string[], footerLines: string[]): string {
  const footer = footerLines.join('\n');
  const body = bodyLines.join('\n').trim();
  const complete = `${body}\n\n${footer}`;
  if (Buffer.byteLength(complete, 'utf8') <= WECOM_TEXT_SOFT_LIMIT_BYTES) return complete;
  const reserved = Buffer.byteLength(`…\n\n${footer}`, 'utf8');
  return `${truncateUtf8(body, Math.max(0, WECOM_TEXT_SOFT_LIMIT_BYTES - reserved))}…\n\n${footer}`;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const next = Buffer.byteLength(character, 'utf8');
    if (bytes + next > maxBytes) break;
    result += character;
    bytes += next;
  }
  return result.trimEnd();
}
