import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { QUICK_CARD_LIST_FIELDS, QUICK_CARD_TEXT_FIELDS } from './types.js';
import type { IntakeAttachment, IntakeTurn, PlatformClient, PlatformConversation, PlatformUploadResult, QuickCardFields, QuickCardResult } from './types.js';

const MAX_JSON_BYTES = 2 * 1024 * 1024;

export class HttpPlatformClient implements PlatformClient {
  readonly #baseUrl: string;
  readonly #intakeKey: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(baseUrl: string, intakeKey: string, timeoutMs: number, fetcher: typeof fetch = fetch) {
    this.#baseUrl = baseUrl;
    this.#intakeKey = intakeKey;
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetcher;
  }

  async upload(input: IntakeTurn, attachment: IntakeAttachment, timeoutMs = this.#timeoutMs): Promise<PlatformUploadResult> {
    const boundary = `boyuan-${randomBytes(18).toString('hex')}`;
    const safeName = attachment.name.replace(/["\r\n]/gu, '_');
    const before = Buffer.from([
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${safeName}"`,
      `Content-Type: ${attachment.mimeType}`,
      '',
      '',
    ].join('\r\n'));
    const after = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Readable.from((async function* () {
      yield before;
      for await (const chunk of createReadStream(attachment.path)) yield chunk;
      yield after;
    })());
    const response = await this.#fetch(`${this.#baseUrl}/api/v1/feishu/documents`, {
      method: 'POST',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(before.byteLength + attachment.size + after.byteLength),
        'x-boyuan-intake-key': this.#intakeKey,
        'x-boyuan-message-id': input.messageId,
        'x-boyuan-file-key': attachment.fileKey,
        ...(input.senderId ? { 'x-boyuan-sender-id': input.senderId } : {}),
      },
      body,
      duplex: 'half',
      signal: AbortSignal.timeout(Math.min(this.#timeoutMs, timeoutMs)),
    } as unknown as RequestInit & { duplex: 'half' });
    return parseUpload(await readResponse(response));
  }

  async quickCard(conversationId: string): Promise<QuickCardResult> {
    const response = await this.#fetch(`${this.#baseUrl}/api/v1/feishu/conversations/${encodeURIComponent(conversationId)}/quick-card`, {
      method: 'POST',
      headers: { accept: 'application/json', 'x-boyuan-intake-key': this.#intakeKey },
    });
    return parseQuickCard(await readResponse(response));
  }
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) throw new Error('platform_response_too_large');
  if (!response.ok) throw new Error(`platform_http_${response.status}`);
  try { return JSON.parse(text) as unknown; } catch { throw new Error('platform_invalid_json'); }
}

function record(value: unknown, error = 'platform_invalid_response'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(error);
  return value as Record<string, unknown>;
}

function text(value: unknown, error = 'platform_invalid_response'): string {
  if (typeof value !== 'string' || !value) throw new Error(error);
  return value;
}

function parseConversation(value: unknown): PlatformConversation {
  const source = record(value);
  const status = source.status;
  if (!['processing', 'waiting', 'pending_confirmation', 'completed', 'failed'].includes(String(status))) {
    throw new Error('platform_invalid_response');
  }
  const document = record(source.document);
  const sections = Array.isArray(source.analysisSections) ? source.analysisSections : [];
  const candidates = Array.isArray(source.candidates) ? source.candidates : [];
  const task = record(source.task);
  const company = source.company === undefined ? undefined : record(source.company);
  return {
    conversationId: text(source.conversationId),
    title: text(source.title),
    status: status as PlatformConversation['status'],
    document: {
      fileName: text(document.fileName),
      ...(typeof document.materialType === 'string' && document.materialType ? { materialType: document.materialType } : {}),
    },
    ...(company ? { company: { canonicalName: text(company.canonicalName) } } : {}),
    analysisSections: sections.map((section) => {
      const item = record(section);
      return { key: text(item.key), summary: typeof item.summary === 'string' ? item.summary : '' };
    }),
    candidates: candidates.map((candidate) => {
      const item = record(candidate);
      return {
        status: text(item.status),
        ...(typeof item.sectionKey === 'string' && item.sectionKey ? { sectionKey: item.sectionKey } : {}),
        ...(typeof item.knowledgeType === 'string' && item.knowledgeType ? { knowledgeType: item.knowledgeType } : {}),
        ...(typeof item.statement === 'string' && item.statement ? { statement: item.statement } : {}),
        ...(typeof item.value === 'string' && item.value ? { value: item.value } : {}),
      };
    }),
    task: { ...(typeof task.errorCode === 'string' ? { errorCode: task.errorCode } : {}) },
  };
}

function parseQuickCard(value: unknown): QuickCardResult {
  const source = record(value);
  const textFields = Object.fromEntries(QUICK_CARD_TEXT_FIELDS.map(({ name }) => [name, text(source[name])])) as Pick<QuickCardFields, typeof QUICK_CARD_TEXT_FIELDS[number]['name']>;
  const listFields = Object.fromEntries(QUICK_CARD_LIST_FIELDS.map(({ name }) => [name, stringArray(source[name])])) as Pick<QuickCardFields, typeof QUICK_CARD_LIST_FIELDS[number]['name']>;
  const confidence = source.confidence;
  if (typeof confidence !== 'number' || !Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    throw new Error('platform_invalid_response');
  }
  const confidenceLevel = source.confidenceLevel;
  if (!['低', '中', '高'].includes(String(confidenceLevel))) throw new Error('platform_invalid_response');
  const navigation = record(source.navigation);
  return {
    ...textFields,
    ...listFields,
    status: 'completed',
    confidence,
    confidenceLevel: confidenceLevel as QuickCardResult['confidenceLevel'],
    navigation: {
      ...(typeof navigation.companyId === 'string' && navigation.companyId ? { companyId: navigation.companyId } : {}),
      ...(typeof navigation.industryId === 'string' && navigation.industryId ? { industryId: navigation.industryId } : {}),
    },
    providerId: text(source.providerId),
    modelId: text(source.modelId),
    variant: text(source.variant),
    sessionId: text(source.sessionId),
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new Error('platform_invalid_response');
  }
  return value;
}

function parseUpload(value: unknown): PlatformUploadResult {
  const source = record(value);
  if (typeof source.reusedDocument !== 'boolean') throw new Error('platform_invalid_response');
  return { conversation: parseConversation(source.conversation), reusedDocument: source.reusedDocument };
}
