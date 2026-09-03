import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DirectWechatKfFileIngress } from './direct-wechat-kf-intake.js';
import type { WechatKfCallbackEvent } from './wechat-kf-callback.js';
import type { WechatKfClient, WechatKfFileMessage } from './wechat-kf-client.js';

export interface WechatKfCursorStore {
  get(openKfid: string): string | undefined;
  put(openKfid: string, cursor: string): void;
  listOpenKfids(): string[];
}

export interface WechatKfMessagePumpOptions {
  client: Pick<WechatKfClient, 'syncMessages'>;
  ingress: Pick<DirectWechatKfFileIngress, 'handle'>;
  cursorStore: WechatKfCursorStore;
}

export class WechatKfMessagePump {
  readonly #options: WechatKfMessagePumpOptions;
  readonly #active = new Map<string, Promise<void>>();

  constructor(options: WechatKfMessagePumpOptions) {
    this.#options = options;
  }

  async handleEvent(event: WechatKfCallbackEvent): Promise<void> {
    if (!event.openKfid) throw new Error('wechat_kf_callback_open_kfid_missing');
    await this.#enqueue(event.token, event.openKfid);
  }

  async pollKnownAccounts(): Promise<void> {
    await Promise.all(this.#options.cursorStore.listOpenKfids().map((openKfid) => (
      this.#enqueue(undefined, openKfid)
    )));
  }

  async #enqueue(callbackToken: string | undefined, openKfid: string): Promise<void> {
    const previous = this.#active.get(openKfid) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => this.#pull(callbackToken, openKfid));
    this.#active.set(openKfid, current);
    try {
      await current;
    } finally {
      if (this.#active.get(openKfid) === current) this.#active.delete(openKfid);
    }
  }

  async #pull(callbackToken: string | undefined, openKfid: string): Promise<void> {
    let cursor = this.#options.cursorStore.get(openKfid);
    let finalCursor = cursor;
    const messages: WechatKfFileMessage[] = [];
    const recalledMessageIds = new Set<string>();
    for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
      const page = await this.#options.client.syncMessages({
        ...(callbackToken ? { callbackToken } : {}),
        openKfid,
        ...(cursor ? { cursor } : {}),
      });
      messages.push(...page.messages);
      for (const messageId of page.recalledMessageIds) recalledMessageIds.add(messageId);
      if (page.hasMore && page.nextCursor === cursor) throw new Error('wechat_kf_cursor_did_not_advance');
      cursor = page.nextCursor;
      finalCursor = page.nextCursor;
      if (!page.hasMore) break;
      if (pageNumber === 99) throw new Error('wechat_kf_sync_page_limit_exceeded');
    }
    const seenMessageIds = new Set<string>();
    for (const message of messages) {
      if (recalledMessageIds.has(message.messageId) || seenMessageIds.has(message.messageId)) continue;
      seenMessageIds.add(message.messageId);
      await this.#options.ingress.handle(message);
    }
    if (!finalCursor) throw new Error('wechat_kf_cursor_missing');
    this.#options.cursorStore.put(openKfid, finalCursor);
  }
}

export class MemoryWechatKfCursorStore implements WechatKfCursorStore {
  readonly #cursors = new Map<string, string>();

  get(openKfid: string): string | undefined {
    return this.#cursors.get(openKfid);
  }

  put(openKfid: string, cursor: string): void {
    this.#cursors.set(openKfid, cursor);
  }

  listOpenKfids(): string[] {
    return [...this.#cursors.keys()].sort();
  }
}

export class JsonWechatKfCursorStore implements WechatKfCursorStore {
  readonly #path: string;
  readonly #cursors: Record<string, string>;

  constructor(path: string) {
    this.#path = path;
    this.#cursors = this.#load();
  }

  get(openKfid: string): string | undefined {
    return this.#cursors[validKey(openKfid, 256, 'wechat_kf_open_kfid_invalid')];
  }

  put(openKfid: string, cursor: string): void {
    this.#cursors[validKey(openKfid, 256, 'wechat_kf_open_kfid_invalid')] = validKey(
      cursor,
      64,
      'wechat_kf_cursor_invalid',
    );
    this.#save();
  }

  listOpenKfids(): string[] {
    return Object.keys(this.#cursors).sort();
  }

  #load(): Record<string, string> {
    if (!existsSync(this.#path)) return {};
    if (lstatSync(this.#path).isSymbolicLink()) throw new Error('wechat_kf_cursor_state_symlink_rejected');
    try {
      const parsed = JSON.parse(readFileSync(this.#path, 'utf8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      const source = parsed as Record<string, unknown>;
      if (source.schemaVersion !== 1 || !source.cursors || typeof source.cursors !== 'object' || Array.isArray(source.cursors)) {
        throw new Error();
      }
      return Object.fromEntries(Object.entries(source.cursors as Record<string, unknown>).map(([key, value]) => [
        validKey(key, 256, 'wechat_kf_cursor_state_invalid'),
        validKey(value, 64, 'wechat_kf_cursor_state_invalid'),
      ]));
    } catch {
      throw new Error('wechat_kf_cursor_state_invalid');
    }
  }

  #save(): void {
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 1, cursors: this.#cursors }, null, 2)}\n`, {
      mode: 0o600,
    });
    renameSync(temporary, this.#path);
  }
}

function validKey(value: unknown, maxLength: number, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\r\n\0]/u.test(normalized)) throw new Error(code);
  return normalized;
}
