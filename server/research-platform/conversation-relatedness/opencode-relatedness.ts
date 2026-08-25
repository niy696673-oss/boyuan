import { Buffer } from 'node:buffer';
import type { OpenCodeAnalysisOptions } from '../analysis/opencode-analysis.js';
import {
  ConversationRelatednessError,
  type ConversationRelatednessPort,
} from './contracts.js';

interface OpenCodeSession { id: string }
interface OpenCodeAssistantResponse {
  info: { providerID: string; modelID: string; error?: unknown };
  parts: Array<{ type: string; text?: string }>;
}

export function createOpenCodeConversationRelatednessAdapter(options: OpenCodeAnalysisOptions): ConversationRelatednessPort {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const authorization = options.credentials
    ? `Basic ${Buffer.from(`${options.credentials.username}:${options.credentials.password}`).toString('base64')}`
    : undefined;
  const request = async <T>(path: string, init: RequestInit): Promise<T> => {
    const url = new URL(path, options.baseUrl);
    url.searchParams.set('directory', options.directory);
    const response = await fetcher(url, {
      ...init,
      headers: { ...(authorization ? { authorization } : {}), accept: 'application/json', 'content-type': 'application/json', ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new ConversationRelatednessError('relatedness_http_error', `OpenCode returned HTTP ${response.status}`);
    return await response.json() as T;
  };
  return {
    async suggest(input) {
      if (input.candidates.length === 0) return { providerId: 'opencode', modelId: 'not_called', score: 0, reason: '没有历史候选对话' };
      const session = await request<OpenCodeSession>('/session', {
        method: 'POST', body: JSON.stringify({ title: `博源对话相关性：${input.title}` }),
      });
      const body = {
        ...(options.model ? { model: { providerID: options.model.providerId, modelID: options.model.modelId } } : {}),
        system: '你是博源 AI 平台的对话归并判断器。只判断材料是否围绕同一公司主体、项目、研究主题或业务内容；时间间隔不是硬规则。只输出 JSON。',
        tools: { bash: false, edit: false, write: false, webfetch: false, websearch: false },
        parts: [{ type: 'text', text: JSON.stringify({
          task: '如存在明显相关的历史对话，选择唯一 targetConversationId；否则省略。score 为 0 到 1。不得选择候选列表外的 id。',
          outputSchema: { targetConversationId: '可选', score: 0.8, reason: '简短理由' },
          current: { title: input.title, companyName: input.companyName, content: input.content.slice(0, 12_000) },
          candidates: input.candidates.map((candidate) => ({ ...candidate, content: candidate.content.slice(0, 8_000) })),
        }) }],
      };
      const response = await request<OpenCodeAssistantResponse>(`/session/${encodeURIComponent(session.id)}/message`, {
        method: 'POST', body: JSON.stringify(body),
      });
      if (response.info.error) throw new ConversationRelatednessError('relatedness_message_error', 'OpenCode relatedness check failed');
      const raw = response.parts.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n').trim();
      return parseOutput(raw, response.info.providerID, response.info.modelID, new Set(input.candidates.map((candidate) => candidate.conversationId)));
    },
  };
}

function parseOutput(raw: string, providerId: string, modelId: string, allowed: Set<string>) {
  let parsed: unknown;
  try {
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(raw.trim());
    parsed = JSON.parse(fenced?.[1] ?? raw);
  } catch (error) {
    throw new ConversationRelatednessError('relatedness_json_invalid', 'relatedness did not return valid JSON', { cause: error });
  }
  if (!isRecord(parsed) || typeof parsed.score !== 'number' || typeof parsed.reason !== 'string') {
    throw new ConversationRelatednessError('relatedness_schema_invalid', 'relatedness JSON is invalid');
  }
  const target = typeof parsed.targetConversationId === 'string' && allowed.has(parsed.targetConversationId)
    ? parsed.targetConversationId : undefined;
  return {
    providerId,
    modelId,
    ...(target && parsed.score >= 0.62 ? { targetConversationId: target } : {}),
    score: Math.max(0, Math.min(1, parsed.score)),
    reason: parsed.reason.trim().slice(0, 240),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
