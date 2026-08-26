import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseIntakeConfig } from '../config.js';

interface PluginCommandContext {
  args: string[];
  api: {
    config: {
      path: string;
      get(): unknown;
      replace(value: Record<string, unknown>): void;
    };
  };
}

function currentConfig(ctx: PluginCommandContext) {
  const raw = ctx.api.config.get();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('intake_config_missing');
  return parseIntakeConfig(raw as Record<string, unknown>, dirname(ctx.api.config.path));
}

function readConfigFile(path: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('config_must_be_an_object');
  return parsed as Record<string, unknown>;
}

export default {
  'ai-platform-intake:configure': {
    description: 'Validate and save a Boyuan AI platform intake configuration file.',
    run(ctx: PluginCommandContext) {
      if (ctx.args.length !== 1) throw new Error('usage: botmux ai-platform-intake:configure <config.json>');
      const config = parseIntakeConfig(readConfigFile(ctx.args[0]!), dirname(ctx.api.config.path));
      ctx.api.config.replace(config as unknown as Record<string, unknown>);
      return JSON.stringify({ ok: true, schemaVersion: 1, servicePort: config.servicePort });
    },
  },
  'ai-platform-intake:config-check': {
    description: 'Validate the saved Boyuan AI platform intake configuration.',
    run(ctx: PluginCommandContext) {
      const config = currentConfig(ctx);
      return JSON.stringify({
        ok: true,
        schemaVersion: config.schemaVersion,
        servicePort: config.servicePort,
        platformOrigin: new URL(config.platformBaseUrl).origin,
        workbenchOrigin: new URL(config.publicWorkbenchUrl).origin,
      });
    },
  },
};
