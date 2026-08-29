import { createServer, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseIntakeConfig, prepareRuntimeDirectories } from '../config.js';
import {
  DirectFeishuCompanyResearchIngress,
  DirectFeishuFileIngress,
  FeishuCardMessenger,
} from '../direct-feishu-intake.js';
import { LarkFeishuTransport, loadBotmuxLarkCredentials } from '../feishu-runtime.js';
import { COMPANY_RESEARCH_FILE_KEY, IntakeService } from '../intake-service.js';
import { JsonJobStore } from '../job-store.js';
import { HttpPlatformClient } from '../platform-client.js';

const configPath = process.env.BOTMUX_AI_PLATFORM_INTAKE_CONFIG_PATH;
if (!configPath) throw new Error('intake_config_path_missing');
const raw = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;
if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('intake_config_invalid');
const config = parseIntakeConfig(raw as Record<string, unknown>, dirname(configPath));
prepareRuntimeDirectories(config);
const port = Number(process.env.PORT ?? config.servicePort);
const host = process.env.HOST ?? '127.0.0.1';
if (host !== '127.0.0.1' && host !== '::1') throw new Error('intake_service_must_be_loopback');
const feishu = new LarkFeishuTransport(config, loadBotmuxLarkCredentials(config));
const messenger = new FeishuCardMessenger(feishu);
const service = new IntakeService({
  config,
  platform: new HttpPlatformClient(config.platformBaseUrl, config.platformIntakeKey, config.timeoutMs),
  messenger,
  store: new JsonJobStore(config.statePath),
  releaseAttachment: (attachment) => feishu.release(attachment),
});
const ingress = new DirectFeishuFileIngress({
  materialize: (message) => feishu.materialize(message),
  ingestTurn: (turn) => service.ingestTurn(turn),
  messenger,
  statusCardId: (message) =>
    service.statusCardId(message.messageId, message.fileKey),
  rememberStatusCard: (message, cardMessageId) =>
    service.rememberStatusCard({
      chatId: message.chatId,
      messageId: message.messageId,
      fileKey: message.fileKey,
      fileName: message.fileName,
      cardMessageId,
      createdAt: message.receivedAt,
      ...(message.senderId ? { senderId: message.senderId } : {}),
    }),
  markStatusCardTerminal: (message) =>
    service.markStatusCardTerminal(message.messageId, message.fileKey),
});
const companyIngress = new DirectFeishuCompanyResearchIngress({
  researchCompany: (turn) => service.researchCompany(turn),
  messenger,
  statusCardId: (message) =>
    service.statusCardId(message.messageId, COMPANY_RESEARCH_FILE_KEY),
  rememberStatusCard: (message, cardMessageId) =>
    service.rememberStatusCard({
      chatId: message.chatId,
      messageId: message.messageId,
      fileKey: COMPANY_RESEARCH_FILE_KEY,
      fileName: message.companyName,
      cardMessageId,
      createdAt: message.receivedAt,
      ...(message.senderId ? { senderId: message.senderId } : {}),
    }),
  markStatusCardTerminal: (message) =>
    service.markStatusCardTerminal(message.messageId, COMPANY_RESEARCH_FILE_KEY),
});
const reportIngressError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown_error';
  process.stderr.write(`[ai-platform-intake] Feishu ingress error: ${message.slice(0, 300)}\n`);
};
feishu.start(async (data) => {
  const company = await companyIngress.handle(data);
  return company.handled ? company : ingress.handle(data);
}, reportIngressError);
service.resumePending();
for (const receipt of service.listOrphanStatusCards()) {
  if (receipt.fileKey === COMPANY_RESEARCH_FILE_KEY) {
    void companyIngress.resume({
      chatId: receipt.chatId,
      messageId: receipt.messageId,
      companyName: receipt.fileName,
      receivedAt: receipt.createdAt,
      ...(receipt.senderId ? { senderId: receipt.senderId } : {}),
    }).catch(reportIngressError);
    continue;
  }
  void ingress.resume({
    chatId: receipt.chatId,
    messageId: receipt.messageId,
    fileKey: receipt.fileKey,
    fileName: receipt.fileName,
    receivedAt: receipt.createdAt,
    ...(receipt.senderId ? { senderId: receipt.senderId } : {}),
  }).catch(reportIngressError);
}

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    respond(response, 200, {
      ok: true,
      pluginId: process.env.BOTMUX_PLUGIN_ID ?? 'ai-platform-intake',
      feishuConnection: feishu.connectionState(),
    });
    return;
  }
  respond(response, 404, { ok: false, error: 'not_found' });
});
server.listen(port, host);

function respond(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(`${JSON.stringify(body)}\n`);
}

function shutdown(): void {
  feishu.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 4_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
