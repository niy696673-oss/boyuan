import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  SessionManager,
  SESSION_INACTIVITY_TIMEOUT_MS,
  UsageCollector,
  UsageStore,
  MetricsAggregator,
  type UsageRecord,
} from '../src/telemetry/index.js';
import { tempDir } from './helpers.js';

describe('SessionManager (30分钟滚动会话切分)', () => {
  it('reuses session within 30 minutes and rolls to a new session after 30 minutes', () => {
    const manager = new SessionManager();
    const t0 = 1727000000000;

    // First request
    const s1 = manager.allocateSession('飞书', 'ou_user_1', t0, true);
    expect(s1.isNewSession).toBe(true);
    expect(s1.sessionId).toMatch(/^sess_/);

    // Request 10 minutes later (same session)
    const s2 = manager.allocateSession('飞书', 'ou_user_1', t0 + 10 * 60 * 1000, true);
    expect(s2.isNewSession).toBe(false);
    expect(s2.sessionId).toBe(s1.sessionId);

    // Request 25 minutes after second request (within 30m of last request)
    const s3 = manager.allocateSession('飞书', 'ou_user_1', t0 + 35 * 60 * 1000, true);
    expect(s3.isNewSession).toBe(false);
    expect(s3.sessionId).toBe(s1.sessionId);

    // Request 31 minutes after third request (exceeds 30m timeout, new session)
    const s4 = manager.allocateSession('飞书', 'ou_user_1', t0 + 66 * 60 * 1000, true);
    expect(s4.isNewSession).toBe(true);
    expect(s4.sessionId).not.toBe(s1.sessionId);

    // Different user has independent session
    const sOther = manager.allocateSession('飞书', 'ou_user_2', t0, true);
    expect(sOther.isNewSession).toBe(true);
    expect(sOther.sessionId).not.toBe(s1.sessionId);
  });
});

describe('UsageCollector (意图分类与生命周期采集)', () => {
  it('correctly classifies business features and distinguishes greetings/invalid requests', () => {
    const temp = tempDir();
    try {
      const store = new UsageStore({ filePath: join(temp.path, 'records.jsonl') });
      const collector = new UsageCollector({ store, testUserIds: ['ou_internal_tester'] });

      // Greeting (invalid)
      expect(collector.classifyFeature('你好')).toEqual({ feature: '打招呼', isValid: false });
      expect(collector.classifyFeature('hi')).toEqual({ feature: '打招呼', isValid: false });
      expect(collector.classifyFeature('菜单')).toEqual({ feature: '打招呼', isValid: false });

      // Company Research (valid)
      expect(collector.classifyFeature('分析宁德时代')).toEqual({ feature: '公司快速研究', isValid: true });
      expect(collector.classifyFeature('地平线机器人')).toEqual({ feature: '公司快速研究', isValid: true });

      // Batch Research (valid)
      expect(collector.classifyFeature('分析宁德时代、比亚迪、腾讯控股')).toEqual({
        feature: '批量公司研究',
        isValid: true,
      });

      // BP and File Analysis
      expect(collector.classifyFeature('', '巨湾技研 BP 20201223.pdf')).toEqual({
        feature: 'BP分析',
        isValid: true,
      });
      expect(collector.classifyFeature('', '公司财报及业务纪要.docx')).toEqual({
        feature: '资料解析',
        isValid: true,
      });

      // Industry Q&A
      expect(collector.classifyFeature('锂电池产业链的竞争格局与市场空间如何？')).toEqual({
        feature: '行业问答',
        isValid: true,
      });

      // General Q&A
      expect(collector.classifyFeature('请帮我总结一下刚才提到的核心观点')).toEqual({
        feature: '自由问答',
        isValid: true,
      });
    } finally {
      temp.cleanup();
    }
  });

  it('records complete turn lifecycle with accurate duration, status and persistence', () => {
    const temp = tempDir();
    try {
      const filePath = join(temp.path, 'records.jsonl');
      const store = new UsageStore({ filePath });
      const collector = new UsageCollector({ store, testUserIds: ['ou_tester'] });

      // Start turn
      const tStart = new Date('2026-09-22T10:00:00.000Z');
      const { recordId, sessionId } = collector.onTurnStart({
        recordId: 'msg-001',
        channel: '飞书',
        userId: 'ou_normal_user',
        text: '请分析一下宁德时代的主营业务和风险',
        receivedAt: tStart.toISOString(),
      });

      const initial = store.getRecord(recordId)!;
      expect(initial.status).toBe('处理中');
      expect(initial.feature).toBe('公司快速研究');
      expect(initial.isTest).toBe('否');
      expect(initial.isValidRequest).toBe(true);
      expect(initial.sessionId).toBe(sessionId);

      // Complete turn 3.5s later
      const tEnd = new Date('2026-09-22T10:00:03.500Z');
      collector.onTurnComplete({
        recordId,
        completedAt: tEnd,
        status: '成功',
      });

      const completed = store.getRecord(recordId)!;
      expect(completed.status).toBe('成功');
      expect(completed.durationSeconds).toBe(3.5);
      expect(completed.endTime).toBeDefined();

      // Check file content
      expect(existsSync(filePath)).toBe(true);
      const fileContent = readFileSync(filePath, 'utf8');
      expect(fileContent).toContain('msg-001');
      expect(fileContent).toContain('宁德时代');
    } finally {
      temp.cleanup();
    }
  });
});

describe('MetricsAggregator (对齐 9月23日 Demo 全部 12 项指标)', () => {
  it('accurately computes user counts, sessions, multi-turn ratio, success rate and latency', () => {
    const baseTime = 1727000000000;
    const records: UsageRecord[] = [
      // User 1: Session 1 (2 valid requests, multi-turn)
      {
        recordId: 'r1',
        userId: 'u_user_1',
        channel: '飞书',
        feature: '公司快速研究',
        startTime: '2026-09-22 10:00:00',
        endTime: '2026-09-22 10:00:02',
        status: '成功',
        durationSeconds: 2.0,
        sessionId: 's1',
        isTest: '否',
        feedback: '未反馈',
        isValidRequest: true,
        startTimestampMs: baseTime,
        endTimestampMs: baseTime + 2000,
      },
      {
        recordId: 'r2',
        userId: 'u_user_1',
        channel: '飞书',
        feature: '行业问答',
        startTime: '2026-09-22 10:05:00',
        endTime: '2026-09-22 10:05:04',
        status: '成功',
        durationSeconds: 4.0,
        sessionId: 's1',
        isTest: '否',
        feedback: '有帮助',
        isValidRequest: true,
        startTimestampMs: baseTime + 300000,
        endTimestampMs: baseTime + 304000,
      },
      // User 1: Session 2 (Cross-session retention test, 1 request)
      {
        recordId: 'r3',
        userId: 'u_user_1',
        channel: '飞书',
        feature: 'BP分析',
        startTime: '2026-09-22 12:00:00',
        endTime: '2026-09-22 12:00:05',
        status: '成功',
        durationSeconds: 5.0,
        sessionId: 's2',
        isTest: '否',
        feedback: '未反馈',
        isValidRequest: true,
        startTimestampMs: baseTime + 7200000,
        endTimestampMs: baseTime + 7205000,
      },
      // User 2 (WeChat KF, 1 failed request)
      {
        recordId: 'r4',
        userId: 'wx_user_2',
        channel: '微信客服',
        feature: '批量公司研究',
        startTime: '2026-09-22 11:00:00',
        endTime: '2026-09-22 11:00:03',
        status: '失败',
        durationSeconds: 3.0,
        sessionId: 's3',
        failureReason: 'wechat_kf_api_error',
        isTest: '否',
        feedback: '未反馈',
        isValidRequest: true,
        startTimestampMs: baseTime + 3600000,
        endTimestampMs: baseTime + 3603000,
      },
      // User 3 (Only greeted, invalid request - should be excluded from actual users count)
      {
        recordId: 'r5',
        userId: 'u_user_3',
        channel: '飞书',
        feature: '打招呼',
        startTime: '2026-09-22 10:00:00',
        endTime: '2026-09-22 10:00:01',
        status: '成功',
        durationSeconds: 1.0,
        sessionId: 's4',
        isTest: '否',
        feedback: '未反馈',
        isValidRequest: false,
        startTimestampMs: baseTime,
        endTimestampMs: baseTime + 1000,
      },
      // Internal Tester (should be excluded from business metrics)
      {
        recordId: 'r6',
        userId: 'tester_internal',
        channel: '飞书',
        feature: '公司快速研究',
        startTime: '2026-09-22 09:00:00',
        status: '成功',
        durationSeconds: 2.0,
        sessionId: 's5',
        isTest: '是',
        feedback: '未反馈',
        isValidRequest: true,
        startTimestampMs: baseTime - 3600000,
      },
    ];

    const summary = MetricsAggregator.compute(records);

    // 01 实际使用人数: u_user_1 + wx_user_2 = 2人 (排除 u_user_3 和 tester_internal)
    expect(summary.actualUsers.total).toBe(2);
    expect(summary.actualUsers.feishu).toBe(1);
    expect(summary.actualUsers.wechatKf).toBe(1);

    // 02 使用次数与人均次数: r1, r2, r3, r4 = 4次有效请求
    expect(summary.usage.validRequests).toBe(4);
    expect(summary.usage.requestsPerUser).toBe(2.0); // 4 / 2 = 2.0

    // 03 对话场次: s1, s2, s3 = 3场有效会话
    expect(summary.sessions.total).toBe(3);
    expect(summary.sessions.multiRequestSessions).toBe(1); // s1 has 2 requests
    expect(summary.sessions.singleRequestSessions).toBe(2); // s2, s3

    // 08 多轮使用比例: 1 / 3 ≈ 33.3%
    expect(summary.sessions.multiTurnRatio).toBeCloseTo(0.333, 2);

    // 06 结果交付成功率: 3成功 (r1, r2, r3) / 4有效 = 75.0%
    expect(summary.delivery.successRate).toBe(75.0);
    expect(summary.delivery.successCount).toBe(3);
    expect(summary.delivery.failCount).toBe(1);
    expect(summary.delivery.failureReasons['wechat_kf_api_error']).toBe(1);

    // 07 响应耗时 (r1=2s, r2=4s, r3=5s -> avg = 3.7s)
    expect(summary.latency.averageSeconds).toBeCloseTo(3.7, 1);

    // 11 跨会话再次使用: u_user_1 有 s1 和 s2 两场会话 -> 1 / 2 = 50%
    expect(summary.retention.multiSessionUsers).toBe(1);
    expect(summary.retention.multiSessionRatio).toBe(50.0);

    // 格式化输出测试
    const markdown = MetricsAggregator.renderMarkdownReport(summary);
    expect(markdown).toContain('去重实际使用人数');
    expect(markdown).toContain('结果交付成功率');
    expect(markdown).toContain('各功能使用排行榜');
    expect(markdown).toContain('典型失败与异常样例复盘');
  });
});
