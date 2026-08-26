import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { parseIntakeConfig, prepareRuntimeDirectories } from '../config.js';
import { DirectFeishuFileIngress, FeishuCardMessenger } from '../direct-feishu-intake.js';
import { LarkFeishuTransport, loadBotmuxLarkCredentials } from '../feishu-runtime.js';
import { validateAttachmentPath } from '../file-security.js';
import { IntakeService } from '../intake-service.js';
import { JsonJobStore } from '../job-store.js';
import { HttpPlatformClient } from '../platform-client.js';
import type { IntakeAttachment, IntakeTurn } from '../types.js';

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
});
const ingress = new DirectFeishuFileIngress({
  materialize: (message) => feishu.materialize(message),
  ingestTurn: (turn) => service.ingestTurn(turn),
  messenger,
  hasJob: (message) => service.hasJob(message.messageId, message.fileKey),
});
feishu.start((data) => ingress.handle(data), (error) => {
  const message = error instanceof Error ? error.message : 'unknown_error';
  process.stderr.write(`[ai-platform-intake] Feishu ingress error: ${message.slice(0, 300)}\n`);
});
service.resumePending();

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    respond(response, 200, {
      ok: true,
      pluginId: process.env.BOTMUX_PLUGIN_ID ?? 'ai-platform-intake',
      feishuConnection: feishu.connectionState(),
    });
    return;
  }
  if (request.method !== 'POST' || request.url !== '/v1/intake') {
    respond(response, 404, { ok: false, error: 'not_found' });
    return;
  }
  if (!authorized(request.headers.authorization, config.serviceKey)) {
    respond(response, 401, { ok: false, error: 'unauthorized' });
    return;
  }
  try {
    const turn = parseTurn(await readJson(request));
    respond(response, 200, { ok: true, outcomes: await service.ingestTurn(turn) });
  } catch (error) {
    respond(response, 400, { ok: false, error: (error instanceof Error ? error.message : 'request_failed').slice(0, 160) });
  }
});
server.listen(port, host);

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 128 * 1024) throw new Error('payload_too_large');
    chunks.push(buffer);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_body');
  return parsed as Record<string, unknown>;
}

function parseTurn(value: Record<string, unknown>): IntakeTurn {
  const chatId = requiredText(value.chatId, 'chat_id');
  const sessionId = requiredText(value.sessionId, 'session_id');
  const messageId = requiredText(value.messageId, 'message_id');
  if (!Array.isArray(value.attachments) || value.attachments.length === 0 || value.attachments.length > 20) {
    throw new Error('invalid_attachments');
  }
  const attachments = value.attachments.map((item): IntakeAttachment => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('invalid_attachment');
    const source = item as Record<string, unknown>;
    return validateAttachmentPath({
      fileKey: requiredText(source.fileKey, 'file_key'),
      name: requiredText(source.name, 'file_name'),
      path: requiredText(source.path, 'file_path'),
    }, config.attachmentRoot);
  });
  return {
    chatId, sessionId, messageId,
    ...(typeof value.receivedAt === 'string' && validTimestamp(value.receivedAt) ? { receivedAt: value.receivedAt } : {}),
    ...(typeof value.senderId === 'string' && value.senderId.trim() ? { senderId: value.senderId.trim() } : {}),
    attachments,
  };
}

function validTimestamp(value: string): boolean {
  return value.length <= 64 && Number.isFinite(Date.parse(value));
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1_024) throw new Error(`invalid_${name}`);
  return value.trim();
}

function authorized(value: string | undefined, key: string): boolean {
  if (!value?.startsWith('Bearer ')) return false;
  const received = Buffer.from(value.slice(7));
  const expected = Buffer.from(key);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

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
