import { Buffer } from 'node:buffer';
import { AnalysisAdapterError } from '../analysis/contracts.js';
import type { CompanyResearchInput, CompanyResearchPort, CompanyResearchResult } from './contracts.js';
import { parseResearchJson } from './research-schema.js';

export interface OpenCodeResearchOptions {
  baseUrl: URL;
  username: string;
  password: string;
  directory: string;
  model?: { providerId: string; modelId: string };
  fetcher?: typeof fetch;
}

interface OpenCodeSession { id: string }
interface OpenCodeAssistantResponse {
  info: { providerID: string; modelID: string; error?: unknown };
  parts: Array<{ type: string; text?: string }>;
}

export function createOpenCodeResearchAdapter(options: OpenCodeResearchOptions): CompanyResearchPort {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`;
  const request = async <T>(path: string, init: RequestInit): Promise<T> => {
    const url = new URL(path, options.baseUrl);
    url.searchParams.set('directory', options.directory);
    const response = await fetcher(url, {
      ...init,
      headers: { authorization, accept: 'application/json', 'content-type': 'application/json', ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new AnalysisAdapterError('opencode_http_error', `OpenCode returned HTTP ${response.status}`);
    return await response.json() as T;
  };
  return {
    async analyze(input): Promise<CompanyResearchResult> {
      const sessionId = input.sessionId ?? (await request<OpenCodeSession>('/session', {
        method: 'POST', body: JSON.stringify({ title: `博源公司研究：${input.companyName}` }),
      })).id;
      const response = await request<OpenCodeAssistantResponse>(`/session/${encodeURIComponent(sessionId)}/message`, {
        method: 'POST',
        body: JSON.stringify({
          ...(options.model ? { model: { providerID: options.model.providerId, modelID: options.model.modelId } } : {}),
          system: '你是博源 AI 平台的公司研究分析器。只使用输入的已确认知识和带 URL 公开来源；不使用工具，不把未确认内容写成事实。只输出 JSON。',
          tools: { bash: false, edit: false, write: false, webfetch: false, websearch: false },
          parts: [{ type: 'text', text: researchPrompt(input) }],
        }),
      });
      if (response.info.error) throw new AnalysisAdapterError('opencode_message_error', 'OpenCode research message failed');
      const rawText = response.parts.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n').trim();
      const parsed = parseResearchJson(rawText);
      return {
        providerId: response.info.providerID,
        modelId: response.info.modelID,
        sessionId,
        summary: parsed.summary,
        candidates: parsed.candidates,
        rawText,
      };
    },
  };
}

function researchPrompt(input: CompanyResearchInput): string {
  return [
    `公司：${input.companyName}`,
    `用户研究意图：${input.intent}`,
    `外部搜索触发原因：${input.triggerReason ?? '未触发'}`,
    '请给出简洁研究摘要和可确认候选。每条候选必须引用 webResults 中至少一个完整 URL。没有可靠公开证据时返回空 candidates。',
    `输出 schema：${JSON.stringify({ summary: '研究摘要', candidates: [{ knowledgeType: 'external_update', statement: '完整陈述', value: '可选', effectiveAt: '可选', evidenceUrls: ['https://example.com/source'], highImpact: false, sensitive: false }] })}`,
    `已确认知识：${JSON.stringify(input.existingKnowledge)}`,
    `本对话未确认候选（必须显式作为未确认内容对待）：${JSON.stringify(input.pendingCandidates)}`,
    `公开搜索结果：${JSON.stringify(input.webResults)}`,
  ].join('\n\n');
}
