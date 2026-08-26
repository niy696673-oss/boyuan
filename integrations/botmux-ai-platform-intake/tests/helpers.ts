import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { IntakeConfig, PlatformConversation, QuickCardResult } from '../src/types.js';

export function tempDir() {
  const path = mkdtempSync(join(tmpdir(), 'boyuan-intake-'));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

export function testConfig(root: string, overrides: Partial<IntakeConfig> = {}): IntakeConfig {
  const attachmentRoot = join(root, 'attachments');
  mkdirSync(attachmentRoot, { recursive: true });
  return {
    schemaVersion: 1,
    larkAppId: 'cli_test_app',
    botmuxConfigPath: join(root, 'bots.json'),
    platformBaseUrl: 'http://127.0.0.1:4173',
    platformIntakeKey: 'platform-secret-123456',
    publicWorkbenchUrl: 'https://demo.example.com/workbench',
    publicProductUrl: 'https://demo.example.com',
    botmuxExecutable: '/safe/botmux',
    servicePort: 19470,
    serviceKey: 'loopback-secret-123456',
    attachmentRoot,
    statePath: join(root, 'state', 'jobs.json'),
    outboxDir: join(root, 'outbox'),
    retryDelayMs: 1_500,
    timeoutMs: 600_000,
    ...overrides,
  };
}

export function quickCard(overrides: Partial<QuickCardResult> = {}): QuickCardResult {
  return {
    status: 'completed',
    companyName: '博源科技',
    companyIdentity: '博源科技 · 杭州 · 2021 年成立',
    industryTrack: '企业研究智能化 · 机构知识平台',
    financing: 'A 轮 · 2000 万元 · 估值待确认',
    keyPeople: 'CEO 田阳 · 团队规模材料未披露',
    highlights: ['核心能力已形成', '机构知识沉淀闭环'],
    competitorNames: ['Iktos', '晶泰科技'],
    upstreamNames: ['模型服务商'],
    downstreamNames: ['投资机构', '产业集团'],
    confidence: 86,
    confidenceLevel: '高',
    navigation: {},
    providerId: 'openai',
    modelId: 'gpt-5.6-luna',
    variant: 'none',
    sessionId: 'session-quick',
    ...overrides,
  };
}

export function conversation(id: string, status: PlatformConversation['status'] = 'completed'): PlatformConversation {
  return {
    conversationId: id,
    title: '测试材料',
    status,
    document: { fileName: `${id}.pdf`, materialType: 'BP' },
    company: { canonicalName: '博源科技' },
    analysisSections: [{ key: 'summary', summary: '公司定位清晰，核心能力已形成。' }],
    candidates: [{ status: 'pending' }, { status: 'confirmed' }],
    task: {},
  };
}
