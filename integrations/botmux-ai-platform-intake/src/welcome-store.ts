import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface WelcomeStore {
  has(id: string): boolean;
  add(id: string): void;
}

export class JsonWelcomeStore implements WelcomeStore {
  readonly #path: string;
  readonly #welcomed = new Set<string>();

  constructor(path: string) {
    this.#path = path;
    if (existsSync(path)) {
      try {
        const list = JSON.parse(readFileSync(path, 'utf8'));
        if (Array.isArray(list)) {
          for (const item of list) {
            if (typeof item === 'string' && item) this.#welcomed.add(item);
          }
        }
      } catch {
        // start with an empty set if unreadable
      }
    }
  }

  has(id: string): boolean {
    return this.#welcomed.has(id);
  }

  add(id: string): void {
    if (!id || this.#welcomed.has(id)) return;
    this.#welcomed.add(id);
    this.#persist();
  }

  #persist(): void {
    const directory = dirname(this.#path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.${basename(this.#path)}.${randomUUID()}.tmp`);
    writeFileSync(temporary, JSON.stringify([...this.#welcomed], null, 2), { mode: 0o600 });
    renameSync(temporary, this.#path);
  }
}
