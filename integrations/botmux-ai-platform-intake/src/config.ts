import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { IntakeConfig } from './types.js';

export function parseIntakeConfig(value: Record<string, unknown>, configDirectory: string): IntakeConfig {
  const path = (name: string, fallback: string) => {
    const raw = stringValue(value[name]) ?? fallback;
    const resolved = resolve(configDirectory, raw);
    if (!isAbsolute(resolved)) throw new Error(`invalid_${name}`);
    return resolved;
  };
  const attachmentRoot = path('attachmentRoot', './attachments');
  const statePath = path('statePath', './state/jobs.json');
  const publicWorkbenchUrl = httpUrl(value.publicWorkbenchUrl, 'publicWorkbenchUrl');
  const config: IntakeConfig = {
    schemaVersion: 1,
    larkAppId: larkAppId(value.larkAppId),
    botmuxConfigPath: path('botmuxConfigPath', resolve(homedir(), '.botmux', 'bots.json')),
    platformBaseUrl: httpUrl(value.platformBaseUrl, 'platformBaseUrl'),
    platformIntakeKey: requiredSecret(value.platformIntakeKey, 'platformIntakeKey'),
    publicWorkbenchUrl,
    publicProductUrl: httpUrl(value.publicProductUrl ?? new URL(publicWorkbenchUrl).origin, 'publicProductUrl'),
    servicePort: integer(value.servicePort, 'servicePort', 9470, 1, 65_535),
    attachmentRoot,
    statePath,
    retryDelayMs: integer(value.retryDelayMs ?? value.pollIntervalMs, 'retryDelayMs', 1_500, 250, 60_000),
    timeoutMs: integer(value.timeoutMs, 'timeoutMs', 600_000, 10_000, 3_600_000),
  };
  return config;
}

function larkAppId(value: unknown): string {
  const appId = stringValue(value);
  if (!appId || !/^cli_[A-Za-z0-9_-]{4,200}$/u.test(appId)) throw new Error('invalid_larkAppId');
  return appId;
}

export function prepareRuntimeDirectories(config: IntakeConfig): void {
  for (const directory of [config.attachmentRoot, dirname(config.statePath)]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe_runtime_directory');
    realpathSync(directory);
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredSecret(value: unknown, name: string): string {
  const secret = stringValue(value);
  if (!secret || secret.length < 16 || secret.length > 1_024) throw new Error(`invalid_${name}`);
  return secret;
}

function httpUrl(value: unknown, name: string): string {
  const raw = stringValue(value);
  if (!raw) throw new Error(`missing_${name}`);
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`invalid_${name}`);
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`insecure_${name}`);
  }
  if (url.username || url.password) throw new Error(`invalid_${name}`);
  return url.toString().replace(/\/$/u, '');
}

function integer(value: unknown, name: string, fallback: number, min: number, max: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`invalid_${name}`);
  return parsed;
}
