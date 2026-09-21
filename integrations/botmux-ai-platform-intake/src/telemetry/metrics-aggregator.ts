import type { BotChannel, BotFeature, MetricsSummary, UsageRecord } from './types.js';

export class MetricsAggregator {
  static compute(records: UsageRecord[]): MetricsSummary {
    if (!records.length) {
      return this.#emptySummary();
    }

    // 过滤出有效且非测试的业务请求
    const validBizRecords = records.filter((r) => r.isValidRequest && r.isTest === '否');
    const allNonTestRecords = records.filter((r) => r.isTest === '否');

    // 1. 实际使用人数 (01)
    const feishuUsers = new Set<string>();
    const wechatUsers = new Set<string>();
    const totalUsers = new Set<string>();

    for (const r of validBizRecords) {
      totalUsers.add(r.userId);
      if (r.channel === '飞书') feishuUsers.add(r.userId);
      if (r.channel === '微信客服') wechatUsers.add(r.userId);
    }

    const actualUsersCount = totalUsers.size;

    // 2. 使用次数与人均次数 (02)
    const validRequestsCount = validBizRecords.length;
    const requestsPerUser = actualUsersCount > 0 ? Number((validRequestsCount / actualUsersCount).toFixed(1)) : 0;

    // 3. 对话场次与多轮使用比例 (03, 08)
    const sessionMap = new Map<
      string,
      {
        channel: BotChannel;
        userId: string;
        records: UsageRecord[];
        startMs: number;
        endMs: number;
      }
    >();

    for (const r of validBizRecords) {
      const s = sessionMap.get(r.sessionId) ?? {
        channel: r.channel,
        userId: r.userId,
        records: [],
        startMs: r.startTimestampMs,
        endMs: r.endTimestampMs ?? r.startTimestampMs,
      };
      s.records.push(r);
      s.startMs = Math.min(s.startMs, r.startTimestampMs);
      s.endMs = Math.max(s.endMs, r.endTimestampMs ?? r.startTimestampMs);
      sessionMap.set(r.sessionId, s);
    }

    const totalSessions = sessionMap.size;
    let singleRequestSessions = 0;
    let multiRequestSessions = 0;
    const sessionDurations: number[] = [];

    for (const session of sessionMap.values()) {
      if (session.records.length === 1) {
        singleRequestSessions += 1;
      } else {
        multiRequestSessions += 1;
      }
      const durSec = Math.max(0, (session.endMs - session.startMs) / 1000);
      sessionDurations.push(durSec);
    }

    const multiTurnRatio = totalSessions > 0 ? Number((multiRequestSessions / totalSessions).toFixed(3)) : 0;

    // 4. 平均对话持续时长 (04)
    sessionDurations.sort((a, b) => a - b);
    const avgDuration =
      sessionDurations.length > 0
        ? Number((sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length).toFixed(1))
        : 0;
    const medianDuration =
      sessionDurations.length > 0
        ? Number((sessionDurations[Math.floor(sessionDurations.length / 2)] ?? 0).toFixed(1))
        : 0;

    // 5. 各功能使用人数与次数 (05)
    const featureMap = new Map<BotFeature, { users: Set<string>; count: number }>();
    for (const r of validBizRecords) {
      const entry = featureMap.get(r.feature) ?? { users: new Set(), count: 0 };
      entry.users.add(r.userId);
      entry.count += 1;
      featureMap.set(r.feature, entry);
    }

    const featuresSummary = Array.from(featureMap.entries())
      .map(([feature, data]) => ({
        feature,
        usersCount: data.users.size,
        requestsCount: data.count,
        percentage: validRequestsCount > 0 ? Number(((data.count / validRequestsCount) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.requestsCount - a.requestsCount);

    // 6. 结果交付成功率与失败原因 (06)
    let successCount = 0;
    let failCount = 0;
    let timeoutCount = 0;
    let inProgressCount = 0;
    const failureReasons: Record<string, number> = {};

    for (const r of validBizRecords) {
      if (r.status === '成功') successCount += 1;
      else if (r.status === '失败') failCount += 1;
      else if (r.status === '超时') timeoutCount += 1;
      else if (r.status === '处理中') inProgressCount += 1;

      if (r.failureReason) {
        const key = r.failureReason.slice(0, 50);
        failureReasons[key] = (failureReasons[key] ?? 0) + 1;
      }
    }

    const successRate =
      validRequestsCount > 0 ? Number(((successCount / validRequestsCount) * 100).toFixed(1)) : 0;

    // 7. 平均响应耗时与 P90 (07)
    const latencies = validBizRecords
      .filter((r) => r.status === '成功' && r.durationSeconds > 0)
      .map((r) => r.durationSeconds)
      .sort((a, b) => a - b);

    const avgLatency =
      latencies.length > 0
        ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1))
        : 0;
    const p90Index = Math.min(latencies.length - 1, Math.floor(latencies.length * 0.9));
    const p90Latency = latencies.length > 0 ? Number((latencies[p90Index] ?? 0).toFixed(1)) : 0;

    // 11. 跨会话再次使用 (11)
    const userSessionCount = new Map<string, number>();
    for (const session of sessionMap.values()) {
      userSessionCount.set(session.userId, (userSessionCount.get(session.userId) ?? 0) + 1);
    }
    let multiSessionUsers = 0;
    for (const count of userSessionCount.values()) {
      if (count >= 2) multiSessionUsers += 1;
    }
    const multiSessionRatio =
      actualUsersCount > 0 ? Number(((multiSessionUsers / actualUsersCount) * 100).toFixed(1)) : 0;

    // 12. 典型失败样例 (12)
    const sampleIssues = validBizRecords
      .filter((r) => r.status === '失败' || r.status === '超时')
      .slice(0, 10)
      .map((r) => ({
        recordId: r.recordId,
        feature: r.feature,
        question: r.notes ?? r.rawText?.slice(0, 30) ?? '',
        status: r.status,
        reason: r.failureReason,
      }));

    // 起止时间
    const sortedTimes = records.map((r) => r.startTime).sort();
    const periodStart = sortedTimes[0] ?? '';
    const periodEnd = sortedTimes[sortedTimes.length - 1] ?? '';

    return {
      period: { start: periodStart, end: periodEnd },
      actualUsers: {
        total: actualUsersCount,
        feishu: feishuUsers.size,
        wechatKf: wechatUsers.size,
      },
      usage: {
        validRequests: validRequestsCount,
        totalRequests: records.length,
        requestsPerUser,
      },
      sessions: {
        total: totalSessions,
        singleRequestSessions,
        multiRequestSessions,
        multiTurnRatio,
      },
      duration: {
        averageSeconds: avgDuration,
        medianSeconds: medianDuration,
      },
      features: featuresSummary,
      delivery: {
        successRate,
        successCount,
        failCount,
        timeoutCount,
        inProgressCount,
        failureReasons,
      },
      latency: {
        averageSeconds: avgLatency,
        p90Seconds: p90Latency,
      },
      retention: {
        multiSessionUsers,
        multiSessionRatio,
      },
      sampleIssues,
    };
  }

  static renderMarkdownReport(summary: MetricsSummary): string {
    const lines: string[] = [];
    lines.push(`# 🤖 机器人体验使用数据看板（对齐 9月23日 Demo 口径）`);
    lines.push(`> 统计周期：${summary.period.start || '-'} ~ ${summary.period.end || '-'}\n`);

    lines.push(`## 01 实际使用人数与使用频次`);
    lines.push(`- **去重实际使用人数**：**${summary.actualUsers.total}** 人`);
    lines.push(`  - 飞书渠道用户数：${summary.actualUsers.feishu} 人`);
    lines.push(`  - 微信客服用户数：${summary.actualUsers.wechatKf} 人`);
    lines.push(`- **有效请求总次数**：**${summary.usage.validRequests}** 次 (总接收请求: ${summary.usage.totalRequests} 次)`);
    lines.push(`- **人均有效请求数**：**${summary.usage.requestsPerUser}** 次/人\n`);

    lines.push(`## 02 对话场次与多轮互动`);
    lines.push(`- **总对话场次 (30m 会话)**：**${summary.sessions.total}** 场`);
    lines.push(`- **多轮互动会话数 (≥2次请求)**：${summary.sessions.multiRequestSessions} 场`);
    lines.push(`- **单次体验会话数 (1次请求)**：${summary.sessions.singleRequestSessions} 场`);
    lines.push(`- **多轮使用比例**：**${(summary.sessions.multiTurnRatio * 100).toFixed(1)}%**`);
    lines.push(`- **跨会话回访用户数**：${summary.retention.multiSessionUsers} 人 (${summary.retention.multiSessionRatio}%)\n`);

    lines.push(`## 03 对话时长与响应性能`);
    lines.push(`- **平均对话跨度时长**：${summary.duration.averageSeconds} 秒 (中位数: ${summary.duration.medianSeconds} 秒)`);
    lines.push(`- **平均响应耗时**：**${summary.latency.averageSeconds}** 秒`);
    lines.push(`- **P90 响应耗时**：**${summary.latency.p90Seconds}** 秒\n`);

    lines.push(`## 04 交付成功率`);
    lines.push(`- **结果交付成功率**：**${summary.delivery.successRate}%**`);
    lines.push(`  - 成功：${summary.delivery.successCount} 次`);
    lines.push(`  - 失败：${summary.delivery.failCount} 次`);
    lines.push(`  - 超时：${summary.delivery.timeoutCount} 次`);
    lines.push(`  - 处理中：${summary.delivery.inProgressCount} 次\n`);

    lines.push(`## 05 各功能使用排行榜`);
    lines.push(`| 功能名称 | 使用人数 | 请求次数 | 占比 |`);
    lines.push(`| :--- | :--- | :--- | :--- |`);
    for (const f of summary.features) {
      lines.push(`| ${f.feature} | ${f.usersCount} 人 | ${f.requestsCount} 次 | ${f.percentage}% |`);
    }

    if (summary.sampleIssues.length > 0) {
      lines.push(`\n## 06 典型失败与异常样例复盘`);
      lines.push(`| 记录ID | 功能 | 问题摘要 | 状态 | 失败原因 |`);
      lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
      for (const issue of summary.sampleIssues) {
        lines.push(`| ${issue.recordId} | ${issue.feature} | ${issue.question} | ${issue.status} | ${issue.reason ?? '-'} |`);
      }
    }

    return lines.join('\n');
  }

  static #emptySummary(): MetricsSummary {
    return {
      period: { start: '', end: '' },
      actualUsers: { total: 0, feishu: 0, wechatKf: 0 },
      usage: { validRequests: 0, totalRequests: 0, requestsPerUser: 0 },
      sessions: { total: 0, singleRequestSessions: 0, multiRequestSessions: 0, multiTurnRatio: 0 },
      duration: { averageSeconds: 0, medianSeconds: 0 },
      features: [],
      delivery: { successRate: 0, successCount: 0, failCount: 0, timeoutCount: 0, inProgressCount: 0, failureReasons: {} },
      latency: { averageSeconds: 0, p90Seconds: 0 },
      retention: { multiSessionUsers: 0, multiSessionRatio: 0 },
      sampleIssues: [],
    };
  }
}
