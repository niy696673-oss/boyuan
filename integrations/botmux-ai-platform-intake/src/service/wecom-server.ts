import { createServer, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseWeComIntakeConfig, prepareRuntimeDirectories } from '../config.js';
import {
  DirectWeComCompanyResearchIngress,
  DirectWeComFileIngress,
  WeComTextDelivery,
} from '../direct-wecom-intake.js';
import { IntakeService } from '../intake-service.js';
import { JsonJobStore } from '../job-store.js';
import { HttpPlatformClient } from '../platform-client.js';
import { COMPANY_RESEARCH_FILE_KEY, type JsonObject, type StatusCardReceipt } from '../types.js';
import {
  loadWeComCredentials,
  OfficialWeComTransport,
  WeComFileMaterializer,
} from '../wecom-runtime.js';

const configPath = process.env.BOYUAN_WECOM_INTAKE_CONFIG_PATH;
if (!configPath) throw new Error('wecom_intake_config_path_missing');
const raw = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;
if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('wecom_intake_config_invalid');
const config = parseWeComIntakeConfig(raw as Record<string, unknown>, dirname(configPath));
prepareRuntimeDirectories(config);

const port = Number(process.env.PORT ?? config.servicePort);
const host = process.env.HOST ?? '127.0.0.1';
if (host !== '127.0.0.1' && host !== '::1') throw new Error('wecom_intake_service_must_be_loopback');
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('wecom_intake_port_invalid');

const transport = new OfficialWeComTransport(config, loadWeComCredentials());
const materializer = new WeComFileMaterializer(config, transport);
const delivery = new WeComTextDelivery(transport);
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

const fileIngress = new DirectWeComFileIngress({
  materialize: (message) => materializer.materialize(message),
  ingestTurn: (turn) => service.ingestTurn(turn),
  delivery,
  ...receiptStore,
});
const companyIngress = new DirectWeComCompanyResearchIngress({
  researchCompany: (turn) => service.researchCompany(turn),
  delivery,
  ...receiptStore,
});

const reportIngressError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown_error';
  process.stderr.write(`[wecom-intake] ingress error: ${message.slice(0, 300)}\n`);
};

transport.start(async (frame) => {
  const company = await companyIngress.handle(frame);
  return company.handled ? company : fileIngress.handle(frame);
}, reportIngressError);
service.resumePending();
for (const receipt of service.listOrphanStatusCards()) resumeOrphan(receipt);

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    respond(response, 200, {
      ok: true,
      channel: 'wecom',
      wecomConnection: transport.connectionState(),
    });
    return;
  }
  respond(response, 404, { ok: false, error: 'not_found' });
});
server.listen(port, host);

function resumeOrphan(receipt: StatusCardReceipt): void {
  const reqId = metadataString(receipt.metadata, 'reqId');
  if (!reqId || !receipt.senderId) {
    terminalOrphan(receipt, 'wecom_orphan_metadata_invalid');
    return;
  }
  if (receipt.fileKey === COMPANY_RESEARCH_FILE_KEY) {
    void companyIngress.resume({
      reqId,
      chatId: receipt.chatId,
      messageId: receipt.messageId,
      companyName: receipt.fileName,
      receivedAt: receipt.createdAt,
      senderId: receipt.senderId,
    }).catch(reportIngressError);
    return;
  }
  const downloadUrl = metadataHttpsUrl(receipt.metadata, 'downloadUrl');
  if (!downloadUrl) {
    terminalOrphan(receipt, 'wecom_orphan_download_url_missing');
    return;
  }
  const aesKey = metadataString(receipt.metadata, 'aesKey');
  void fileIngress.resume({
    reqId,
    chatId: receipt.chatId,
    messageId: receipt.messageId,
    fileKey: receipt.fileKey,
    receivedAt: receipt.createdAt,
    senderId: receipt.senderId,
    downloadUrl,
    ...(aesKey ? { aesKey } : {}),
  }).catch(reportIngressError);
}

function terminalOrphan(receipt: StatusCardReceipt, code: string): void {
  void delivery.fail({
    kind: receipt.fileKey === COMPANY_RESEARCH_FILE_KEY ? 'company_research' : 'bp',
    chatId: receipt.chatId,
    sessionId: `wecom:${receipt.messageId}`,
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

function metadataHttpsUrl(metadata: JsonObject | undefined, key: string): string | undefined {
  const value = metadataString(metadata, key);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function respond(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function shutdown(): void {
  transport.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 4_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
