import { SessionManager } from './session-manager.js';
import { formatDateTime, UsageStore } from './usage-store.js';
import type { BotChannel, BotFeature, BotResultStatus, UsageRecord } from './types.js';

export interface UsageCollectorOptions {
  store: UsageStore;
  testUserIds?: string[];
}

const GREETING_PATTERNS = [
  /^(?:你好|您好|hi|hello|hey|哈喽|在吗|在么|在不|有人吗|你好啊|早上好|下午好|晚上好)$/iu,
  /^(?:菜单|功能|帮助|help|\?|？|\/help)$/iu,
  /^(?:测试|test|1|11|111)$/iu,
];

const BP_KEYWORD_PATTERNS = [
  /\bbp\b/iu,
  /商业企划书/u,
  /商业计划书/u,
  /融资计划书/u,
  /路演/u,
];

export class UsageCollector {
  readonly #store: UsageStore;
  readonly #sessionManager: SessionManager;
  readonly #testUserIds = new Set<string>();

  constructor(options: UsageCollectorOptions) {
    this.#store = options.store;
    this.#sessionManager = new SessionManager();
    if (options.testUserIds) {
      for (const id of options.testUserIds) this.#testUserIds.add(id);
    }
  }

  get store(): UsageStore {
    return this.#store;
  }

  get sessionManager(): SessionManager {
    return this.#sessionManager;
  }

  classifyFeature(text: string, fileName?: string): { feature: BotFeature; isValid: boolean } {
    const trimmed = text.trim();

    // 1. 文件分析分类
    if (fileName) {
      const isBp = BP_KEYWORD_PATTERNS.some((p) => p.test(fileName) || p.test(trimmed));
      return {
        feature: isBp ? 'BP分析' : '资料解析',
        isValid: true,
      };
    }

    // 2. 纯打招呼 / 菜单分类 (无效请求)
    if (!trimmed || GREETING_PATTERNS.some((p) => p.test(trimmed))) {
      return {
        feature: '打招呼',
        isValid: false,
      };
    }

    // 3. 批量公司研究判定
    if (
      trimmed.includes('批量') ||
      trimmed.includes('名单') ||
      /[、，,\n].*(?:公司|科技|集团|股份|有限)/u.test(trimmed) ||
      (trimmed.match(/[、，,\n]/g) ?? []).length >= 2
    ) {
      return {
        feature: '批量公司研究',
        isValid: true,
      };
    }

    // 4. 行业问答判定 (优先于泛公司研究)
    if (
      /(?:行业|市场|产业链|赛道|政策|趋势|空间|宏观|竞争格局)/u.test(trimmed)
    ) {
      return {
        feature: '行业问答',
        isValid: true,
      };
    }

    // 5. 单公司研究判定
    if (
      /(?:分析|研究|了解|看下|查查|查下|评估|概况|介绍|调研)/u.test(trimmed) ||
      trimmed.includes('公司') ||
      /(?:科技|机器人|医药|智能|动力|汽车|能源|半导体|芯片|时代|重工|生物|医疗)/u.test(trimmed)
    ) {
      return {
        feature: '公司快速研究',
        isValid: true,
      };
    }

    // 6. 其他自由业务问答
    return {
      feature: '自由问答',
      isValid: true,
    };
  }

  isTestUser(userId: string, text?: string): boolean {
    if (this.#testUserIds.has(userId)) return true;
    if (userId.startsWith('test_') || userId.includes('mock') || userId.includes('bench')) return true;
    if (text && (text.startsWith('[测试]') || text.includes('benchmark'))) return true;
    return false;
  }

  extractNotes(text: string, fileName?: string): string {
    if (fileName) return `[文件] ${fileName}`;
    const clean = text.replace(/[\r\n\t]+/g, ' ').trim();
    return clean.length > 30 ? `${clean.slice(0, 30)}…` : clean;
  }

  onTurnStart(params: {
    recordId: string;
    channel: BotChannel;
    userId: string;
    text?: string | undefined;
    fileName?: string | undefined;
    receivedAt?: string | undefined;
  }): { recordId: string; sessionId: string } {
    const rawText = params.text ?? '';
    const { feature, isValid } = this.classifyFeature(rawText, params.fileName);
    const startMs = params.receivedAt ? Date.parse(params.receivedAt) : Date.now();
    const startDate = new Date(isNaN(startMs) ? Date.now() : startMs);
    const nowMs = isNaN(startMs) ? Date.now() : startMs;

    const { sessionId } = this.#sessionManager.allocateSession(
      params.channel,
      params.userId,
      nowMs,
      isValid,
    );

    const record: UsageRecord = {
      recordId: params.recordId,
      userId: params.userId,
      channel: params.channel,
      feature,
      startTime: formatDateTime(startDate),
      status: '处理中',
      durationSeconds: 0,
      sessionId,
      isTest: this.isTestUser(params.userId, rawText) ? '是' : '否',
      feedback: '未反馈',
      notes: this.extractNotes(rawText, params.fileName),
      isValidRequest: isValid,
      rawText,
      startTimestampMs: nowMs,
      syncedToFeishu: false,
    };

    this.#store.saveRecord(record);
    return { recordId: record.recordId, sessionId };
  }

  onTurnComplete(params: {
    recordId: string;
    feature?: BotFeature;
    status?: BotResultStatus;
    completedAt?: Date;
    modelOutput?: string;
  }): void {
    const record = this.#store.getRecord(params.recordId);
    if (!record) return;

    const end = params.completedAt ?? new Date();
    const endMs = end.getTime();
    const durationSeconds = Math.max(0.1, Number(((endMs - record.startTimestampMs) / 1000).toFixed(1)));

    this.#store.updateRecord(params.recordId, {
      endTime: formatDateTime(end),
      endTimestampMs: endMs,
      durationSeconds,
      status: params.status ?? '成功',
      ...(params.feature ? { feature: params.feature } : {}),
      ...(params.modelOutput !== undefined ? { modelOutput: params.modelOutput } : {}),
    });

    this.#sessionManager.recordResponse(record.sessionId, endMs);
  }

  onTurnFail(params: {
    recordId: string;
    error: unknown;
    failedAt?: Date;
    modelOutput?: string;
  }): void {
    const record = this.#store.getRecord(params.recordId);
    if (!record) return;

    const end = params.failedAt ?? new Date();
    const endMs = end.getTime();
    const durationSeconds = Math.max(0.1, Number(((endMs - record.startTimestampMs) / 1000).toFixed(1)));

    const errMsg = params.error instanceof Error ? params.error.message : String(params.error);
    const status: BotResultStatus = errMsg.includes('timeout') ? '超时' : '失败';

    this.#store.updateRecord(params.recordId, {
      endTime: formatDateTime(end),
      endTimestampMs: endMs,
      durationSeconds,
      status,
      failureReason: errMsg.slice(0, 150),
      ...(params.modelOutput !== undefined ? { modelOutput: params.modelOutput } : {}),
    });

    this.#sessionManager.recordResponse(record.sessionId, endMs);
  }
}
