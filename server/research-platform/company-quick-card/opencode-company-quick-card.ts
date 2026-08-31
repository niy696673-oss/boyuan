import {
  createOpenCodeClient,
  type OpenCodeConnectionOptions,
} from '../opencode/client.js';
import {
  COMPANY_QUICK_CARD_LIST_FIELDS,
  COMPANY_QUICK_CARD_NUMBER_FIELDS,
  COMPANY_QUICK_CARD_TEXT_FIELDS,
  CompanyQuickCardAdapterError,
} from './contracts.js';
import { FUND_INDUSTRY_TAGS } from '../../../shared/fund-matching.js';
import type {
  CompanyQuickCardAnalysisInput,
  CompanyQuickCardAnalysisPort,
  CompanyQuickCardFields,
} from './contracts.js';

export interface OpenCodeCompanyQuickCardOptions extends OpenCodeConnectionOptions {
  model: { providerId: string; modelId: string };
  variant: string;
}

export function createOpenCodeCompanyQuickCardAdapter(
  options: OpenCodeCompanyQuickCardOptions,
): CompanyQuickCardAnalysisPort {
  const client = createOpenCodeClient(
    { ...options, timeoutMs: false },
    (status) => new CompanyQuickCardAdapterError(
      'company_quick_card_opencode_http_error',
      `OpenCode returned HTTP ${status}`,
    ),
    25_000,
  );
  return {
    async analyze(input) {
      const sessionId = await client.createSession(`博源公司快速研究：${input.companyName}`);
      const response = await client.sendMessage(sessionId, {
        model: { providerID: options.model.providerId, modelID: options.model.modelId },
        variant: options.variant,
        system: '你是博源 AI 平台的公司快速研究器。只依据给定的平台正式知识、材料摘要和公开检索结果。缺失信息统一写“暂未检索到”。不要调用任何工具。只输出 JSON 对象。',
        tools: { '*': false },
        parts: [{ type: 'text', text: companyQuickPrompt(input) }],
      });
      if (response.info.error) {
        throw new CompanyQuickCardAdapterError(
          'company_quick_card_opencode_message_error',
          'OpenCode company quick-card message failed',
        );
      }
      const rawText = response.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('\n')
        .trim();
      return {
        ...parseCompanyQuickCardJson(rawText),
        providerId: response.info.providerID,
        modelId: response.info.modelID,
        variant: response.info.variant ?? options.variant,
        sessionId,
      };
    },
  };
}

function companyQuickPrompt(input: CompanyQuickCardAnalysisInput): string {
  return [
    `公司：${input.companyName}`,
    `主体状态：${input.identityState === 'existing' ? '平台已有正式主体' : '本次研究新建的待确认主体'}`,
    `提取字段：${COMPANY_QUICK_CARD_TEXT_FIELDS.map((field) => `${field.name}（${field.prompt}）`).join('、')}。每个字符串最多 80 个汉字。`,
    `提取数组：${COMPANY_QUICK_CARD_LIST_FIELDS.map((field) => `${field.name}（${field.prompt}，最多 ${field.maximum} 项）`).join('、')}。未检索到时返回空数组。`,
    `industryTags 只能从以下标签中选择：${FUND_INDUSTRY_TAGS.join('、')}。`,
    `数值字段：${COMPANY_QUICK_CARD_NUMBER_FIELDS.map((field) => `${field.name}（${field.prompt}）`).join('、')}。`,
    '只输出上述字段。禁止增加公司名、统计、置信度、基金名称、匹配分数、Markdown 或解释；不得把待确认候选写成平台正式知识。',
    `平台正式知识：${JSON.stringify(input.existingKnowledge.slice(0, 80))}`,
    `已有材料摘要：${JSON.stringify(input.materialSummaries.slice(0, 20))}`,
    `公开检索结果：${JSON.stringify(input.webResults.slice(0, 5))}`,
  ].join('\n\n');
}

export function parseCompanyQuickCardJson(rawText: string): CompanyQuickCardFields {
  let value: unknown;
  try {
    value = JSON.parse(extractJsonObject(rawText));
  } catch (error) {
    throw new CompanyQuickCardAdapterError(
      'company_quick_card_json_invalid',
      'company quick-card response is not valid JSON',
      { cause: error },
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CompanyQuickCardAdapterError(
      'company_quick_card_schema_invalid',
      'company quick-card response must be an object',
    );
  }
  const record = value as Record<string, unknown>;
  const fieldNames = [
    ...COMPANY_QUICK_CARD_TEXT_FIELDS.map((field) => field.name),
    ...COMPANY_QUICK_CARD_LIST_FIELDS.map((field) => field.name),
    ...COMPANY_QUICK_CARD_NUMBER_FIELDS.map((field) => field.name),
  ];
  if (Object.keys(record).some((key) => !fieldNames.includes(key as typeof fieldNames[number]))) {
    throw new CompanyQuickCardAdapterError(
      'company_quick_card_schema_invalid',
      'company quick-card response contains unknown fields',
    );
  }
  const textFields = Object.fromEntries(COMPANY_QUICK_CARD_TEXT_FIELDS.map(({ name }) => {
    const fieldValue = record[name];
    if (typeof fieldValue !== 'string' || !fieldValue.trim()) {
      throw new CompanyQuickCardAdapterError(
        'company_quick_card_schema_invalid',
        `company quick-card field ${name} must be a non-empty string`,
      );
    }
    return [name, normalizeText(fieldValue)];
  }));
  const listFields = Object.fromEntries(COMPANY_QUICK_CARD_LIST_FIELDS.map(({ name, maximum }) => {
    const fieldValue = record[name];
    if (!Array.isArray(fieldValue) || fieldValue.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new CompanyQuickCardAdapterError(
        'company_quick_card_schema_invalid',
        `company quick-card field ${name} must be a string array`,
      );
    }
    const values = [...new Set(fieldValue.map((item) => normalizeText(item)))].slice(0, maximum);
    if (name === 'industryTags' && values.some((item) => !FUND_INDUSTRY_TAGS.includes(item as typeof FUND_INDUSTRY_TAGS[number]))) {
      throw new CompanyQuickCardAdapterError(
        'company_quick_card_schema_invalid',
        'company quick-card field industryTags contains unsupported values',
      );
    }
    return [name, values];
  }));
  const numberFields = Object.fromEntries(COMPANY_QUICK_CARD_NUMBER_FIELDS.map(({ name }) => {
    const fieldValue = record[name];
    if (fieldValue !== null && (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue) || fieldValue < 0)) {
      throw new CompanyQuickCardAdapterError(
        'company_quick_card_schema_invalid',
        `company quick-card field ${name} must be a non-negative number or null`,
      );
    }
    return [name, fieldValue === null ? null : Math.round(fieldValue)];
  }));
  return { ...textFields, ...listFields, ...numberFields } as CompanyQuickCardFields;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().slice(0, 160);
}

function extractJsonObject(rawText: string): string {
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  return start < 0 || end <= start ? rawText : rawText.slice(start, end + 1);
}
