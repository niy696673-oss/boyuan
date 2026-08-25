import { Buffer } from 'node:buffer';
import type { OpenCodeAnalysisOptions } from '../analysis/opencode-analysis.js';
import {
  CompanyListExtractionError,
  type CompanyListExtractionPort,
  type CompanyNameExtraction,
} from './contracts.js';

interface OpenCodeSession { id: string }
interface OpenCodeAssistantResponse {
  info: { providerID: string; modelID: string; error?: unknown };
  parts: Array<{ type: string; text?: string }>;
}

export function createOpenCodeCompanyListExtractionAdapter(options: OpenCodeAnalysisOptions): CompanyListExtractionPort {
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
    if (!response.ok) throw new CompanyListExtractionError('company_list_ai_http_error', `OpenCode returned HTTP ${response.status}`);
    return await response.json() as T;
  };
  return {
    async extract(input) {
      const session = await request<OpenCodeSession>('/session', {
        method: 'POST', body: JSON.stringify({ title: `博源公司名单识别：${input.fileName}` }),
      });
      const body = {
        ...(options.model ? { model: { providerID: options.model.providerId, modelID: options.model.modelId } } : {}),
        system: '你是博源 AI 平台的公司名单识别器。只从给定文本块提取公司或具备独立主体可能的机构名称，不补造。只输出 JSON。',
        tools: { bash: false, edit: false, write: false, webfetch: false, websearch: false },
        parts: [{ type: 'text', text: JSON.stringify({
          task: '输入可能是排行榜、自然语言、表格或文档段落。提取其中每个公司名称，保留来源 blockId。品牌或项目名若不能确认是独立主体也可输出，但名称必须忠实来自原文，后续会人工确认。',
          outputSchema: { companies: [{ name: '公司名称', blockId: '来源块 id' }] },
          blocks: input.blocks.map((block) => ({ blockId: block.blockId, text: block.text })),
        }) }],
      };
      const response = await request<OpenCodeAssistantResponse>(`/session/${encodeURIComponent(session.id)}/message`, {
        method: 'POST', body: JSON.stringify(body),
      });
      if (response.info.error) throw new CompanyListExtractionError('company_list_ai_message_error', 'OpenCode company-list extraction failed');
      const raw = response.parts.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n').trim();
      return {
        providerId: response.info.providerID,
        modelId: response.info.modelID,
        companies: parseCompanies(raw, new Map(input.blocks.map((block) => [block.blockId, block.text]))),
      };
    },
  };
}

function parseCompanies(raw: string, blocks: Map<string, string>): CompanyNameExtraction[] {
  let parsed: unknown;
  try {
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(raw.trim());
    parsed = JSON.parse(fenced?.[1] ?? raw);
  } catch (error) {
    throw new CompanyListExtractionError('company_list_ai_json_invalid', 'company-list extraction did not return valid JSON', { cause: error });
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.companies)) {
    throw new CompanyListExtractionError('company_list_ai_schema_invalid', 'company-list extraction JSON must contain companies');
  }
  const seen = new Set<string>();
  const result: CompanyNameExtraction[] = [];
  for (const item of parsed.companies) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.blockId !== 'string') continue;
    const originalText = blocks.get(item.blockId);
    const name = item.name.trim();
    const key = `${item.blockId}:${name}`;
    if (!originalText || name.length < 2 || name.length > 80 || seen.has(key)) continue;
    seen.add(key);
    result.push({ name, blockId: item.blockId, originalText });
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
