import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  COMMON_COMPANY_QUICK_CARD_LIST_FIELDS,
  COMMON_COMPANY_QUICK_CARD_NUMBER_FIELDS,
  COMMON_COMPANY_QUICK_CARD_TEXT_FIELDS,
  QUICK_CARD_LIST_FIELDS,
} from './types.js';
import type {
  CommonCompanyQuickCardFields,
  CompanyQuickCardResult,
  CompanyResearchTurn,
  IntakeAttachment,
  IntakeTurn,
  PlatformClient,
  PlatformCompanyResearchResult,
  PlatformConversation,
  PlatformUploadResult,
  QuickCardFields,
  QuickCardResult,
} from './types.js';
import type { FundMatchCandidate, FundMatchSummary } from '../../../shared/fund-matching.js';

const MAX_JSON_BYTES = 2 * 1024 * 1024;

export class HttpPlatformClient implements PlatformClient {
  readonly #baseUrl: string;
  readonly #intakeKey: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #channel: 'feishu' | 'wecom';

  constructor(
    baseUrl: string,
    intakeKey: string,
    timeoutMs: number,
    fetcher: typeof fetch = fetch,
    channel: 'feishu' | 'wecom' = 'feishu',
  ) {
    this.#baseUrl = baseUrl;
    this.#intakeKey = intakeKey;
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetcher;
    this.#channel = channel;
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
    const response = await this.#fetch(`${this.#baseUrl}/api/v1/${this.#channel}/documents`, {
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
    const response = await this.#fetch(`${this.#baseUrl}/api/v1/${this.#channel}/conversations/${encodeURIComponent(conversationId)}/quick-card`, {
      method: 'POST',
      headers: { accept: 'application/json', 'x-boyuan-intake-key': this.#intakeKey },
    });
    return parseQuickCard(await readResponse(response));
  }

  async startCompanyResearch(input: CompanyResearchTurn): Promise<PlatformCompanyResearchResult> {
    const response = await this.#fetch(`${this.#baseUrl}/api/v1/${this.#channel}/company-research`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-boyuan-intake-key': this.#intakeKey,
        'x-boyuan-message-id': input.messageId,
        ...(input.senderId ? { 'x-boyuan-sender-id': input.senderId } : {}),
      },
      body: JSON.stringify({ companyName: input.companyName }),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    const source = record(await readResponse(response));
    if (typeof source.reusedResearch !== 'boolean') throw new Error('platform_invalid_response');
    return {
      conversation: parseConversation(source.conversation),
      reusedResearch: source.reusedResearch,
    };
  }

  async companyQuickCard(conversationId: string): Promise<CompanyQuickCardResult> {
    const response = await this.#fetch(`${this.#baseUrl}/api/v1/${this.#channel}/company-research/${encodeURIComponent(conversationId)}/quick-card`, {
      method: 'POST',
      headers: { accept: 'application/json', 'x-boyuan-intake-key': this.#intakeKey },
    });
    return parseCompanyQuickCard(await readResponse(response));
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
  const commonFields = parseCommonCompanyQuickCardFields(source);
  const relationFields = Object.fromEntries(
    QUICK_CARD_LIST_FIELDS
      .filter(({ name }) => ['competitorNames', 'upstreamNames', 'downstreamNames'].includes(name))
      .map(({ name }) => [name, stringArray(source[name])]),
  ) as Pick<QuickCardFields, 'competitorNames' | 'upstreamNames' | 'downstreamNames'>;
  const confidence = source.confidence;
  if (typeof confidence !== 'number' || !Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    throw new Error('platform_invalid_response');
  }
  const confidenceLevel = source.confidenceLevel;
  if (!['低', '中', '高'].includes(String(confidenceLevel))) throw new Error('platform_invalid_response');
  const navigation = record(source.navigation);
  return {
    ...commonFields,
    ...relationFields,
    status: 'completed',
    confidence,
    confidenceLevel: confidenceLevel as QuickCardResult['confidenceLevel'],
    navigation: {
      ...(typeof navigation.companyId === 'string' && navigation.companyId ? { companyId: navigation.companyId } : {}),
      ...(typeof navigation.industryId === 'string' && navigation.industryId ? { industryId: navigation.industryId } : {}),
    },
    fundMatch: parseFundMatch(source.fundMatch),
    providerId: text(source.providerId),
    modelId: text(source.modelId),
    variant: text(source.variant),
    sessionId: text(source.sessionId),
  };
}

function parseCompanyQuickCard(value: unknown): CompanyQuickCardResult {
  const source = record(value);
  if (source.kind !== 'company_research') throw new Error('platform_invalid_response');
  if (!['completed', 'pending_confirmation'].includes(String(source.status))) {
    throw new Error('platform_invalid_response');
  }
  if (!['existing', 'provisional', 'ambiguous'].includes(String(source.identityState))) {
    throw new Error('platform_invalid_response');
  }
  const confidence = source.confidence;
  if (typeof confidence !== 'number' || !Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    throw new Error('platform_invalid_response');
  }
  const confidenceLevel = source.confidenceLevel;
  if (!['低', '中', '高'].includes(String(confidenceLevel))) throw new Error('platform_invalid_response');
  const navigation = record(source.navigation);
  return {
    ...parseCommonCompanyQuickCardFields(source),
    kind: 'company_research',
    status: source.status as CompanyQuickCardResult['status'],
    identityState: source.identityState as CompanyQuickCardResult['identityState'],
    recentSignals: stringArray(source.recentSignals),
    competitorNames: stringArray(source.competitorNames),
    upstreamNames: stringArray(source.upstreamNames),
    downstreamNames: stringArray(source.downstreamNames),
    confidence,
    confidenceLevel: confidenceLevel as CompanyQuickCardResult['confidenceLevel'],
    sourceCount: nonNegativeInteger(source.sourceCount),
    materialCount: nonNegativeInteger(source.materialCount),
    formalKnowledgeCount: nonNegativeInteger(source.formalKnowledgeCount),
    pendingCandidateCount: nonNegativeInteger(source.pendingCandidateCount),
    navigation: {
      ...(typeof navigation.companyId === 'string' && navigation.companyId ? { companyId: navigation.companyId } : {}),
      ...(typeof navigation.industryId === 'string' && navigation.industryId ? { industryId: navigation.industryId } : {}),
    },
    fundMatch: parseFundMatch(source.fundMatch),
    ...(typeof source.providerId === 'string' ? { providerId: source.providerId } : {}),
    ...(typeof source.modelId === 'string' ? { modelId: source.modelId } : {}),
    ...(typeof source.variant === 'string' ? { variant: source.variant } : {}),
    ...(typeof source.sessionId === 'string' ? { sessionId: source.sessionId } : {}),
  };
}

function parseCommonCompanyQuickCardFields(
  source: Record<string, unknown>,
): CommonCompanyQuickCardFields {
  const textFields = Object.fromEntries(
    COMMON_COMPANY_QUICK_CARD_TEXT_FIELDS.map(({ name }) => [name, text(source[name])]),
  ) as Record<typeof COMMON_COMPANY_QUICK_CARD_TEXT_FIELDS[number]['name'], string>;
  const listFields = Object.fromEntries(
    COMMON_COMPANY_QUICK_CARD_LIST_FIELDS.map(({ name }) => [name, stringArray(source[name])]),
  ) as Record<typeof COMMON_COMPANY_QUICK_CARD_LIST_FIELDS[number]['name'], string[]>;
  const numberFields = Object.fromEntries(
    COMMON_COMPANY_QUICK_CARD_NUMBER_FIELDS.map(({ name }) => [name, nullableNonNegativeNumber(source[name])]),
  ) as Record<typeof COMMON_COMPANY_QUICK_CARD_NUMBER_FIELDS[number]['name'], number | null>;
  return { ...textFields, ...listFields, ...numberFields };
}

function parseFundMatch(value: unknown): FundMatchSummary {
  const source = record(value);
  if (!['matched', 'insufficient_input', 'unavailable'].includes(String(source.status))) {
    throw new Error('platform_invalid_response');
  }
  const sourceRecord = record(source.source);
  if (typeof sourceRecord.simulated !== 'boolean') throw new Error('platform_invalid_response');
  const alternatives = Array.isArray(source.alternatives)
    ? source.alternatives.map(parseFundCandidate)
    : (() => { throw new Error('platform_invalid_response'); })();
  return {
    status: source.status as FundMatchSummary['status'],
    ...(source.recommended === undefined ? {} : { recommended: parseFundCandidate(source.recommended) }),
    alternatives,
    eligibleFundCount: nonNegativeInteger(source.eligibleFundCount),
    excludedFundCount: nonNegativeInteger(source.excludedFundCount),
    source: {
      fileName: text(sourceRecord.fileName),
      asOfDate: text(sourceRecord.asOfDate),
      simulated: sourceRecord.simulated,
    },
  };
}

function parseFundCandidate(value: unknown): FundMatchCandidate {
  const source = record(value);
  if (!Array.isArray(source.dimensions)) throw new Error('platform_invalid_response');
  return {
    fundId: text(source.fundId),
    fundName: text(source.fundName),
    score: percentage(source.score),
    dimensions: source.dimensions.map((value) => {
      const item = record(value);
      if (!['industry', 'stage', 'ticket', 'region', 'capacity'].includes(String(item.key))) {
        throw new Error('platform_invalid_response');
      }
      return {
        key: item.key as FundMatchCandidate['dimensions'][number]['key'],
        label: text(item.label),
        score: nonNegativeInteger(item.score),
        maxScore: nonNegativeInteger(item.maxScore),
        summary: text(item.summary),
      };
    }),
  };
}

function nullableNonNegativeNumber(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('platform_invalid_response');
  }
  return value;
}

function percentage(value: unknown): number {
  const result = nonNegativeInteger(value);
  if (result > 100) throw new Error('platform_invalid_response');
  return result;
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('platform_invalid_response');
  }
  return value;
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
