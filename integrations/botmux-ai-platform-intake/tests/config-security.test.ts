import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseIntakeConfig,
  parseWechatKfIntakeConfig,
  parseWeComIntakeConfig,
} from '../src/config.js';
import { validateAttachmentPath } from '../src/file-security.js';
import { loadBotmuxLarkCredentials } from '../src/feishu-runtime.js';
import { tempDir, testConfig } from './helpers.js';

describe('configuration and file safety', () => {
  it('requires the dedicated Feishu bot to be apiOnly before the plugin owns its long connection', () => {
    const temp = tempDir();
    const config = testConfig(temp.path);
    try {
      writeFileSync(config.botmuxConfigPath, JSON.stringify([{
        larkAppId: config.larkAppId,
        larkAppSecret: 'test-app-secret',
        apiOnly: false,
      }]));
      expect(() => loadBotmuxLarkCredentials(config)).toThrow('lark_bot_must_be_api_only');
      writeFileSync(config.botmuxConfigPath, JSON.stringify([{
        larkAppId: config.larkAppId,
        larkAppSecret: 'test-app-secret',
        apiOnly: true,
      }]));
      expect(loadBotmuxLarkCredentials(config)).toEqual({
        appId: config.larkAppId,
        appSecret: 'test-app-secret',
        brand: 'feishu',
      });
    } finally { temp.cleanup(); }
  });

  it('requires HTTPS for non-loopback platform and workbench URLs', () => {
    const temp = tempDir();
    try {
      const base = testConfig(temp.path);
      expect(() => parseIntakeConfig({ ...base, platformBaseUrl: 'http://platform.example.com' }, temp.path))
        .toThrow('insecure_platformBaseUrl');
      expect(() => parseIntakeConfig({ ...base, publicWorkbenchUrl: 'http://demo.example.com' }, temp.path))
        .toThrow('insecure_publicWorkbenchUrl');
      expect(() => parseIntakeConfig({ ...base, publicProductUrl: 'http://demo.example.com' }, temp.path))
        .toThrow('insecure_publicProductUrl');
    } finally { temp.cleanup(); }
  });

  it('derives the product root from the public workbench origin for existing configurations', () => {
    const temp = tempDir();
    try {
      const value = { ...testConfig(temp.path) } as Record<string, unknown>;
      Reflect.deleteProperty(value, 'publicProductUrl');
      expect(parseIntakeConfig(value, temp.path).publicProductUrl).toBe('https://demo.example.com');
    } finally { temp.cleanup(); }
  });

  it('uses an independent WeCom port and only permits secure custom WebSocket URLs', () => {
    const temp = tempDir();
    try {
      const base = testConfig(temp.path);
      expect(parseWeComIntakeConfig({ ...base }, temp.path)).toMatchObject({ servicePort: 19470 });
      const withoutPort = { ...base } as Record<string, unknown>;
      Reflect.deleteProperty(withoutPort, 'servicePort');
      expect(parseWeComIntakeConfig(withoutPort, temp.path).servicePort).toBe(9480);
      expect(() => parseWeComIntakeConfig({ ...base, wsUrl: 'ws://localhost:9000' }, temp.path))
        .toThrow('invalid_wsUrl');
      expect(parseWeComIntakeConfig({ ...base, wsUrl: 'wss://wecom.example.com/' }, temp.path).wsUrl)
        .toBe('wss://wecom.example.com');
    } finally { temp.cleanup(); }
  });

  it('uses an independent WeChat Customer Service port and cursor state file', () => {
    const temp = tempDir();
    try {
      const value = { ...testConfig(temp.path) } as Record<string, unknown>;
      Reflect.deleteProperty(value, 'servicePort');
      const config = parseWechatKfIntakeConfig(value, temp.path);
      expect(config.servicePort).toBe(9481);
      expect(config.cursorStatePath).toBe(join(temp.path, 'state', 'wechat-kf-cursors.json'));
    } finally { temp.cleanup(); }
  });

  it('rejects files reached through a symlinked attachment path', () => {
    const temp = tempDir();
    const root = join(temp.path, 'attachments');
    const real = join(root, 'real');
    const linked = join(root, 'linked');
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, 'material.pdf'), 'bytes');
    symlinkSync(real, linked);
    try {
      expect(() => validateAttachmentPath({
        fileKey: 'key', name: 'material.pdf', path: join(linked, 'material.pdf'),
      }, root)).toThrow('attachment_symlink_rejected');
    } finally { temp.cleanup(); }
  });
});
