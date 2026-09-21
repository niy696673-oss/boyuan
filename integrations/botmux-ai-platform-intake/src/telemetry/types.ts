export type BotChannel = '飞书' | '微信客服';

export type BotFeature =
  | '公司快速研究'
  | 'BP分析'
  | '资料解析'
  | '批量公司研究'
  | '行业问答'
  | '自由问答'
  | '打招呼';

export type BotResultStatus =
  | '成功'
  | '失败'
  | '超时'
  | '处理中'
  | '无匹配结果';

export interface UsageRecord {
  /** 记录ID (A列) */
  recordId: string;
  /** 用户标识 (B列) */
  userId: string;
  /** 渠道 (C列) */
  channel: BotChannel;
  /** 使用功能 (D列) */
  feature: BotFeature;
  /** 开始时间 (E列): YYYY-MM-DD HH:mm:ss */
  startTime: string;
  /** 结束时间 (F列): YYYY-MM-DD HH:mm:ss */
  endTime?: string;
  /** 结果状态 (G列) */
  status: BotResultStatus;
  /** 响应秒数 (H列) */
  durationSeconds: number;
  /** 会话ID (I列) - 30分钟无请求滚动切分 */
  sessionId: string;
  /** 失败原因 (J列) */
  failureReason?: string;
  /** 内部测试 (K列): 是 / 否 */
  isTest: '是' | '否';
  /** 用户反馈 (L列): 有帮助 / 无帮助 / 未反馈 */
  feedback: '有帮助' | '无帮助' | '未反馈';
  /** 备注 (M列): 脱敏问题摘要或附加说明 */
  notes?: string;

  // 内部辅助字段
  isValidRequest: boolean;
  rawText?: string;
  startTimestampMs: number;
  endTimestampMs?: number;
  syncedToFeishu?: boolean;
}

export interface SessionState {
  sessionId: string;
  userId: string;
  channel: BotChannel;
  firstRequestAt: number;
  lastRequestAt: number;
  lastResponseAt?: number;
  totalRequests: number;
  validRequests: number;
}

export interface MetricsSummary {
  period: {
    start: string;
    end: string;
  };
  actualUsers: {
    total: number;
    feishu: number;
    wechatKf: number;
  };
  usage: {
    validRequests: number;
    totalRequests: number;
    requestsPerUser: number;
  };
  sessions: {
    total: number;
    singleRequestSessions: number;
    multiRequestSessions: number;
    multiTurnRatio: number;
  };
  duration: {
    averageSeconds: number;
    medianSeconds: number;
  };
  features: Array<{
    feature: BotFeature;
    usersCount: number;
    requestsCount: number;
    percentage: number;
  }>;
  delivery: {
    successRate: number;
    successCount: number;
    failCount: number;
    timeoutCount: number;
    inProgressCount: number;
    failureReasons: Record<string, number>;
  };
  latency: {
    averageSeconds: number;
    p90Seconds: number;
  };
  retention: {
    multiSessionUsers: number;
    multiSessionRatio: number;
  };
  sampleIssues: Array<{
    recordId: string;
    feature: string;
    question: string;
    status: string;
    reason?: string;
  }>;
}
