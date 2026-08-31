import {
  COMPANY_QUICK_CARD_COMMON_LIST_FIELDS,
  COMPANY_QUICK_CARD_COMMON_NUMBER_FIELDS,
  COMPANY_QUICK_CARD_VIEW_TEXT_FIELDS,
  type CompanyQuickCardViewFields,
} from '../../../shared/company-quick-card.js';
import type { FundMatchSummary } from '../../../shared/fund-matching.js';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const COMPANY_RESEARCH_FILE_KEY = 'company-research';

export interface IntakeServiceConfig {
  schemaVersion: 1;
  platformBaseUrl: string;
  platformIntakeKey: string;
  publicWorkbenchUrl: string;
  publicProductUrl: string;
  servicePort: number;
  attachmentRoot: string;
  statePath: string;
  retryDelayMs: number;
  timeoutMs: number;
}

export interface IntakeConfig extends IntakeServiceConfig {
  larkAppId: string;
  botmuxConfigPath: string;
}

export interface WeComIntakeConfig extends IntakeServiceConfig {
  wsUrl?: string;
}

export interface WeComBotPort {
  replyStream(
    reqId: string,
    streamId: string,
    content: string,
    finish: boolean,
  ): Promise<void>;
  sendMarkdown(chatId: string, content: string): Promise<void>;
  downloadFile(url: string, aesKey?: string): Promise<{ buffer: Buffer; filename?: string }>;
}

export interface IntakeAttachment {
  fileKey: string;
  name: string;
  mimeType: string;
  path: string;
  size: number;
}

export interface IntakeTurn {
  chatId: string;
  sessionId: string;
  messageId: string;
  receivedAt?: string;
  senderId?: string;
  statusCardMessageId?: string;
  attachments: IntakeAttachment[];
}

export interface PlatformConversation {
  conversationId: string;
  title: string;
  status: 'processing' | 'waiting' | 'pending_confirmation' | 'completed' | 'failed';
  document: { fileName: string; materialType?: string };
  company?: { canonicalName: string };
  analysisSections: Array<{ key: string; summary: string }>;
  candidates: Array<{
    status: string;
    sectionKey?: string;
    knowledgeType?: string;
    statement?: string;
    value?: string;
  }>;
  task: { errorCode?: string };
}

export interface PlatformUploadResult {
  conversation: PlatformConversation;
  reusedDocument: boolean;
}

export interface CompanyResearchTurn {
  chatId: string;
  sessionId: string;
  messageId: string;
  companyName: string;
  receivedAt?: string;
  senderId?: string;
  statusCardMessageId?: string;
}

export interface PlatformCompanyResearchResult {
  conversation: PlatformConversation;
  reusedResearch: boolean;
}

export const COMMON_COMPANY_QUICK_CARD_TEXT_FIELDS = COMPANY_QUICK_CARD_VIEW_TEXT_FIELDS;
export const COMMON_COMPANY_QUICK_CARD_LIST_FIELDS = COMPANY_QUICK_CARD_COMMON_LIST_FIELDS;
export const COMMON_COMPANY_QUICK_CARD_NUMBER_FIELDS = COMPANY_QUICK_CARD_COMMON_NUMBER_FIELDS;
export const QUICK_CARD_TEXT_FIELDS = COMPANY_QUICK_CARD_VIEW_TEXT_FIELDS;

export const QUICK_CARD_LIST_FIELDS = [
  ...COMMON_COMPANY_QUICK_CARD_LIST_FIELDS,
  { name: 'competitorNames', label: '竞品' },
  { name: 'upstreamNames', label: '上游' },
  { name: 'downstreamNames', label: '下游' },
] as const;

export type QuickCardTextFieldName = typeof QUICK_CARD_TEXT_FIELDS[number]['name'];
export type QuickCardListFieldName = typeof QUICK_CARD_LIST_FIELDS[number]['name'];
export type CommonCompanyQuickCardFields = CompanyQuickCardViewFields;

export type QuickCardFields = CommonCompanyQuickCardFields & {
  competitorNames: string[];
  upstreamNames: string[];
  downstreamNames: string[];
};

export type QuickCardResult = QuickCardFields & {
  status: 'completed' | 'fallback';
  confidence: number;
  confidenceLevel: '低' | '中' | '高';
  navigation: {
    companyId?: string;
    industryId?: string;
  };
  fundMatch: FundMatchSummary;
  providerId?: string;
  modelId?: string;
  variant?: string;
  sessionId?: string;
};

export type CompanyQuickCardResult = CommonCompanyQuickCardFields & {
  kind: 'company_research';
  status: 'completed' | 'pending_confirmation' | 'fallback';
  identityState: 'existing' | 'provisional' | 'ambiguous';
  recentSignals: string[];
  competitorNames: string[];
  upstreamNames: string[];
  downstreamNames: string[];
  confidence: number;
  confidenceLevel: '低' | '中' | '高';
  sourceCount: number;
  materialCount: number;
  formalKnowledgeCount: number;
  pendingCandidateCount: number;
  navigation: {
    companyId?: string;
    industryId?: string;
  };
  fundMatch: FundMatchSummary;
  providerId?: string;
  modelId?: string;
  variant?: string;
  sessionId?: string;
};

export interface PlatformClient {
  upload(input: IntakeTurn, attachment: IntakeAttachment, timeoutMs: number): Promise<PlatformUploadResult>;
  quickCard(conversationId: string): Promise<QuickCardResult>;
  startCompanyResearch(input: CompanyResearchTurn): Promise<PlatformCompanyResearchResult>;
  companyQuickCard(conversationId: string): Promise<CompanyQuickCardResult>;
}

export interface SendCardInput {
  chatId: string;
  sessionId: string;
  messageId: string;
  fileKey: string;
  responseKind: 'loading' | 'final';
  cardKind: 'loading' | 'completion' | 'failure';
  card: JsonObject;
  timeoutMs?: number;
}

export interface UpdateCardInput {
  cardMessageId: string;
  card: JsonObject;
}

export interface Messenger {
  sendCard(input: SendCardInput): Promise<{ messageId?: string } | void>;
  updateCard?(input: UpdateCardInput): Promise<void>;
}

export interface CompletionLinks {
  deepAnalysisUrl: string;
  companyNetworkUrl?: string;
  industryChainUrl?: string;
}

interface DeliveryBase {
  chatId: string;
  sessionId: string;
  messageId: string;
  fileKey: string;
  statusReceipt?: string;
}

export type CompletionDeliveryInput = DeliveryBase & ({
  kind: 'bp';
  result: QuickCardResult;
  links: CompletionLinks;
} | {
  kind: 'company_research';
  result: CompanyQuickCardResult;
  links: CompletionLinks;
});

export interface FailureDeliveryInput extends DeliveryBase {
  kind: 'bp' | 'company_research';
  subject: string;
}

export interface IntakeDelivery {
  complete(input: CompletionDeliveryInput): Promise<void>;
  fail(input: FailureDeliveryInput): Promise<void>;
}

interface IntakeJobBase {
  key: string;
  chatId: string;
  sessionId: string;
  messageId: string;
  fileKey: string;
  conversationId: string;
  statusCardMessageId?: string;
  platformAcceptedAt: string;
  completionCardMs: number;
  completionCardSent: boolean;
  createdAt: string;
  lastError?: string;
  cleanupAttachment?: IntakeAttachment;
  cleanupPending?: boolean;
  cleanupError?: string;
}

export type IntakeJob = IntakeJobBase & ({
  kind?: 'bp';
  fileName: string;
  quickCard?: QuickCardResult;
} | {
  kind: 'company_research';
  companyName: string;
  companyQuickCard?: CompanyQuickCardResult;
});

export interface StatusCardReceipt {
  key: string;
  chatId: string;
  messageId: string;
  fileKey: string;
  fileName: string;
  cardMessageId: string;
  createdAt: string;
  senderId?: string;
  metadata?: JsonObject;
  terminal?: boolean;
}

export interface IntakeOutcome {
  fileKey: string;
  fileName: string;
  status: 'accepted' | 'resumed' | 'completed' | 'failed';
  conversationId?: string;
  completionCardMs?: number;
  error?: string;
}

export interface JobStore {
  get(key: string): IntakeJob | undefined;
  put(job: IntakeJob): void;
  getStatusCard(key: string): StatusCardReceipt | undefined;
  putStatusCard(receipt: StatusCardReceipt): void;
  deleteStatusCard(key: string): void;
  listStatusCards(): StatusCardReceipt[];
  listPending(): IntakeJob[];
  listCleanupPending(): IntakeJob[];
}
