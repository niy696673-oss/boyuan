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

function card(template: 'green' | 'orange' | 'red' | 'blue', title: string, subtitle: string, tagText: string, elements: JsonObject[]): JsonObject {
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
        color: template === 'green' ? 'green' : template === 'orange' ? 'orange' : template === 'red' ? 'red' : 'blue',
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
      factCard('资料接收', '文件已接收，正在解析材料', '已开始'),
      factCard('快速核验', '正在提取公司、产品、融资、关系与基金匹配输入', '处理中'),
    ]),
    markdown("<font color='grey'>分析完成后本卡片会自动更新为结果，无需重复上传。</font>", 'notation'),
  ]);
}

export function companyResearchProcessingCard(companyName: string): JsonObject {
  return bodyCard('公司研究处理中', [
    designTitleRow('公司研究 · 快速分析', '处理中'),
    markdown(`**${markdownValue(companyName, 120)}**`, 'heading-2'),
    designPanel('处理进度', [
      factCard('研究会话', '正在识别公司并检索公开资料', '已开始'),
      factCard('快速分析', '正在结合已有资料与公开来源生成摘要', '处理中'),
    ]),
    markdown("<font color='grey'>分析完成后本卡片会自动更新，无需重复发送。</font>", 'notation'),
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

export function completionCard(result: QuickCardResult, _links: CompletionCardLinks): JsonObject {
  if (result.status === 'fallback') {
    return card('orange', '材料已接收 · 快速提取未完成', '请稍后重试', '待重试', [
      highlightBlock('快速分析', '本次快速提取未完成，请稍后重新发送材料。', 'orange-50', 'orange'),
    ]);
  }

  const identityStatus = result.navigation.companyId ? '已关联已有公司' : 'BP 自陈 · 待核验';
  const footer = '本卡依据本份 BP 提取自陈信息，尚未进行独立外部核验；不构成投资判断。';

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
    designPanel('关联提示（本份 BP）', [
      markdown(`**同业参考**　${markdownValue(relationPreview('本份 BP 提到竞品', result.competitorNames), 240)}`),
      markdown(`**产业链提示**　${markdownValue(`${relationPreview('上游', result.upstreamNames)}；${relationPreview('下游', result.downstreamNames)}`, 240)}`),
    ]),
    fundMatchPanel(result.fundMatch),
    ...judgmentPanels(result, 'AI 初步识别'),
    markdown(`<font color='grey'>${footer}</font>`, 'notation'),
  ]);
}

export function companyResearchCompletionCard(
  result: CompanyQuickCardResult,
  _links: CompletionCardLinks,
): JsonObject {
  if (result.status === 'fallback') {
    return card('orange', '公司研究已受理 · 快速分析未完成', '请稍后重试', '待重试', [
      highlightBlock('快速分析', '本次快速分析未完成，请稍后重新发送公司名称。', 'orange-50', 'orange'),
    ]);
  }
  if (result.status === 'pending_confirmation' || result.identityState === 'ambiguous') {
    return card('orange', '公司主体需要确认', result.companyName, '待确认', [
      highlightBlock('主体匹配', result.companyIdentity, 'orange-50', 'orange'),
      markdown("<font color='grey'>系统不会自动猜测主体；请补充公司全称或地区后重新发送分析请求。</font>", 'notation'),
    ]);
  }
  const recentSignals = tagList(result.recentSignals, '暂未检索到近期信号');
  const existing = result.identityState === 'existing';
  const footer = existing
    ? '本卡综合已有资料与本次公开检索；待确认信息不视为正式知识，不构成投资判断。'
    : '本次研究的公司主体尚待核验；结果仅作初步参考，不构成投资判断。';
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
    designPanel('分析依据', [
      markdown(`**近期公开信号**\n${recentSignals}`),
      markdown(
        `**分析依据**\n公开来源 **${result.sourceCount}** 条 · 已有材料 **${result.materialCount}** 份 · 正式知识 **${result.formalKnowledgeCount}** 条 · 待确认候选 **${result.pendingCandidateCount}** 条`,
      ),
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
    ? `备选基金：${result.alternatives.map((item) => markdownValue(shortFundName(item.fundName), 40)).join(' · ')}`
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

function compact(value: string, length = 96): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized.length <= length ? normalized : `${normalized.slice(0, length - 1)}…`;
}

export function failureCard(fileName: string, _workbenchUrl?: string): JsonObject {
  const elements: JsonObject[] = [
    highlightBlock('处理未完成', `文件：${fileName}\n本次处理未完成，请稍后重试。`, 'grey-50', 'grey'),
  ];
  return card('red', '材料处理失败', '接入任务未完成', '需要处理', elements);
}

export function companyResearchFailureCard(companyName: string, _workbenchUrl?: string): JsonObject {
  const elements: JsonObject[] = [
    highlightBlock('处理未完成', `公司：${companyName}\n本次处理未完成，请稍后重试。`, 'grey-50', 'grey'),
  ];
  return card('red', '公司研究接入失败', '研究任务未完成', '需要处理', elements);
}

export function welcomeCard(): JsonObject {
  return card(
    'blue',
    '博源 AI 投研助手',
    'BP 深度分析 · 公司快速调研 · 投研问答',
    '使用指南',
    [
      markdown('👋 **欢迎使用博源 AI 平台！** 我是您的 AI 投研助手，专注于商业计划书（BP）智能解析与企业投研信息挖掘。', 'normal'),
      designPanel('💡 您可以随时向我发起以下任务', [
        factCard('📄 商业计划书 (BP) 深度分析', '直接发送 BP 或项目材料 PDF 文件（50MB 内），我将自动为您生成 13 维深度分析卡片，并提取核心事实依据。', '发送 PDF'),
        factCard('🔍 企业快速调研', '在对话框直接发送公司全称（如“北京极智嘉科技股份有限公司”），我将检索公开信息并生成核心速览。', '发送公司名'),
        factCard('💬 投研多轮交互问答', '围绕已上传的材料或调研企业进行持续追问、交叉核验与深入交流。', '多轮对话'),
      ]),
      markdown("<font color='grey'>💡 提示：您现在就可以直接发送一份 BP PDF 文件，或输入一家感兴趣的企业名称开始体验！</font>", 'notation'),
    ],
  );
}

export function wechatWelcomeText(): string {
  return [
    '👋 欢迎使用博源 AI 平台！我是您的 AI 投研助手，专注于商业计划书（BP）智能解析与企业投研信息挖掘。',
    '',
    '💡 您可以随时向我发起以下任务：',
    '1. 📄 商业计划书 (BP) 深度分析：直接发送 BP 或项目材料 PDF 文件（50MB 内），我将自动为您生成深度分析卡片与核心事实核验。',
    '2. 🔍 企业快速调研：直接发送公司全称（如“北京极智嘉科技股份有限公司”），我将检索公开信息并生成核心速览。',
    '3. 💬 投研多轮交互问答：围绕已上传材料或调研企业进行持续追问、交叉核验与交流。',
    '',
    '提示：您现在就可以直接发送一份 BP PDF 文件，或输入一家感兴趣的企业名称开始体验！',
  ].join('\n');
}

