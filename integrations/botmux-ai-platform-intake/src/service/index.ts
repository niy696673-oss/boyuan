function validPort(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : undefined;
}

export default function serviceDefinition(api: { config?: { path?: string; get?(key?: string): unknown } }) {
  const configPath = api.config?.path;
  const port = validPort(process.env.BOTMUX_PLUGIN_AI_PLATFORM_INTAKE_PORT)
    ?? validPort(api.config?.get?.('servicePort'))
    ?? 9470;
  return {
    mode: 'auto',
    port,
    pm2: {
      script: './service/server.js',
      env: {
        PORT: String(port),
        HOST: '127.0.0.1',
        ...(configPath ? { BOTMUX_AI_PLATFORM_INTAKE_CONFIG_PATH: configPath } : {}),
      },
      autorestart: true,
      killTimeoutMs: 5_000,
    },
    urls({ host }: { host: string }) {
      return { openUrl: `http://${host}:${port}/`, healthUrl: `http://${host}:${port}/health` };
    },
  };
}
