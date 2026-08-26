import { basename, dirname } from 'node:path';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IntakeConfig, IntakeOutcome, IntakeTurn, ProcessRunner } from './types.js';
import { runProcess } from './process-runner.js';
import { validateAttachmentPath } from './file-security.js';

const MESSAGE_ID_RE = /^om_[A-Za-z0-9_-]{1,500}$/;
const MAX_RESPONSE_BYTES = 64 * 1024;

interface QuotedResource { type: 'image' | 'file'; key: string; name: string }
interface QuotedAttachment { type: 'image' | 'file'; path: string; name: string }
interface QuotedMessage {
  messageId: string;
  chatId?: string;
  senderId?: string;
  resources: QuotedResource[];
  attachments: QuotedAttachment[];
  needLogin: boolean;
}

interface MarkerModule {
  resolveSessionContext(
    dataDir: string,
    sessionId: string | undefined,
    startPid?: number,
    originChannelId?: string,
  ): { sessionId: string; turnId?: string } | null;
}

export interface HostAdapterOptions {
  config: IntakeConfig;
  env?: NodeJS.ProcessEnv;
  runner?: ProcessRunner;
  resolveTurn?: (env: NodeJS.ProcessEnv) => Promise<{ sessionId: string; turnId: string }>;
  fetcher?: typeof fetch;
}

export async function resolveCurrentBotmuxTurn(env: NodeJS.ProcessEnv): Promise<{ sessionId: string; turnId: string }> {
  const dataDir = requiredEnv(env, 'SESSION_DATA_DIR');
  const envSessionId = requiredEnv(env, 'BOTMUX_SESSION_ID');
  const entry = process.argv[1];
  if (!entry) throw new Error('botmux_current_turn_resolver_unavailable');
  let resolved: string;
  try { resolved = realpathSync(entry); } catch { throw new Error('botmux_current_turn_resolver_unavailable'); }
  if (basename(resolved) !== 'cli.js') throw new Error('botmux_current_turn_resolver_unavailable');
  let module: MarkerModule;
  try { module = await import(pathToFileURL(join(dirname(resolved), 'core', 'session-marker.js')).href) as MarkerModule; }
  catch { throw new Error('botmux_current_turn_resolver_unavailable'); }
  let current: ReturnType<MarkerModule['resolveSessionContext']>;
  try { current = module.resolveSessionContext(dataDir, envSessionId, process.ppid, env.BOTMUX_ORIGIN_CHANNEL_ID); }
  catch { throw new Error('botmux_current_turn_unverified'); }
  if (!current?.turnId || current.sessionId !== envSessionId || !MESSAGE_ID_RE.test(current.turnId)) {
    throw new Error('botmux_current_turn_unverified');
  }
  return { sessionId: current.sessionId, turnId: current.turnId };
}

export async function ingestCurrentFeishuFiles(options: HostAdapterOptions): Promise<{
  ok: true;
  attachmentCount: number;
  outcomes: IntakeOutcome[];
}> {
  const receivedAt = new Date().toISOString();
  const env = options.env ?? process.env;
  const sessionId = requiredEnv(env, 'BOTMUX_SESSION_ID');
  const chatId = requiredEnv(env, 'BOTMUX_CHAT_ID');
  const current = await (options.resolveTurn ?? resolveCurrentBotmuxTurn)(env);
  if (current.sessionId !== sessionId || !MESSAGE_ID_RE.test(current.turnId)) throw new Error('botmux_current_turn_unverified');
  const result = await (options.runner ?? runProcess)(options.config.botmuxExecutable, ['quoted', current.turnId], {
    env, timeoutMs: 60_000,
  });
  if (result.code !== 0) throw new Error('botmux_quoted_failed');
  const quoted = parseQuotedMessage(result.stdout);
  if (quoted.messageId !== current.turnId) throw new Error('botmux_quoted_message_mismatch');
  if (quoted.chatId && quoted.chatId !== chatId) throw new Error('botmux_quoted_chat_mismatch');
  if (quoted.needLogin && quoted.attachments.length === 0) throw new Error('botmux_attachment_login_required');
  const attachments = pairFiles(quoted).map(({ resource, attachment }) => validateAttachmentPath({
    fileKey: resource.key, name: resource.name, path: attachment.path,
  }, options.config.attachmentRoot));
  const turn: IntakeTurn = {
    chatId, sessionId, messageId: quoted.messageId, receivedAt,
    ...(quoted.senderId ? { senderId: quoted.senderId } : {}), attachments,
  };
  const response = await (options.fetcher ?? fetch)(`http://127.0.0.1:${options.config.servicePort}/v1/intake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${options.config.serviceKey}` },
    body: JSON.stringify(turn),
    signal: AbortSignal.timeout(options.config.timeoutMs),
  });
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) throw new Error('loopback_response_too_large');
  if (!response.ok) throw new Error(`loopback_http_${response.status}`);
  const parsed = JSON.parse(body) as { ok?: unknown; outcomes?: unknown };
  if (parsed.ok !== true || !Array.isArray(parsed.outcomes)) throw new Error('loopback_invalid_response');
  return { ok: true, attachmentCount: attachments.length, outcomes: parsed.outcomes as IntakeOutcome[] };
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value || value.length > 1_024) throw new Error(`missing_${key.toLowerCase()}`);
  return value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function array(value: unknown, name: string): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error(`botmux_quoted_invalid_${name}`);
  }
  return value as Record<string, unknown>[];
}

function parseQuotedMessage(stdout: string): QuotedMessage {
  let parsed: unknown;
  try { parsed = JSON.parse(stdout); } catch { throw new Error('botmux_quoted_invalid_json'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('botmux_quoted_invalid_response');
  const source = parsed as Record<string, unknown>;
  const messageId = stringValue(source.messageId);
  if (!messageId) throw new Error('botmux_quoted_missing_message_id');
  const resources = array(source.resources, 'resources').map((item): QuotedResource => {
    const type = item.type;
    const key = stringValue(item.key);
    const name = stringValue(item.name);
    if ((type !== 'file' && type !== 'image') || !key || !name) throw new Error('botmux_quoted_invalid_resources');
    return { type, key, name };
  });
  const attachments = array(source.attachments, 'attachments').map((item): QuotedAttachment => {
    const type = item.type;
    const path = stringValue(item.path);
    const name = stringValue(item.name);
    if ((type !== 'file' && type !== 'image') || !path || !name) throw new Error('botmux_quoted_invalid_attachments');
    return { type, path, name };
  });
  const chatId = stringValue(source.chatId);
  const senderId = stringValue(source.senderId);
  return {
    messageId,
    ...(chatId ? { chatId } : {}),
    ...(senderId ? { senderId } : {}),
    resources, attachments, needLogin: source.needLogin === true,
  };
}

function pairFiles(message: QuotedMessage): Array<{ resource: QuotedResource; attachment: QuotedAttachment }> {
  const resources = message.resources.filter((resource) => resource.type === 'file');
  if (resources.length === 0) throw new Error('botmux_quoted_has_no_files');
  const used = new Set<number>();
  return resources.map((resource) => {
    const matches = message.attachments.map((attachment, index) => ({ attachment, index })).filter(({ attachment, index }) =>
      !used.has(index) && attachment.type === 'file' && attachment.name === resource.name,
    );
    if (matches.length !== 1) throw new Error('botmux_attachment_mapping_failed');
    const match = matches[0]!;
    used.add(match.index);
    return { resource, attachment: match.attachment };
  });
}
