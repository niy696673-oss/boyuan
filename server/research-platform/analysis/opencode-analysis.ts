import { Buffer } from 'node:buffer';
import { parseAnalysisJson } from './analysis-schema.js';
import {
  AnalysisAdapterError,
  BP_SECTION_KEYS,
  BP_SECTION_TITLES,
  type MaterialAnalysisInput,
  type MaterialAnalysisPort,
  type MaterialAnalysisResult,
} from './contracts.js';

export interface OpenCodeAnalysisOptions {
  baseUrl: URL;
  username?: string;
  password?: string;
  directory: string;
  model?: { providerId: string; modelId: string };
  variant?: string;
  requiredCapabilities?: OpenCodeRequiredCapabilities;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export interface OpenCodeRequiredCapabilities {
  skillName: string;
  mcpServer: string;
  mcpTool: string;
}

interface OpenCodeSession { id: string }
interface OpenCodeAssistantResponse {
  info: {
    id?: string;
    parentID?: string;
    role?: string;
    providerID: string;
    modelID: string;
    variant?: string;
    error?: unknown;
  };
  parts: OpenCodePart[];
}
interface OpenCodeSessionMessage {
  info: { parentID?: string; role?: string };
  parts: OpenCodePart[];
}
interface OpenCodePart {
  type: string;
  text?: string;
  tool?: string;
  state?: { status?: string; input?: Record<string, unknown> };
}

interface OpenCodeSkill { name: string }
interface OpenCodeMcpStatus { status?: string }

export function createOpenCodeAnalysisAdapter(options: OpenCodeAnalysisOptions): MaterialAnalysisPort {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 600_000;
  const authorization = options.username !== undefined && options.password !== undefined
    ? `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`
    : undefined;
  const request = async <T>(path: string, init: RequestInit): Promise<T> => {
    const url = endpointUrl(options.baseUrl, path);
    url.searchParams.set('directory', options.directory);
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.set('content-type', 'application/json');
    if (authorization) headers.set('authorization', authorization);
    const response = await fetcher(url, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new AnalysisAdapterError('opencode_http_error', `OpenCode returned HTTP ${response.status}`);
    return await response.json() as T;
  };
  const assertRequiredCapabilities = async (): Promise<void> => {
    const required = options.requiredCapabilities;
    const skills = required
      ? await request<OpenCodeSkill[]>('/skill', { method: 'GET' })
      : [];
    if (required && !skills.some((skill) => skill.name === required.skillName)) {
      throw new AnalysisAdapterError(
        'opencode_required_skill_unavailable',
        `OpenCode skill is unavailable: ${required.skillName}`,
      );
    }
    const mcp = required
      ? await request<Record<string, OpenCodeMcpStatus>>('/mcp', { method: 'GET' })
      : {};
    if (required && mcp[required.mcpServer]?.status !== 'connected') {
      throw new AnalysisAdapterError(
        'opencode_required_mcp_unavailable',
        `OpenCode MCP is not connected: ${required.mcpServer}`,
      );
    }
  };
  return {
    async analyze(input): Promise<MaterialAnalysisResult> {
      await assertRequiredCapabilities();
      const required = options.requiredCapabilities;
      const sessionId = input.sessionId ?? (await request<OpenCodeSession>('/session', {
        method: 'POST', body: JSON.stringify({ title: `博源 BP 分析：${input.companyName}` }),
      })).id;
      const body = {
        ...(options.model ? { model: { providerID: options.model.providerId, modelID: options.model.modelId } } : {}),
        ...(options.variant ? { variant: options.variant } : {}),
        system: systemInstruction(),
        tools: {
          '*': false,
          ...(required ? { skill: true, [required.mcpTool]: true } : {}),
        },
        parts: [{ type: 'text', text: analysisPrompt(input, required) }],
      };
      let response: OpenCodeAssistantResponse;
      try {
        response = await request<OpenCodeAssistantResponse>(`/session/${encodeURIComponent(sessionId)}/message`, {
          method: 'POST', body: JSON.stringify(body),
        });
      } catch (error) {
        await request<boolean>(`/session/${encodeURIComponent(sessionId)}/abort`, {
          method: 'POST', signal: AbortSignal.timeout(10_000),
        }).catch(() => undefined);
        throw error;
      }
      if (response.info.error) throw new AnalysisAdapterError('opencode_message_error', 'OpenCode analysis message failed');
      const messages = await request<OpenCodeSessionMessage[]>(`/session/${encodeURIComponent(sessionId)}/message?limit=100`, {
        method: 'GET',
      });
      const turnMessages = response.info.parentID
        ? messages.filter((message) => message.info.role === 'assistant' && message.info.parentID === response.info.parentID)
        : [response];
      const successfulToolParts = turnMessages.flatMap((message) => message.parts).filter((part) => (
        part.type === 'tool' && part.tool && part.state?.status === 'completed'
      ));
      const toolUsage = [...new Set(successfulToolParts.flatMap((part) => part.tool ? [part.tool] : []))];
      const skillLoaded = !required || successfulToolParts.some((part) => (
        part.tool === 'skill' && part.state?.input?.name === required.skillName
      ));
      const mcpToolUsed = !required
        || successfulToolParts.some((part) => part.tool === required.mcpTool);
      const missingTool = !skillLoaded ? `skill:${required?.skillName}`
        : !mcpToolUsed ? required?.mcpTool
          : undefined;
      if (missingTool) {
        throw new AnalysisAdapterError('opencode_required_tool_missing', `OpenCode analysis did not call required tool: ${missingTool}`);
      }
      const rawText = response.parts.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n').trim();
      const parsed = parseAnalysisJson(rawText);
      return {
        providerId: response.info.providerID,
        modelId: response.info.modelID,
        variant: response.info.variant ?? options.variant ?? 'default',
        sessionId,
        toolUsage,
        sections: parsed.sections,
        candidates: parsed.candidates,
        rawText,
      };
    },
  };
}

function endpointUrl(baseUrl: URL, path: string): URL {
  const normalizedBase = new URL(baseUrl);
  if (!normalizedBase.pathname.endsWith('/')) normalizedBase.pathname += '/';
  return new URL(path.replace(/^\/+/, ''), normalizedBase);
}

function systemInstruction(): string {
  return '你是博源 AI 平台的材料分析器。事实结论只使用用户提供的带 blockId 材料，不补写材料中没有的事实。可以使用指定 Skill 和 Sequential Thinking 做流程约束与自检，但工具输出不能作为材料证据；禁止外部搜索。只输出一个 JSON 对象，不要 Markdown 围栏或额外解释。';
}

function analysisPrompt(
  input: MaterialAnalysisInput,
  required?: OpenCodeRequiredCapabilities,
): string {
  const sections = BP_SECTION_KEYS.map((key) => ({ key, title: BP_SECTION_TITLES[key], summary: '', blockIds: [] }));
  const blocks = input.blocks.map((block) => ({
    blockId: block.blockId,
    locator: { page: block.page, paragraph: block.paragraph, headingPath: block.headingPath },
    text: block.text,
  }));
  return [
    `公司：${input.companyName}`,
    ...(required ? [`先调用 skill 工具加载“${required.skillName}”，并严格遵循其中的分析流程与证据边界。`] : []),
    ...(required ? [`在生成最终 JSON 前调用“${required.mcpTool}”工具检查主体识别、13 维覆盖、证据引用和冲突。`] : []),
    '请按固定顺序完成全部 13 个 BP 维度，并生成粒度为“一个目标、一个事实或观点、一个时间口径”的候选。没有材料依据的维度 summary 必须写“材料未披露”或“证据不足”，不得补造。',
    '公司主体必须区分集团、母公司、子公司、具备独立法律主体的项目公司，以及非独立品牌/项目。关系候选使用 parent_company、subsidiary 或 project_company；别名候选使用 brand、short_name、english_name 或 project_name，并在 value 中只写主体或别名名称。关系不明确时保留为待确认候选，不强行合并。',
    '候选必须至少引用一个有效 blockId。请结合材料内容自行判断 highImpact 和 sensitive；这是 AI 标记，不能仅按字段名称套用固定规则。',
    `输出 schema 示例：${JSON.stringify({ sections, candidates: [{ sectionKey: 'core_technology_and_ip', knowledgeType: 'core_product', statement: '完整陈述', value: '可选结构值', effectiveAt: '可选时间口径', blockIds: ['block-id'], highImpact: true, sensitive: false }] })}`,
    `已确认知识（只用于发现增量或冲突）：${JSON.stringify(input.existingKnowledge)}`,
    `材料块：${JSON.stringify(blocks)}`,
  ].join('\n\n');
}
