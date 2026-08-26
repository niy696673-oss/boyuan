export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface IntakeConfig {
  schemaVersion: 1;
  larkAppId: string;
  botmuxConfigPath: string;
  platformBaseUrl: string;
  platformIntakeKey: string;
  publicWorkbenchUrl: string;
  publicProductUrl: string;
  botmuxExecutable: string;
  servicePort: number;
  serviceKey: string;
  attachmentRoot: string;
  statePath: string;
  outboxDir: string;
  retryDelayMs: number;
  timeoutMs: number;
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

export const QUICK_CARD_TEXT_FIELDS = [
  { name: 'companyName', label: '公司' },
  { name: 'companyIdentity', label: '公司身份' },
  { name: 'industryTrack', label: '行业 / 赛道' },
  { name: 'financing', label: '融资信息' },
  { name: 'keyPeople', label: '团队关键人' },
] as const;

export const QUICK_CARD_LIST_FIELDS = [
  { name: 'highlights', label: '公司亮点' },
  { name: 'competitorNames', label: '竞品' },
  { name: 'upstreamNames', label: '上游' },
  { name: 'downstreamNames', label: '下游' },
] as const;

export type QuickCardTextFieldName = typeof QUICK_CARD_TEXT_FIELDS[number]['name'];
export type QuickCardListFieldName = typeof QUICK_CARD_LIST_FIELDS[number]['name'];
export type QuickCardFields = Record<QuickCardTextFieldName, string> & Record<QuickCardListFieldName, string[]>;

export type QuickCardResult = QuickCardFields & {
  status: 'completed' | 'fallback';
  confidence: number;
  confidenceLevel: '低' | '中' | '高';
  navigation: {
    companyId?: string;
    industryId?: string;
  };
  providerId?: string;
  modelId?: string;
  variant?: string;
  sessionId?: string;
};

export interface PlatformClient {
  upload(input: IntakeTurn, attachment: IntakeAttachment, timeoutMs: number): Promise<PlatformUploadResult>;
  quickCard(conversationId: string): Promise<QuickCardResult>;
}

export interface SendCardInput {
  chatId: string;
  sessionId: string;
  messageId: string;
  responseKind: 'loading' | 'final';
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

export interface IntakeJob {
  key: string;
  chatId: string;
  sessionId: string;
  messageId: string;
  fileKey: string;
  fileName: string;
  conversationId: string;
  statusCardMessageId?: string;
  platformAcceptedAt: string;
  completionCardMs: number;
  completionCardSent: boolean;
  quickCard?: QuickCardResult;
  createdAt: string;
  lastError?: string;
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
  listPending(): IntakeJob[];
}

export interface ProcessResult { code: number; stdout: string; stderr: string }
export type ProcessRunner = (
  executable: string,
  args: readonly string[],
  options?: { env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number },
) => Promise<ProcessResult>;
