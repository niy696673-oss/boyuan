import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Messenger, ProcessRunner, SendCardInput } from './types.js';
import { runProcess } from './process-runner.js';

export class BotmuxClient implements Messenger {
  readonly #executable: string;
  readonly #outboxDir: string;
  readonly #run: ProcessRunner;

  constructor(executable: string, outboxDir: string, runner: ProcessRunner = runProcess) {
    this.#executable = executable;
    this.#outboxDir = outboxDir;
    this.#run = runner;
  }

  async sendCard(input: SendCardInput): Promise<void> {
    mkdirSync(this.#outboxDir, { recursive: true, mode: 0o700 });
    const cardPath = join(this.#outboxDir, `${randomUUID()}.json`);
    try {
      writeFileSync(cardPath, `${JSON.stringify(input.card)}\n`, { mode: 0o600 });
      const result = await this.#run(this.#executable, [
        'send', '--session-id', input.sessionId, '--chat-id', input.chatId,
        '--quote', input.messageId, '--card-file', cardPath, '--no-mention',
        '--response-kind', input.responseKind,
      ], { timeoutMs: Math.min(input.timeoutMs ?? 60_000, 60_000) });
      if (result.code !== 0) throw new Error('botmux_send_card_failed');
    } finally {
      rmSync(cardPath, { force: true });
    }
  }
}
