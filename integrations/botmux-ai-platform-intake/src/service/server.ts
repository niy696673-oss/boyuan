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
import { IntakeService } from '../intake-service.js';
import { JsonJobStore } from '../job-store.js';
import { HttpPlatformClient } from '../platform-client.js';
import { COMPANY_RESEARCH_FILE_KEY } from '../types.js';
import { createRuntimeConversationAgent } from '../conversation-agent.js';
import { FeishuConversationIngress } from '../feishu-conversation.js';
import { createConversationWorkflows } from '../conversation-workflows.js';

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
const botOpenId = await feishu.botOpenId();
const messenger = new FeishuCardMessenger(feishu);
const store = new JsonJobStore(config.statePath);
const platform = new HttpPlatformClient(config.platformBaseUrl, config.platformIntakeKey, config.timeoutMs);
const service = new IntakeService({
  config,
  platform,
  messenger,
  store,
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
    service.statusCardId(message.messageId, message.researchKey ?? COMPANY_RESEARCH_FILE_KEY),
  rememberStatusCard: (message, cardMessageId) =>
    service.rememberStatusCard({
      chatId: message.chatId,
      messageId: message.messageId,
      fileKey: message.researchKey ?? COMPANY_RESEARCH_FILE_KEY,
      metadata: { ...(message.researchFocus ? { researchFocus: message.researchFocus } : {}) },
      fileName: message.companyName,
      cardMessageId,
      createdAt: message.receivedAt,
      ...(message.senderId ? { senderId: message.senderId } : {}),
    }),
  markStatusCardTerminal: (message) =>
    service.markStatusCardTerminal(message.messageId, message.researchKey ?? COMPANY_RESEARCH_FILE_KEY),
});
const reportIngressError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown_error';
  process.stderr.write(`[ai-platform-intake] Feishu ingress error: ${message.slice(0, 300)}\n`);
};
const conversationIngress = new FeishuConversationIngress({
  botOpenId,
  statePath: `${config.statePath}.conversations.json`,
  agent: createRuntimeConversationAgent(process.env),
  reply: async (message, text, uuid) => {
    await feishu.reply({ messageId: message.messageId, messageType: 'text', content: JSON.stringify({ text }), uuid });
  },
  ...createConversationWorkflows({
    store, service, platform,
    ingestFile: (message) => ingress.resume(message),
    research: (message) => companyIngress.resume(message),
  }),
  onError: reportIngressError,
});
feishu.start(async (data) => {
  const conversation = await conversationIngress.handle(data);
  return conversation.handled ? conversation : ingress.handle(data);
}, reportIngressError);
service.resumePending((job) => !conversationIngress.has(job.messageId));
for (const receipt of service.listOrphanStatusCards()) {
  if (conversationIngress.has(receipt.messageId)) continue;
  if (receipt.fileKey === COMPANY_RESEARCH_FILE_KEY || receipt.fileKey.startsWith(`${COMPANY_RESEARCH_FILE_KEY}:`)) {
    void companyIngress.resume({
      chatId: receipt.chatId,
      messageId: receipt.messageId,
      companyName: receipt.fileName,
      researchKey: receipt.fileKey,
      ...(typeof receipt.metadata?.researchFocus === 'string' ? { researchFocus: receipt.metadata.researchFocus } : {}),
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

conversationIngress.resumePending();

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    respond(response, 200, {
      ok: true,
      pluginId: process.env.BOTMUX_PLUGIN_ID ?? 'ai-platform-intake',
      feishuConnection: feishu.connectionState(),
      conversationMode: 'natural',
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
