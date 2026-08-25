import type { OpenCodeAnalysisOptions } from '../analysis/opencode-analysis.js';
import { createOpenCodeClient } from '../opencode/client.js';
import {
  SemanticSearchAdapterError,
  type SemanticEntityType,
  type SemanticSearchHit,
  type SemanticSearchPort,
} from './contracts.js';

export function createOpenCodeSemanticSearchAdapter(options: OpenCodeAnalysisOptions): SemanticSearchPort {
  const client = createOpenCodeClient(
    options,
    (status) => new SemanticSearchAdapterError('semantic_search_http_error', `OpenCode returned HTTP ${status}`),
    180_000,
  );
  return {
    async search(input) {
      const sessionId = await client.createSession(`博源语义搜索：${input.query}`);
      const body = {
        ...(options.model ? { model: { providerID: options.model.providerId, modelID: options.model.modelId } } : {}),
        system: '你是博源 AI 平台的内部语义检索器。只根据给定语料判断相关性；不得补造事实。只输出 JSON，不要 Markdown。',
        tools: { bash: false, edit: false, write: false, webfetch: false, websearch: false },
        parts: [{ type: 'text', text: JSON.stringify({
          task: '找出与 query 语义相关的对象。reason 必须简短说明相关性；evidenceIds 只能从对象提供的 evidence 中选择。未确认候选不在语料中。',
          query: input.query,
          limit: input.limit,
          outputSchema: { hits: [{ id: '对象 id', type: 'company|material|conversation|industry', score: 0.9, reason: '相关性说明', evidenceIds: ['证据 id'] }] },
          items: input.items,
        }) }],
      };
      const response = await client.sendMessage(sessionId, body);
      if (response.info.error) throw new SemanticSearchAdapterError('semantic_search_message_error', 'OpenCode semantic search failed');
      const raw = response.parts.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n').trim();
      return {
        providerId: response.info.providerID,
        modelId: response.info.modelID,
        hits: parseHits(raw, input.items.map((item) => ({ id: item.id, type: item.type, evidenceIds: new Set(item.evidence.map((evidence) => evidence.evidenceId)) })), input.limit),
      };
    },
  };
}

function parseHits(raw: string, allowed: Array<{ id: string; type: SemanticEntityType; evidenceIds: Set<string> }>, limit: number): SemanticSearchHit[] {
  let parsed: unknown;
  try {
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(raw.trim());
    parsed = JSON.parse(fenced?.[1] ?? raw);
  } catch (error) {
    throw new SemanticSearchAdapterError('semantic_search_json_invalid', 'semantic search did not return valid JSON', { cause: error });
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.hits)) throw new SemanticSearchAdapterError('semantic_search_schema_invalid', 'semantic search JSON must contain hits');
  const byId = new Map(allowed.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const hits: SemanticSearchHit[] = [];
  for (const value of parsed.hits) {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.type !== 'string'
      || typeof value.score !== 'number' || typeof value.reason !== 'string' || !Array.isArray(value.evidenceIds)) continue;
    const target = byId.get(value.id);
    if (!target || target.type !== value.type || seen.has(value.id)) continue;
    seen.add(value.id);
    hits.push({
      id: value.id,
      type: target.type,
      score: Math.max(0, Math.min(1, value.score)),
      reason: value.reason.trim().slice(0, 160),
      evidenceIds: [...new Set(value.evidenceIds.filter((id): id is string => typeof id === 'string' && target.evidenceIds.has(id)))].slice(0, 3),
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
