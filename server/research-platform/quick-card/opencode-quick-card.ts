import {
  createOpenCodeClient,
  type OpenCodeConnectionOptions,
} from '../opencode/client.js';
import { QUICK_CARD_FIELDS } from './contracts.js';
import type { QuickCardAnalysisPort, QuickCardFields } from './contracts.js';
import { QuickCardAdapterError } from './contracts.js';

export interface OpenCodeQuickCardOptions extends OpenCodeConnectionOptions {
  model: { providerId: string; modelId: string };
  variant: string;
}

const MAX_BLOCKS = 160;
const MAX_BLOCK_CHARACTERS = 4_000;
const MAX_TOTAL_CHARACTERS = 48_000;
const QUICK_DISABLED_TOOLS = [
  'invalid', 'question', 'bash', 'read', 'glob', 'grep', 'edit', 'write', 'task',
  'webfetch', 'todowrite', 'websearch', 'skill', 'apply_patch',
  'sequential-thinking_sequentialthinking',
] as const;

export function createOpenCodeQuickCardAdapter(options: OpenCodeQuickCardOptions): QuickCardAnalysisPort {
  const client = createOpenCodeClient(
    options,
    (status) => new QuickCardAdapterError('quick_card_opencode_http_error', `OpenCode returned HTTP ${status}`),
    25_000,
  );
  return {
    async analyze(input) {
      const sessionId = await client.createSession(`博源 BP 快速卡：${input.fileName}`);
      const response = await client.sendMessage(sessionId, {
          model: { providerID: options.model.providerId, modelID: options.model.modelId },
          variant: options.variant,
          system: '你是博源 AI 平台的快速材料提取器。只依据给定材料，缺失信息统一写“材料未披露”。不要调用任何工具。只输出 JSON 对象。',
          tools: Object.fromEntries(QUICK_DISABLED_TOOLS.map((tool) => [tool, false])),
          parts: [{ type: 'text', text: quickPrompt(input.fileName, input.blocks) }],
      });
      if (response.info.error) throw new QuickCardAdapterError('quick_card_opencode_message_error', 'OpenCode quick-card message failed');
      const rawText = response.parts.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n').trim();
      return {
        ...parseQuickCardJson(rawText),
        providerId: response.info.providerID,
        modelId: response.info.modelID,
        variant: response.info.variant ?? options.variant,
        sessionId,
      };
    },
  };
}

function quickPrompt(fileName: string, blocks: QuickCardAnalysisInputBlocks): string {
  let total = 0;
  const selected: Array<{ blockId: string; text: string }> = [];
  for (const block of blocks.slice(0, MAX_BLOCKS)) {
    if (total >= MAX_TOTAL_CHARACTERS) break;
    const text = block.text.slice(0, Math.min(MAX_BLOCK_CHARACTERS, MAX_TOTAL_CHARACTERS - total));
    if (!text.trim()) continue;
    selected.push({ blockId: block.blockId, text });
    total += text.length;
  }
  return [
    `文件：${fileName}`,
    `快速提取以下 6 个简短字段，每项最多 80 个汉字：${QUICK_CARD_FIELDS.map((field) => `${field.name}（${field.prompt}）`).join('、')}。`,
    '信息未出现时写“材料未披露”，不得推测。只输出这 6 个字符串字段，禁止增加字段、Markdown 或解释。',
    `材料块：${JSON.stringify(selected)}`,
  ].join('\n\n');
}

type QuickCardAnalysisInputBlocks = ReadonlyArray<{ blockId: string; text: string }>;

export function parseQuickCardJson(rawText: string): QuickCardFields {
  let value: unknown;
  try {
    value = JSON.parse(extractJsonObject(rawText));
  } catch (error) {
    throw new QuickCardAdapterError('quick_card_json_invalid', 'quick-card response is not valid JSON', { cause: error });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new QuickCardAdapterError('quick_card_schema_invalid', 'quick-card response must be an object');
  }
  const record = value as Record<string, unknown>;
  const fieldNames = QUICK_CARD_FIELDS.map((field) => field.name);
  if (Object.keys(record).some((key) => !fieldNames.includes(key as typeof fieldNames[number]))) {
    throw new QuickCardAdapterError('quick_card_schema_invalid', 'quick-card response contains unknown fields');
  }
  return Object.fromEntries(QUICK_CARD_FIELDS.map(({ name }) => {
    const fieldValue = record[name];
    if (typeof fieldValue !== 'string' || !fieldValue.trim()) {
      throw new QuickCardAdapterError('quick_card_schema_invalid', `quick-card field ${name} must be a non-empty string`);
    }
    return [name, fieldValue.replace(/\s+/gu, ' ').trim().slice(0, 160)];
  })) as unknown as QuickCardFields;
}

function extractJsonObject(rawText: string): string {
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start < 0 || end <= start) return rawText;
  return rawText.slice(start, end + 1);
}
