import { createHash } from 'node:crypto';
import {
  companyNetworkUrl,
  companyResearchCompletionCard,
  completionCard,
  failureCard,
  industryChainUrl,
  workbenchConversationUrl,
} from './cards.js';
import type {
  CompanyQuickCardResult, CompanyResearchTurn, IntakeConfig, IntakeJob, IntakeOutcome, IntakeTurn, JobStore, Messenger, PlatformClient, QuickCardResult,
  StatusCardReceipt,
} from './types.js';

export const COMPANY_RESEARCH_FILE_KEY = 'company-research';

export interface IntakeServiceOptions {
  config: IntakeConfig;
  platform: PlatformClient;
  messenger: Messenger;
  store: JobStore;
  nowMs?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  releaseAttachment?: (attachment: IntakeTurn['attachments'][number]) => Promise<void>;
}

export class IntakeService {
  readonly #config: IntakeConfig;
  readonly #platform: PlatformClient;
  readonly #messenger: Messenger;
  readonly #store: JobStore;
  readonly #nowMs: () => number;
  readonly #setTimer: (callback: () => void, delayMs: number) => unknown;
  readonly #releaseAttachment: IntakeServiceOptions['releaseAttachment'];
  readonly #scheduled = new Set<string>();
  readonly #cleanupScheduled = new Set<string>();
  readonly #active = new Map<string, Promise<IntakeOutcome>>();

  constructor(options: IntakeServiceOptions) {
    this.#config = options.config;
    this.#platform = options.platform;
    this.#messenger = options.messenger;
    this.#store = options.store;
    this.#nowMs = options.nowMs ?? Date.now;
    this.#setTimer = options.setTimer ?? ((callback, delayMs) => {
      const timer = setTimeout(callback, delayMs);
      timer.unref();
      return timer;
    });
    this.#releaseAttachment = options.releaseAttachment;
  }

  statusCardId(messageId: string, fileKey: string): string | undefined {
    const key = jobKey(messageId, fileKey);
    return this.#store.get(key)?.statusCardMessageId ??
      this.#store.getStatusCard(key)?.cardMessageId;
  }

  rememberStatusCard(input: {
    chatId: string;
    messageId: string;
    fileKey: string;
    fileName: string;
    cardMessageId: string;
    createdAt: string;
    senderId?: string;
  }): void {
    const key = jobKey(input.messageId, input.fileKey);
    const existing = this.statusCardId(input.messageId, input.fileKey);
    if (existing && existing !== input.cardMessageId) {
      throw new Error('status_card_conflict');
    }
    this.#store.putStatusCard({ key, ...input });
  }

  listOrphanStatusCards(): StatusCardReceipt[] {
    return this.#store.listStatusCards().filter((receipt) => (
      !receipt.terminal && !this.#store.get(receipt.key)
    ));
  }

  markStatusCardTerminal(messageId: string, fileKey: string): void {
    const key = jobKey(messageId, fileKey);
    const receipt = this.#store.getStatusCard(key);
    if (!receipt) return;
    this.#store.putStatusCard({ ...receipt, terminal: true });
  }

  async ingestTurn(turn: IntakeTurn): Promise<IntakeOutcome[]> {
    const outcomes: IntakeOutcome[] = [];
    const { statusCardMessageId: sharedStatusCardMessageId, ...turnWithoutStatusCard } = turn;
    for (const [index, attachment] of turn.attachments.entries()) {
      const attachmentTurn: IntakeTurn = {
        ...turnWithoutStatusCard,
        attachments: [attachment],
        ...(index === 0 && sharedStatusCardMessageId
          ? { statusCardMessageId: sharedStatusCardMessageId }
          : {}),
      };
      try {
        const key = jobKey(turn.messageId, attachment.fileKey);
        let active = this.#active.get(key);
        if (!active) {
          active = this.#acceptOne(attachmentTurn, attachment);
          this.#active.set(key, active);
          void active.finally(() => this.#active.delete(key)).catch(() => undefined);
        }
        outcomes.push(await active);
      } catch (error) {
        const message = errorMessage(error);
        outcomes.push({ fileKey: attachment.fileKey, fileName: attachment.name, status: 'failed', error: message });
        if (!this.#store.get(jobKey(turn.messageId, attachment.fileKey))) {
          const card = failureCard(attachment.name);
          if (attachmentTurn.statusCardMessageId && this.#messenger.updateCard) {
            await this.#messenger.updateCard({ cardMessageId: attachmentTurn.statusCardMessageId, card }).catch(() => undefined);
          } else {
            await this.#messenger.sendCard({
              chatId: turn.chatId,
              sessionId: turn.sessionId,
              messageId: turn.messageId,
              fileKey: attachment.fileKey,
              responseKind: 'final',
              cardKind: 'failure',
              card,
            }).catch(() => undefined);
          }
        }
      }
    }
    return outcomes;
  }

  async researchCompany(turn: CompanyResearchTurn): Promise<IntakeOutcome> {
    const key = jobKey(turn.messageId, COMPANY_RESEARCH_FILE_KEY);
    let active = this.#active.get(key);
    if (!active) {
      active = this.#acceptCompanyResearch(turn);
      this.#active.set(key, active);
      void active.finally(() => this.#active.delete(key)).catch(() => undefined);
    }
    return active;
  }

  resumePending(): void {
    for (const job of this.#store.listPending()) this.#schedule(job.key, 0);
    for (const job of this.#store.listCleanupPending()) this.#scheduleCleanup(job.key, 0);
  }

  async #acceptOne(
    turn: IntakeTurn,
    attachment: IntakeTurn['attachments'][number],
  ): Promise<IntakeOutcome> {
    const key = jobKey(turn.messageId, attachment.fileKey);
    const existing = this.#store.get(key);
    if (existing) {
      await this.#releaseDuplicateAttachment(existing, attachment);
      if (!existing.completionCardSent) await this.#finish(key);
      const saved = this.#store.get(key) ?? existing;
      return {
        fileKey: attachment.fileKey,
        fileName: attachment.name,
        status: saved.completionCardSent ? 'completed' : 'resumed',
        conversationId: saved.conversationId,
        ...(saved.completionCardMs ? { completionCardMs: saved.completionCardMs } : {}),
      };
    }

    const observedMs = this.#nowMs();
    const receivedMs = turn.receivedAt ? Date.parse(turn.receivedAt) : Number.NaN;
    const startedMs = Number.isFinite(receivedMs) && receivedMs <= observedMs + 1_000 && receivedMs >= observedMs - 300_000
      ? Math.min(receivedMs, observedMs)
      : observedMs;
    let uploaded: Awaited<ReturnType<PlatformClient['upload']>>;
    try {
      uploaded = await this.#platform.upload(turn, attachment, this.#config.timeoutMs);
    } catch (error) {
      if (this.#releaseAttachment) await this.#releaseAttachment(attachment);
      throw error;
    }
    const acceptedMs = this.#nowMs();
    const statusCardMessageId = turn.statusCardMessageId ??
      this.#store.getStatusCard(key)?.cardMessageId;
    const job: IntakeJob = {
      key,
      chatId: turn.chatId,
      sessionId: turn.sessionId,
      messageId: turn.messageId,
      fileKey: attachment.fileKey,
      fileName: attachment.name,
      conversationId: uploaded.conversation.conversationId,
      ...(statusCardMessageId ? { statusCardMessageId } : {}),
      platformAcceptedAt: new Date(acceptedMs).toISOString(),
      completionCardMs: 0,
      completionCardSent: false,
      createdAt: new Date(startedMs).toISOString(),
      ...(this.#releaseAttachment
        ? { cleanupAttachment: attachment, cleanupPending: true }
        : {}),
    };
    this.#store.put(job);
    this.#store.deleteStatusCard(key);
    await this.#cleanup(key);
    await this.#finish(key);
    const saved = this.#store.get(key) ?? job;
    return {
      fileKey: attachment.fileKey,
      fileName: attachment.name,
      status: saved.completionCardSent ? 'completed' : 'accepted',
      conversationId: job.conversationId,
      ...(saved.completionCardMs ? { completionCardMs: saved.completionCardMs } : {}),
    };
  }

  async #acceptCompanyResearch(turn: CompanyResearchTurn): Promise<IntakeOutcome> {
    const key = jobKey(turn.messageId, COMPANY_RESEARCH_FILE_KEY);
    const existing = this.#store.get(key);
    if (existing) {
      if (!existing.completionCardSent) await this.#finish(key);
      const saved = this.#store.get(key) ?? existing;
      return {
        fileKey: COMPANY_RESEARCH_FILE_KEY,
        fileName: turn.companyName,
        status: saved.completionCardSent ? 'completed' : 'resumed',
        conversationId: saved.conversationId,
        ...(saved.completionCardMs ? { completionCardMs: saved.completionCardMs } : {}),
      };
    }
    const observedMs = this.#nowMs();
    const receivedMs = turn.receivedAt ? Date.parse(turn.receivedAt) : Number.NaN;
    const startedMs = Number.isFinite(receivedMs) && receivedMs <= observedMs + 1_000 && receivedMs >= observedMs - 300_000
      ? Math.min(receivedMs, observedMs)
      : observedMs;
    const accepted = await this.#platform.startCompanyResearch(turn);
    const acceptedMs = this.#nowMs();
    const statusCardMessageId = turn.statusCardMessageId
      ?? this.#store.getStatusCard(key)?.cardMessageId;
    const job: IntakeJob = {
      key,
      kind: 'company_research',
      chatId: turn.chatId,
      sessionId: turn.sessionId,
      messageId: turn.messageId,
      fileKey: COMPANY_RESEARCH_FILE_KEY,
      fileName: turn.companyName,
      conversationId: accepted.conversation.conversationId,
      ...(statusCardMessageId ? { statusCardMessageId } : {}),
      platformAcceptedAt: new Date(acceptedMs).toISOString(),
      completionCardMs: 0,
      completionCardSent: false,
      createdAt: new Date(startedMs).toISOString(),
    };
    this.#store.put(job);
    this.#store.deleteStatusCard(key);
    await this.#finish(key);
    const saved = this.#store.get(key) ?? job;
    return {
      fileKey: COMPANY_RESEARCH_FILE_KEY,
      fileName: turn.companyName,
      status: saved.completionCardSent ? 'completed' : 'accepted',
      conversationId: job.conversationId,
      ...(saved.completionCardMs ? { completionCardMs: saved.completionCardMs } : {}),
    };
  }

  #schedule(key: string, delayMs: number): void {
    if (this.#scheduled.has(key)) return;
    this.#scheduled.add(key);
    this.#setTimer(() => {
      this.#scheduled.delete(key);
      void this.#finish(key).catch(() => undefined);
    }, delayMs);
  }

  #scheduleCleanup(key: string, delayMs: number): void {
    if (this.#cleanupScheduled.has(key)) return;
    this.#cleanupScheduled.add(key);
    this.#setTimer(() => {
      this.#cleanupScheduled.delete(key);
      void this.#cleanup(key);
    }, delayMs);
  }

  async #cleanup(key: string): Promise<void> {
    const job = this.#store.get(key);
    const attachment = job?.cleanupAttachment;
    if (!job?.cleanupPending || !attachment || !this.#releaseAttachment) return;
    try {
      await this.#releaseAttachment(attachment);
      const latest = this.#store.get(key);
      if (!latest || latest.cleanupAttachment?.path !== attachment.path) return;
      delete latest.cleanupAttachment;
      delete latest.cleanupPending;
      delete latest.cleanupError;
      this.#store.put(latest);
    } catch (error) {
      const latest = this.#store.get(key);
      if (!latest || latest.cleanupAttachment?.path !== attachment.path) return;
      latest.cleanupPending = true;
      latest.cleanupError = errorMessage(error);
      this.#store.put(latest);
      this.#scheduleCleanup(key, this.#config.retryDelayMs);
    }
  }

  async #releaseDuplicateAttachment(job: IntakeJob, attachment: IntakeTurn['attachments'][number]): Promise<void> {
    if (!this.#releaseAttachment) return;
    try {
      await this.#releaseAttachment(attachment);
    } catch (error) {
      const latest = this.#store.get(job.key) ?? job;
      latest.cleanupAttachment = attachment;
      latest.cleanupPending = true;
      latest.cleanupError = errorMessage(error);
      this.#store.put(latest);
      this.#scheduleCleanup(job.key, this.#config.retryDelayMs);
    }
  }

  async #finish(key: string): Promise<void> {
    const job = this.#store.get(key);
    if (!job || job.completionCardSent) return;
    if (job.kind === 'company_research') {
      await this.#finishCompanyResearch(job);
      return;
    }
    if (!job.quickCard) {
      try {
        job.quickCard = await this.#platform.quickCard(job.conversationId);
      } catch (error) {
        job.quickCard = failedQuickCard();
        job.lastError = errorMessage(error);
      }
      this.#store.put(job);
    }
    const url = workbenchConversationUrl(this.#config.publicWorkbenchUrl, job.conversationId);
    const companyUrl = job.quickCard.navigation.companyId
      ? companyNetworkUrl(this.#config.publicProductUrl, job.quickCard.navigation.companyId)
      : undefined;
    const industryUrl = job.quickCard.navigation.industryId
      ? industryChainUrl(this.#config.publicProductUrl, job.quickCard.navigation.industryId)
      : undefined;
    try {
      const card = completionCard(job.quickCard, {
        deepAnalysisUrl: url,
        ...(companyUrl ? { companyNetworkUrl: companyUrl } : {}),
        ...(industryUrl ? { industryChainUrl: industryUrl } : {}),
      });
      if (job.statusCardMessageId && this.#messenger.updateCard) {
        await this.#messenger.updateCard({ cardMessageId: job.statusCardMessageId, card });
      } else {
        await this.#messenger.sendCard({
          chatId: job.chatId,
          sessionId: job.sessionId,
          messageId: job.messageId,
          fileKey: job.fileKey,
          responseKind: 'final',
          cardKind: 'completion',
          card,
        });
      }
      job.completionCardSent = true;
      job.completionCardMs = Math.max(0, this.#nowMs() - Date.parse(job.createdAt));
      delete job.lastError;
      this.#store.put(job);
    } catch (error) {
      job.lastError = errorMessage(error);
      this.#store.put(job);
      this.#schedule(key, this.#config.retryDelayMs);
      throw error;
    }
  }

  async #finishCompanyResearch(job: IntakeJob): Promise<void> {
    if (!job.companyQuickCard) {
      try {
        job.companyQuickCard = await this.#platform.companyQuickCard(job.conversationId);
      } catch (error) {
        job.companyQuickCard = failedCompanyQuickCard(job.fileName);
        job.lastError = errorMessage(error);
      }
      this.#store.put(job);
    }
    const result = job.companyQuickCard;
    const deepAnalysisUrl = workbenchConversationUrl(this.#config.publicWorkbenchUrl, job.conversationId);
    const companyUrl = result.navigation.companyId
      ? companyNetworkUrl(this.#config.publicProductUrl, result.navigation.companyId)
      : undefined;
    const industryUrl = result.navigation.industryId
      ? industryChainUrl(this.#config.publicProductUrl, result.navigation.industryId)
      : undefined;
    try {
      const card = companyResearchCompletionCard(result, {
        deepAnalysisUrl,
        ...(companyUrl ? { companyNetworkUrl: companyUrl } : {}),
        ...(industryUrl ? { industryChainUrl: industryUrl } : {}),
      });
      if (job.statusCardMessageId && this.#messenger.updateCard) {
        await this.#messenger.updateCard({ cardMessageId: job.statusCardMessageId, card });
      } else {
        await this.#messenger.sendCard({
          chatId: job.chatId,
          sessionId: job.sessionId,
          messageId: job.messageId,
          fileKey: job.fileKey,
          responseKind: 'final',
          cardKind: 'completion',
          card,
        });
      }
      job.completionCardSent = true;
      job.completionCardMs = Math.max(0, this.#nowMs() - Date.parse(job.createdAt));
      delete job.lastError;
      this.#store.put(job);
    } catch (error) {
      job.lastError = errorMessage(error);
      this.#store.put(job);
      this.#schedule(job.key, this.#config.retryDelayMs);
      throw error;
    }
  }
}

export function jobKey(messageId: string, fileKey: string): string {
  return createHash('sha256').update(messageId).update('\0').update(fileKey).digest('hex');
}

function failedQuickCard(): QuickCardResult {
  return {
    companyName: '快速提取未完成',
    companyIdentity: '快速提取未完成',
    industryTrack: '快速提取未完成',
    financing: '快速提取未完成',
    keyPeople: '快速提取未完成',
    highlights: [],
    competitorNames: [],
    upstreamNames: [],
    downstreamNames: [],
    status: 'fallback',
    confidence: 0,
    confidenceLevel: '低',
    navigation: {},
  };
}

function failedCompanyQuickCard(companyName: string): CompanyQuickCardResult {
  return {
    kind: 'company_research',
    status: 'fallback',
    companyName,
    identityState: 'provisional',
    companyIdentity: '快速分析未完成',
    industryTrack: '快速分析未完成',
    financing: '快速分析未完成',
    keyPeople: '快速分析未完成',
    highlights: [],
    recentSignals: [],
    confidence: 0,
    confidenceLevel: '低',
    sourceCount: 0,
    materialCount: 0,
    formalKnowledgeCount: 0,
    pendingCandidateCount: 0,
    navigation: {},
  };
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : 'intake_failed').slice(0, 160);
}
