import type { PlatformConfig } from "./config.js";
import type { ModelGateway, ModelRequest, ModelResult } from "./contracts.js";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function callChat(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  context: string;
}): Promise<Omit<ModelResult, "provider" | "latencyMs">> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(
      `${input.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content:
                "你是博源投资研究助手。仅根据提供的证据回答；区分事实、企业表述、观点和推断；每个关键结论使用 [证据N] 标记。没有证据时明确说明。",
            },
            {
              role: "user",
              content: `研究问题：${input.prompt}\n\n证据：\n${input.context}`,
            },
          ],
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`);
    const payload = (await response.json()) as ChatResponse;
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("MODEL_EMPTY_RESPONSE");
    return {
      model: input.model,
      text,
      inputTokens:
        payload.usage?.prompt_tokens ||
        Math.ceil((input.prompt.length + input.context.length) / 3),
      outputTokens:
        payload.usage?.completion_tokens || Math.ceil(text.length / 3),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export class RoutedModelGateway implements ModelGateway {
  constructor(private readonly config: PlatformConfig) {}

  async generate(request: ModelRequest): Promise<ModelResult> {
    const started = performance.now();
    const context = request.context
      .map((hit, index) => `[证据${index + 1}] ${hit.fileName}\n${hit.excerpt}`)
      .join("\n\n");
    if (this.config.MODEL_ROUTE === "external_only") {
      if (!request.externalAllowed || !this.config.EXTERNAL_MODEL_API_KEY)
        return this.fallback(request, context, started);
      const external = await callChat({
        baseUrl: this.config.EXTERNAL_MODEL_BASE_URL,
        apiKey: this.config.EXTERNAL_MODEL_API_KEY,
        model: this.config.EXTERNAL_MODEL_NAME,
        prompt: request.prompt,
        context,
      });
      return {
        ...external,
        provider: "external",
        latencyMs: Math.round(performance.now() - started),
      };
    }
    if (this.config.MODEL_ROUTE === "local_only") {
      try {
        const local = await this.callLocal(request, context, started);
        return local;
      } catch {
        return this.fallback(request, context, started);
      }
    }
    try {
      return await this.callLocal(request, context, started);
    } catch (localError) {
      if (request.externalAllowed && this.config.EXTERNAL_MODEL_API_KEY) {
        const external = await callChat({
          baseUrl: this.config.EXTERNAL_MODEL_BASE_URL,
          apiKey: this.config.EXTERNAL_MODEL_API_KEY,
          model: this.config.EXTERNAL_MODEL_NAME,
          prompt: request.prompt,
          context,
        });
        return {
          ...external,
          provider: "external",
          latencyMs: Math.round(performance.now() - started),
        };
      }
      return this.fallback(request, context, started);
    }
  }

  private async callLocal(
    request: ModelRequest,
    context: string,
    started: number,
  ): Promise<ModelResult> {
    const local = await callChat({
      baseUrl: this.config.LOCAL_MODEL_BASE_URL,
      apiKey: this.config.LOCAL_MODEL_API_KEY,
      model: this.config.LOCAL_MODEL_NAME,
      prompt: request.prompt,
      context,
    });
    return {
      ...local,
      provider: "local",
      latencyMs: Math.round(performance.now() - started),
    };
  }

  private fallback(
    request: ModelRequest,
    context: string,
    started: number,
  ): ModelResult {
    const text = request.context.length
      ? `已在当前权限范围内召回 ${request.context.length} 条证据。${request.context
          .slice(0, 3)
          .map((hit, index) => ` [证据${index + 1}] ${hit.excerpt}`)
          .join("")}`
      : "当前权限范围内没有召回可支持结论的证据，需要补充资料或调整研究范围。";
    return {
      provider: "deterministic",
      model: "evidence-only-fallback",
      text,
      inputTokens: Math.ceil((request.prompt.length + context.length) / 3),
      outputTokens: Math.ceil(text.length / 3),
      latencyMs: Math.round(performance.now() - started),
    };
  }
}
