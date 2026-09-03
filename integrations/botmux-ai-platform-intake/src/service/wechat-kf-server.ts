import { readFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { dirname } from 'node:path';
import { parseWechatKfIntakeConfig, prepareRuntimeDirectories } from '../config.js';
import {
  DirectWechatKfFileIngress,
  WechatKfTextDelivery,
} from '../direct-wechat-kf-intake.js';
import { IntakeService } from '../intake-service.js';
import { JsonJobStore } from '../job-store.js';
import { HttpPlatformClient } from '../platform-client.js';
import type { JsonObject, StatusCardReceipt } from '../types.js';
import { createWechatKfCallbackHandler } from '../wechat-kf-callback.js';
import { WechatKfClient } from '../wechat-kf-client.js';
import { JsonWechatKfCursorStore, WechatKfMessagePump } from '../wechat-kf-pump.js';
import { loadWechatKfCredentials, WechatKfFileMaterializer } from '../wechat-kf-runtime.js';

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
const materializer = new WechatKfFileMaterializer(config, client);
const delivery = new WechatKfTextDelivery(client);
const service = new IntakeService({
  config,
  platform: new HttpPlatformClient(
    config.platformBaseUrl,
    config.platformIntakeKey,
    config.timeoutMs,
    fetch,
    'wecom',
  ),
  delivery,
  store: new JsonJobStore(config.statePath),
  releaseAttachment: (attachment) => materializer.release(attachment),
});

const receiptStore = {
  statusReceiptId: (messageId: string, fileKey: string) => service.statusCardId(messageId, fileKey),
  statusReceiptTerminal: (messageId: string, fileKey: string) => (
    service.isStatusCardTerminal(messageId, fileKey)
  ),
  rememberStatusReceipt: (input: {
    chatId: string;
    messageId: string;
    fileKey: string;
    fileName: string;
    receipt: string;
    createdAt: string;
    senderId: string;
    metadata?: Record<string, string>;
  }) => service.rememberStatusCard({
    chatId: input.chatId,
    messageId: input.messageId,
    fileKey: input.fileKey,
    fileName: input.fileName,
    cardMessageId: input.receipt,
    createdAt: input.createdAt,
    senderId: input.senderId,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }),
  markStatusReceiptTerminal: (messageId: string, fileKey: string) => {
    service.markStatusCardTerminal(messageId, fileKey);
  },
};

const ingress = new DirectWechatKfFileIngress({
  delivery,
  materialize: (message, fileKey) => materializer.materialize(message, fileKey),
  ingestTurn: (turn) => service.ingestTurn(turn),
  ...receiptStore,
});
const pump = new WechatKfMessagePump({
  client,
  ingress,
  cursorStore: new JsonWechatKfCursorStore(config.cursorStatePath),
});
const recoveryPollIntervalMs = parseRecoveryPollInterval(
  process.env.WECHAT_KF_RECOVERY_POLL_INTERVAL_MS,
);

const reportIngressError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown_error';
  process.stderr.write(`[wechat-kf-intake] ingress error: ${message.slice(0, 300)}\n`);
};

const callbackHandler = createWechatKfCallbackHandler({
  token: credentials.callbackToken,
  encodingAESKey: credentials.encodingAESKey,
  corpId: credentials.corpId,
  onEvent: (event) => pump.handleEvent(event),
  onError: reportIngressError,
});

service.resumePending();
for (const receipt of service.listOrphanStatusCards()) resumeOrphan(receipt);
void pump.pollKnownAccounts().catch(reportIngressError);
const recoveryPollTimer = setInterval(() => {
  void pump.pollKnownAccounts().catch(reportIngressError);
}, recoveryPollIntervalMs);
recoveryPollTimer.unref();

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    respond(response, 200, { ok: true, channel: 'wechat-kf' });
    return;
  }
  callbackHandler(request, response);
});
server.listen(port, host);

function resumeOrphan(receipt: StatusCardReceipt): void {
  const openKfid = metadataString(receipt.metadata, 'openKfid');
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
    kind: 'bp',
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
