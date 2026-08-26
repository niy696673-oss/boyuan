import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { ProcessRunner } from './types.js';

const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

export function executableFallbackDirectories(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === 'darwin') return ['/opt/homebrew/bin', '/usr/local/bin'];
  return platform === 'linux' ? ['/usr/local/bin', '/usr/bin'] : [];
}

export function resolveExecutablePath(
  executable: string,
  env: NodeJS.ProcessEnv = process.env,
  fallbackDirectories = executableFallbackDirectories(),
): string {
  if (executable.includes('/') || executable.includes('\\')) return executable;
  const directories = [...(env.PATH?.split(delimiter) ?? []), ...fallbackDirectories];
  for (const directory of new Set(directories.filter(Boolean))) {
    const candidate = join(directory, executable);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through the deterministic search path.
    }
  }
  return executable;
}

export const runProcess: ProcessRunner = (executable, args, options = {}) =>
  new Promise((resolve, reject) => {
    const env = options.env ?? process.env;
    const child = spawn(resolveExecutablePath(executable, env), [...args], {
      env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, options.timeoutMs)
      : undefined;
    timer?.unref();
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_CAPTURE_BYTES) stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= MAX_CAPTURE_BYTES) stderr.push(chunk);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) reject(new Error('process_timeout'));
      else resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    child.stdin.end(options.input);
  });
