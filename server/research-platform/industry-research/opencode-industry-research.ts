import { AnalysisAdapterError } from '../analysis/contracts.js';
import {
  createOpenCodeClient,
  type OpenCodeAssistantResponse,
  type OpenCodeConnectionOptions,
} from '../opencode/client.js';
import type {
  IndustryResearchInput,
  IndustryResearchPort,
  IndustryResearchResult,
} from './contracts.js';
import { parseIndustryResearchJson } from './industry-research-schema.js';

export interface OpenCodeIndustryResearchOptions extends OpenCodeConnectionOptions {
  model?: { providerId: string; modelId: string };
  variant?: string;
}

export function createOpenCodeIndustryResearchAdapter(
  options: OpenCodeIndustryResearchOptions,
): IndustryResearchPort {
  const client = createOpenCodeClient(
    options,
    (status) => new AnalysisAdapterError(
      'opencode_http_error',
      `OpenCode returned HTTP ${status}`,
    ),
    600_000,
  );
  return {
    async analyze(input): Promise<IndustryResearchResult> {
      const sessionId = input.sessionId
        ?? await client.createSession(`博源行业研究：${input.industryName}`);
      let response: OpenCodeAssistantResponse;
      try {
        response = await client.sendMessage(sessionId, {
          ...(options.model
            ? { model: { providerID: options.model.providerId, modelID: options.model.modelId } }
            : {}),
          ...(options.variant ? { variant: options.variant } : {}),
          system: '你是博源 AI 平台的行业研究分析器。只能使用输入中的行业材料、正式行业结构和带 URL 的公开来源；不得调用工具，不得把未知信息补成事实。只输出 JSON。',
          tools: { '*': false },
          parts: [{ type: 'text', text: industryResearchPrompt(input) }],
        });
      } catch (error) {
        await client.abortSession(sessionId).catch(() => undefined);
        throw error;
      }
      if (response.info.error) {
        throw new AnalysisAdapterError(
          'opencode_message_error',
          'OpenCode industry research message failed',
        );
      }
      const rawText = response.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('\n')
        .trim();
      const parsed = parseIndustryResearchJson(rawText);
      return {
        providerId: response.info.providerID,
        modelId: response.info.modelID,
        sessionId,
        summary: parsed.summary,
        rawText,
      };
    },
  };
}

function industryResearchPrompt(input: IndustryResearchInput): string {
  return [
    `行业：${input.industryName}`,
    `研究意图：${input.intent}`,
    `已有行业摘要：${input.industrySummary || '尚无正式摘要'}`,
    `产业链节点：${JSON.stringify(input.nodes)}`,
    `行业材料摘录：${JSON.stringify(input.materials)}`,
    `公开搜索结果：${JSON.stringify(input.webResults)}`,
    '请用简体中文给出证据边界清晰的行业研究摘要，区分材料陈述、公开来源和未知项。不要生成或修改公司正式知识。',
    `输出 schema：${JSON.stringify({ summary: '行业研究摘要' })}`,
  ].join('\n\n');
}
