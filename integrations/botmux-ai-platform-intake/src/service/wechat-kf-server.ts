import { readFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { dirname } from 'node:path';
import { parseWechatKfIntakeConfig, prepareRuntimeDirectories } from '../config.js';
import { HttpPlatformClient } from '../platform-client.js';
import { createRuntimeConversationAgent } from '../conversation-agent.js';
import { createWechatConversationRuntime } from '../wechat-conversation-runtime.js';
import type { JsonObject, StatusCardReceipt } from '../types.js';
import { COMPANY_RESEARCH_FILE_KEY } from '../types.js';
import { createWechatKfCallbackHandler } from '../wechat-kf-callback.js';
import { WechatKfClient } from '../wechat-kf-client.js';
import { JsonWechatKfCursorStore, WechatKfMessagePump } from '../wechat-kf-pump.js';
import { loadWechatKfCredentials } from '../wechat-kf-runtime.js';
import { createCompanyListExtractor } from '../company-list-extractor.js';
import { WechatKfCompanyBatch } from '../wechat-kf-company-batch.js';
import { UsageCollector, UsageStore, MetricsAggregator } from '../telemetry/index.js';

const configPath = process.env.BOYUAN_WECHAT_KF_INTAKE_CONFIG_PATH;
if (!configPath) throw new Error('wechat_kf_intake_config_path_missing');
const raw = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;
if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('wechat_kf_intake_config_invalid');
const platformIntakeKey = process.env.BOYUAN_WECOM_INTAKE_KEY;
if (!platformIntakeKey) throw new Error('wechat_kf_platform_intake_key_missing');
const config = parseWechatKfIntakeConfig({
  ...(raw as Record<string, unknown>),
  platformIntakeKey,
}, dirname(configPath));
prepareRuntimeDirectories(config);

const port = Number(process.env.PORT ?? config.servicePort);
const host = process.env.HOST ?? '127.0.0.1';
if (host !== '127.0.0.1' && host !== '::1') throw new Error('wechat_kf_intake_service_must_be_loopback');
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('wechat_kf_intake_port_invalid');

const credentials = loadWechatKfCredentials();
const client = new WechatKfClient(credentials);
const reportIngressError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown_error';
  process.stderr.write(`[wechat-kf-intake] ingress error: ${message.slice(0, 300)}\n`);
};

const telemetryPath = process.env.BOYUAN_WECHAT_KF_TELEMETRY_PATH
  ?? process.env.BOYUAN_TELEMETRY_PATH
  ?? `${config.statePath}.telemetry.jsonl`;
const telemetryStore = new UsageStore({ filePath: telemetryPath });
const testUserIds = (process.env.BOYUAN_TEST_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const telemetryCollector = new UsageCollector({ store: telemetryStore, testUserIds });

const { service, ingress, companyIngress, delivery, conversation } = createWechatConversationRuntime({
  config, client, agent: createRuntimeConversationAgent(process.env), onError: reportIngressError,
  telemetry: telemetryCollector,
});
const pump = new WechatKfMessagePump({
  client,
  ingress: {
    handle: (message) => {
      if ('imageMediaId' in message) return companyBatch.handle(message);
      return conversation.handle(message);
    },
  },
  cursorStore: new JsonWechatKfCursorStore(config.cursorStatePath),
});
const recoveryPollIntervalMs = parseRecoveryPollInterval(
  process.env.WECHAT_KF_RECOVERY_POLL_INTERVAL_MS,
);

const extractionUrl = process.env.BOYUAN_OPENCODE_BASE_URL;
const extractionPassword = process.env.BOYUAN_OPENCODE_PASSWORD;
const companyBatch = new WechatKfCompanyBatch({
  statePath: `${config.statePath}.company-batches.json`,
  client,
  publicProductUrl: config.publicProductUrl,
  telemetry: telemetryCollector,
  onError: reportIngressError,
  extractor: extractionUrl ? createCompanyListExtractor({
    baseUrl: new URL(extractionUrl),
    directory: process.env.BOYUAN_OPENCODE_DIRECTORY ?? process.cwd(),
    ...(extractionPassword ? { credentials: { username: process.env.BOYUAN_OPENCODE_USERNAME ?? 'opencode', password: extractionPassword } } : {}),
    model: {
      providerId: process.env.BOYUAN_QUICK_CARD_PROVIDER_ID ?? 'openai',
      modelId: process.env.BOYUAN_QUICK_CARD_MODEL_ID ?? 'gpt-5.6-luna',
    },
  }) : { extract: async () => { throw new Error('company_list_extraction_not_configured'); } },
  platform: new HttpPlatformClient(config.platformBaseUrl, config.platformIntakeKey, 180_000,
    (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(180_000) }), 'wecom'),
});

const callbackHandler = createWechatKfCallbackHandler({
  token: credentials.callbackToken,
  encodingAESKey: credentials.encodingAESKey,
  corpId: credentials.corpId,
  onEvent: (event) => pump.handleEvent(event),
  onError: reportIngressError,
});

service.resumePending((job) => !conversation.has(job.messageId));
conversation.resumePending();
companyBatch.resumePending();
for (const receipt of service.listOrphanStatusCards()) {
  if (!conversation.has(receipt.messageId)) resumeOrphan(receipt);
}
void pump.pollKnownAccounts().catch(reportIngressError);
const recoveryPollTimer = setInterval(() => {
  void pump.pollKnownAccounts().catch(reportIngressError);
  companyBatch.resumePending();
}, recoveryPollIntervalMs);
recoveryPollTimer.unref();

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    respond(response, 200, { ok: true, channel: 'wechat-kf', conversationMode: 'natural', conversationEngine: 'shared' });
    return;
  }
  if (request.method === 'GET' && request.url === '/telemetry/metrics') {
    const summary = MetricsAggregator.aggregate(telemetryStore.getAllRecords());
    respond(response, 200, { ok: true, metrics: summary });
    return;
  }
  if (request.method === 'GET' && request.url === '/telemetry/records') {
    respond(response, 200, { ok: true, records: telemetryStore.getAllRecords() });
    return;
  }
  callbackHandler(request, response);
});
server.listen(port, host);

function resumeOrphan(receipt: StatusCardReceipt): void {
  const openKfid = metadataString(receipt.metadata, 'openKfid');
  if (receipt.fileKey === COMPANY_RESEARCH_FILE_KEY) {
    const companyName = metadataString(receipt.metadata, 'companyName');
    if (!openKfid || !companyName || !receipt.senderId) {
      terminalOrphan(receipt, 'wechat_kf_orphan_metadata_invalid');
      return;
    }
    void companyIngress.handle({
      messageId: receipt.messageId,
      openKfid,
      externalUserId: receipt.senderId,
      receivedAt: receipt.createdAt,
      text: `研究 ${companyName}`,
    }).catch(reportIngressError);
    return;
  }
  const mediaId = metadataString(receipt.metadata, 'mediaId');
  if (!openKfid || !mediaId || !receipt.senderId) {
    terminalOrphan(receipt, 'wechat_kf_orphan_metadata_invalid');
    return;
  }
  void ingress.handle({
    messageId: receipt.messageId,
    openKfid,
    externalUserId: receipt.senderId,
    receivedAt: receipt.createdAt,
    mediaId,
  }).catch(reportIngressError);
}

function terminalOrphan(receipt: StatusCardReceipt, code: string): void {
  void delivery.fail({
    kind: receipt.fileKey === COMPANY_RESEARCH_FILE_KEY ? 'company_research' : 'bp',
    chatId: receipt.chatId,
    sessionId: `wechat-kf:${receipt.messageId}`,
    messageId: receipt.messageId,
    fileKey: receipt.fileKey,
    statusReceipt: receipt.cardMessageId,
    subject: receipt.fileName,
  }).then(() => {
    service.markStatusCardTerminal(receipt.messageId, receipt.fileKey);
  }).catch(reportIngressError);
  reportIngressError(new Error(code));
}

function metadataString(metadata: JsonObject | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() && value.length <= 4_096
    ? value.trim()
    : undefined;
}

function respond(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function shutdown(): void {
  clearInterval(recoveryPollTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 4_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function parseRecoveryPollInterval(value: string | undefined): number {
  if (value === undefined) return 60_000;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 30_000 || parsed > 3_600_000) {
    throw new Error('wechat_kf_recovery_poll_interval_invalid');
  }
  return parsed;
}
