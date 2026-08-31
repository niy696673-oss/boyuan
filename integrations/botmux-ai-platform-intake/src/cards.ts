import type {
  CommonCompanyQuickCardFields,
  CompanyQuickCardResult,
  JsonObject,
  QuickCardResult,
} from './types.js';

export interface CompletionCardLinks {
  deepAnalysisUrl: string;
  companyNetworkUrl?: string;
  industryChainUrl?: string;
}

function plain(value: string, max = 1_500): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127 ? ' ' : character;
  }).join('').trim().slice(0, max);
}

function markdownValue(value: string, max = 1_500): string {
  const escaped = plain(value, max).replace(/&/gu, '&#38;');
  const specials = new Set('*~><[]()#:_');
  return Array.from(escaped, (character) => specials.has(character) ? `&#${character.codePointAt(0)};` : character).join('');
}

function markdown(content: string, textSize?: string): JsonObject {
  return { tag: 'markdown', content: plain(content, 5_000), ...(textSize ? { text_size: textSize } : {}) };
}

function openUrlButton(text: string, url: string, primary: boolean): JsonObject {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: plain(text, 100) },
    type: primary ? 'primary_filled' : 'default',
    size: 'small',
    behaviors: [{ type: 'open_url', default_url: url }],
  };
}

function card(template: 'green' | 'orange' | 'red', title: string, subtitle: string, tagText: string, elements: JsonObject[]): JsonObject {
  return {
    schema: '2.0',
    config: {
      update_multi: true,
      width_mode: 'default',
      summary: { content: plain(title, 80) },
    },
    header: {
      template,
      title: { tag: 'plain_text', content: plain(title, 120) },
      subtitle: { tag: 'plain_text', content: plain(subtitle, 120) },
      icon: { tag: 'standard_icon', token: 'ai-common_colorful' },
      text_tag_list: [{
        tag: 'text_tag',
        text: { tag: 'plain_text', content: plain(tagText, 40) },
        color: template === 'green' ? 'green' : template === 'orange' ? 'orange' : 'red',
      }],
    },
    body: {
      direction: 'vertical',
      padding: '12px 12px 20px 12px',
      vertical_spacing: '12px',
      elements,
    },
  };
}

function bodyCard(summary: string, elements: JsonObject[]): JsonObject {
  return {
    schema: '2.0',
    config: {
      update_multi: true,
      width_mode: 'default',
      summary: { content: plain(summary, 80) },
    },
    body: {
      direction: 'vertical',
      padding: '12px 12px 16px 12px',
      vertical_spacing: '8px',
      elements,
    },
  };
}

export function workbenchConversationUrl(publicWorkbenchUrl: string, conversationId: string): string {
  const url = new URL(publicWorkbenchUrl);
  const base = url.pathname.replace(/\/$/u, '');
  url.pathname = `${base === '' ? '/workbench' : base}/conversations/${encodeURIComponent(conversationId)}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function companyNetworkUrl(publicProductUrl: string, companyId: string): string {
  return productUrl(publicProductUrl, `/companies/${encodeURIComponent(companyId)}`, 'relations');
}

export function industryChainUrl(publicProductUrl: string, industryId: string): string {
  return productUrl(publicProductUrl, `/industry/${encodeURIComponent(industryId)}`, 'chain');
}

export function processingCard(fileName: string): JsonObject {
  return bodyCard('资料处理中', [
    designTitleRow('③ BP 导入 · 事实核验', '处理中'),
    markdown(`**${markdownValue(fileName, 120)}**`, 'heading-2'),
    designPanel('处理进度', [
      factCard('资料接收', '文件已接收，正在解析并创建工作台深度分析任务', '已开始'),
      factCard('快速核验', 'Luna 正在提取公司、产品、融资、关系与基金匹配输入', '处理中'),
    ]),
    markdown("<font color='grey'>分析完成后本卡片会自动更新为结果，无需重复上传。</font>", 'notation'),
  ]);
}

export function companyResearchProcessingCard(companyName: string): JsonObject {
  return bodyCard('公司研究处理中', [
    designTitleRow('公司研究 · 快速分析', '处理中'),
    markdown(`**${markdownValue(companyName, 120)}**`, 'heading-2'),
    designPanel('处理进度', [
      factCard('研究会话', '正在创建工作台深度研究任务', '已开始'),
      factCard('快速分析', 'Luna 正在结合平台资料与公开来源生成摘要', '处理中'),
    ]),
    markdown("<font color='grey'>分析完成后本卡片会自动更新；深度研究在工作台后台独立运行。</font>", 'notation'),
  ]);
}

function productUrl(publicProductUrl: string, path: string, tab: string): string {
  const url = new URL(publicProductUrl);
  const base = url.pathname.replace(/\/$/u, '');
  url.pathname = `${base}${path}`;
  url.search = '';
  url.searchParams.set('tab', tab);
  url.hash = '';
  return url.toString();
}

export function completionCard(result: QuickCardResult, links: CompletionCardLinks): JsonObject {
  if (result.status === 'fallback') {
    return card('orange', '材料已接收 · 快速提取未完成', '深度分析任务已创建并继续运行', '深度分析中', [
      highlightBlock('快速分析', '快速提取失败，请进入工作台查看持续运行的深度分析。', 'orange-50', 'orange'),
      openUrlButton('进入深度分析', links.deepAnalysisUrl, true),
    ]);
  }

  const companyMatched = Boolean(result.navigation.companyId && links.companyNetworkUrl);
  const industryMatched = Boolean(result.navigation.industryId && links.industryChainUrl);
  const identityStatus = companyMatched ? '已关联已有公司' : 'BP 自陈 · 待深度分析';
  const footer = companyMatched
    ? '深度分析继续运行；本卡仅反映并核验本份 BP 自陈事实，跨文档完整网络见公司实体页。'
    : '深度分析继续运行；未匹配到已有公司，下钻入口将打开深度分析对话，建档由深度分析链路完成。';

  return bodyCard('BP 导入 · 事实核验', [
    designTitleRow('③ BP 导入 · 事实核验（6 维度 + 融资信息）', `置信度${result.confidenceLevel} ${result.confidence}%`),
    ...commonCompanyPanels(result, {
      informationTitle: '关键信息（来自 BP 事实核验）',
      highlightsTitle: '公司亮点（自陈）',
      identityStatus,
      factStatus: '自陈',
      marketStatus: 'BP 自陈 · 未外部核验',
      emptyHighlights: '材料未披露',
    }),
    designPanel('关联提示（本份 BP，可下钻）', [
      relationRow(
        '同业参考',
        relationPreview('本份 BP 提到竞品', result.competitorNames),
        companyMatched ? '完整网络 →' : '进入深度分析 →',
        companyMatched ? links.companyNetworkUrl! : links.deepAnalysisUrl,
      ),
      relationRow(
        '产业链提示',
        `${relationPreview('上游', result.upstreamNames)}；${relationPreview('下游', result.downstreamNames)}`,
        industryMatched ? '完整图谱 →' : '进入深度分析 →',
        industryMatched ? links.industryChainUrl! : links.deepAnalysisUrl,
      ),
    ]),
    fundMatchPanel(result.fundMatch),
    ...judgmentPanels(result, 'AI 初步识别'),
    markdown(`<font color='grey'>${footer}</font>`, 'notation'),
  ]);
}

export function companyResearchCompletionCard(
  result: CompanyQuickCardResult,
  links: CompletionCardLinks,
): JsonObject {
  if (result.status === 'fallback') {
    return card('orange', '公司研究已受理 · 快速分析未完成', '工作台深度研究继续运行', '深度研究中', [
      highlightBlock('快速分析', '快速分析暂未完成，请进入工作台查看独立运行的深度研究。', 'orange-50', 'orange'),
      openUrlButton('进入深度研究', links.deepAnalysisUrl, true),
    ]);
  }
  if (result.status === 'pending_confirmation' || result.identityState === 'ambiguous') {
    return card('orange', '公司主体需要确认', result.companyName, '待确认', [
      highlightBlock('主体匹配', result.companyIdentity, 'orange-50', 'orange'),
      markdown("<font color='grey'>系统不会自动猜测主体；确认后深度研究会继续。</font>", 'notation'),
      openUrlButton('进入深度研究确认', links.deepAnalysisUrl, true),
    ]);
  }
  const recentSignals = tagList(result.recentSignals, '暂未检索到近期信号');
  const existing = result.identityState === 'existing';
  const footer = existing
    ? '本卡综合平台正式知识、已有材料和本次公开检索；待确认候选不视为正式知识。深度研究继续运行。'
    : '本次研究新建了待确认主体；快速卡仅作预览，正式建档与知识确认在深度研究链路完成。';
  const navigationElements: JsonObject[] = [
    relationRow('深度研究', '查看完整来源、分析过程与待确认知识', '进入工作台 →', links.deepAnalysisUrl),
  ];
  if (existing && links.companyNetworkUrl) {
    navigationElements.push(relationRow('公司网络', '查看已有公司关系与网络', '公司网络 →', links.companyNetworkUrl));
  }
  if (existing && links.industryChainUrl) {
    navigationElements.push(relationRow('产业链', '查看已确认行业归属与产业链', '产业链 →', links.industryChainUrl));
  }
  return bodyCard('公司研究 · 快速分析', [
    designTitleRow('公司研究 · 快速分析', `置信度${result.confidenceLevel} ${result.confidence}%`),
    ...commonCompanyPanels(result, {
      informationTitle: '关键信息',
      highlightsTitle: '公司亮点',
      identityStatus: existing ? '已有主体' : '待确认主体',
      factStatus: '综合分析',
      marketStatus: '公开来源 / 已有资料 · 初步分析',
      emptyHighlights: '暂未检索到明确亮点',
    }),
    designPanel('关系线索（公开来源 / 已有资料）', [
      markdown(`**潜在竞对**　${markdownValue(relationPreview('提到', result.competitorNames), 240)}`),
      markdown(`**上游**　${markdownValue(relationPreview('提到', result.upstreamNames), 240)}`),
      markdown(`**下游 / 客户**　${markdownValue(relationPreview('提到', result.downstreamNames), 240)}`),
    ]),
    fundMatchPanel(result.fundMatch),
    ...judgmentPanels(result, 'AI 初步识别'),
    designPanel('分析依据与继续查看', [
      markdown(`**近期公开信号**\n${recentSignals}`),
      markdown(
        `**分析依据**\n公开来源 **${result.sourceCount}** 条 · 已有材料 **${result.materialCount}** 份 · 正式知识 **${result.formalKnowledgeCount}** 条 · 待确认候选 **${result.pendingCandidateCount}** 条`,
      ),
      ...navigationElements,
    ]),
    markdown(`<font color='grey'>${footer}</font>`, 'notation'),
  ]);
}

function commonCompanyPanels(
  result: CommonCompanyQuickCardFields,
  options: {
    informationTitle: string;
    highlightsTitle: string;
    identityStatus: string;
    factStatus: string;
    marketStatus: string;
    emptyHighlights: string;
  },
): JsonObject[] {
  return [
    markdown(`**${markdownValue(result.companyName, 80)}**`, 'heading-2'),
    designPanel(options.informationTitle, [
      factCard('公司身份', result.companyIdentity, options.identityStatus),
      factCard('产品 / 技术路线', result.productTechnology, options.factStatus),
      factCard('行业 / 赛道', result.industryTrack, options.factStatus),
      factCard('融资信息', result.financing, options.factStatus),
      factCard('团队关键人', result.keyPeople, options.factStatus),
      markdown(`**市场维度**\n${markdownValue(result.marketView, 240)} <text_tag color='neutral'>${markdownValue(options.marketStatus, 60)}</text_tag>`),
      markdown(`**${markdownValue(options.highlightsTitle, 80)}**\n${tagList(result.highlights, options.emptyHighlights)}`),
    ]),
  ];
}

function judgmentPanels(result: CommonCompanyQuickCardFields, riskStatus: string): JsonObject[] {
  return [
    designPanel('风险与尽调', [
      markdown(`**风险与待验证**\n${bulletList(result.riskSignals, '暂未识别到明确风险线索')}`),
      markdown(`**建议尽调问题**\n${numberedList(result.diligenceQuestions, '暂未生成尽调问题')}`),
      markdown(`<font color='grey'>${markdownValue(riskStatus, 80)} · 不构成投资判断</font>`, 'notation'),
    ]),
  ];
}

function fundMatchPanel(result: QuickCardResult['fundMatch']): JsonObject {
  const source = `${result.source.simulated ? '模拟清单' : '基金清单'} · ${result.source.asOfDate}`;
  if (result.status !== 'matched' || !result.recommended) {
    const message = result.status === 'insufficient_input'
      ? '当前行业、阶段、金额和区域信息不足，暂不生成基金匹配度。'
      : '当前清单中暂无可参与匹配的基金。';
    return designPanel('基金匹配', [
      markdown(message),
      markdown(`<font color='grey'>来源：${markdownValue(source, 100)}</font>`, 'notation'),
    ]);
  }
  const recommended = result.recommended;
  const dimensions = recommended.dimensions.map((item) => {
    const icon = item.score === item.maxScore ? '✓' : item.score > 0 ? '△' : '○';
    return `${icon} **${markdownValue(item.label, 40)} ${item.score}/${item.maxScore}**　${markdownValue(item.summary, 120)}`;
  }).join('\n');
  const alternatives = result.alternatives.length > 0
    ? `备选：${result.alternatives.map((item) => `${markdownValue(shortFundName(item.fundName), 40)} ${item.score}%`).join(' · ')}`
    : '';
  const sourceLine = `来源：${markdownValue(source, 100)} · 可匹配 ${result.eligibleFundCount} 只 · 排除 ${result.excludedFundCount} 只`;
  return designPanel('基金匹配（确定性规则）', [
    markdown(`**${markdownValue(recommended.fundName, 120)}**　<text_tag color='blue'>匹配度 ${recommended.score}%</text_tag>`),
    markdown(dimensions),
    markdown(`<font color='grey'>${[alternatives, sourceLine].filter(Boolean).join('\n')}</font>`, 'notation'),
  ]);
}

function tagList(values: string[], empty: string): string {
  return values.length > 0
    ? values.map((item) => `<text_tag color='blue'>${markdownValue(item, 64)}</text_tag>`).join(' ')
    : empty;
}

function bulletList(values: string[], empty: string): string {
  return values.length > 0
    ? values.map((item) => `• ${markdownValue(item, 120)}`).join('\n')
    : empty;
}

function numberedList(values: string[], empty: string): string {
  return values.length > 0
    ? values.map((item, index) => `${index + 1}. ${markdownValue(item, 160)}`).join('\n')
    : empty;
}

function relationPreview(prefix: string, names: string[]): string {
  if (names.length === 0) return `${prefix} 0 家`;
  const preview = names.slice(0, 2).join('、');
  return `${prefix} ${names.length} 家：${preview}${names.length > 2 ? '等' : ''}`;
}

function shortFundName(value: string): string {
  return value.replace(/(?:私募)?(?:股权|创业)?投资合伙企业（有限合伙）$/u, '').trim();
}

function designTitleRow(title: string, badge: string): JsonObject {
  return {
    tag: 'column_set',
    flex_mode: 'none',
    horizontal_spacing: '8px',
    columns: [
      {
        tag: 'column', width: 'weighted', weight: 5, vertical_align: 'center',
        elements: [markdown(`**${markdownValue(title, 100)}**`, 'notation')],
      },
      {
        tag: 'column', width: 'weighted', weight: 2, vertical_align: 'center',
        elements: [markdown(`<text_tag color='green'>${markdownValue(badge, 40)}</text_tag>`, 'notation')],
      },
    ],
  };
}

function designPanel(title: string, elements: JsonObject[]): JsonObject {
  return {
    tag: 'column_set',
    flex_mode: 'none',
    columns: [{
      tag: 'column', width: 'weighted', weight: 1, background_style: 'grey-50', padding: '8px', vertical_spacing: '6px',
      elements: [markdown(`**${markdownValue(title, 100)}**`, 'notation'), ...elements],
    }],
  };
}

function factCard(label: string, value: string, status: string): JsonObject {
  return {
    tag: 'column_set',
    flex_mode: 'none',
    columns: [{
      tag: 'column', width: 'weighted', weight: 1, background_style: 'white', padding: '8px 10px', vertical_spacing: '2px',
      elements: [markdown(
        `**<font color='blue'>${markdownValue(label, 60)}</font>**\n${markdownValue(compact(value), 180)} <text_tag color='neutral'>${markdownValue(status, 40)}</text_tag>`,
      )],
    }],
  };
}

function highlightBlock(title: string, content: string, background: string, color: string, formatted = false): JsonObject {
  return {
    tag: 'column_set',
    flex_mode: 'none',
    columns: [{
      tag: 'column', width: 'weighted', weight: 1, background_style: background, padding: '12px', vertical_spacing: '4px',
      elements: [
        markdown(`**<font color='${color}'>${markdownValue(title, 80)}</font>**`),
        markdown(formatted ? content : markdownValue(content, 240)),
      ],
    }],
  };
}

function relationRow(title: string, content: string, buttonText: string, url: string): JsonObject {
  return {
    tag: 'column_set',
    flex_mode: 'none',
    horizontal_spacing: '8px',
    background_style: 'blue-50',
    columns: [
      {
        tag: 'column', width: 'weighted', weight: 4, padding: '12px', vertical_spacing: '4px',
        elements: [
          markdown(`**<font color='blue'>${markdownValue(title, 60)}</font>**`),
          markdown(markdownValue(content, 160)),
        ],
      },
      {
        tag: 'column', width: 'weighted', weight: 2, padding: '12px', vertical_align: 'center',
        elements: [openUrlButton(buttonText, url, false)],
      },
    ],
  };
}

function compact(value: string, length = 96): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized.length <= length ? normalized : `${normalized.slice(0, length - 1)}…`;
}

export function failureCard(fileName: string, workbenchUrl?: string): JsonObject {
  const elements: JsonObject[] = [
    highlightBlock('处理未完成', `文件：${fileName}\n系统已记录失败，可稍后重试或在工作台查看。`, 'grey-50', 'grey'),
  ];
  if (workbenchUrl) elements.push(openUrlButton('在工作台查看', workbenchUrl, true));
  return card('red', '材料处理失败', '接入任务未完成', '需要处理', elements);
}

export function companyResearchFailureCard(companyName: string, workbenchUrl?: string): JsonObject {
  const elements: JsonObject[] = [
    highlightBlock('处理未完成', `公司：${companyName}\n系统已记录失败，可稍后重试或在工作台查看。`, 'grey-50', 'grey'),
  ];
  if (workbenchUrl) elements.push(openUrlButton('在工作台查看', workbenchUrl, true));
  return card('red', '公司研究接入失败', '研究任务未完成', '需要处理', elements);
}
