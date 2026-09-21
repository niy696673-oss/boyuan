import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BotChannel, UsageRecord } from './types.js';

export function formatDateTime(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export interface UsageStoreOptions {
  filePath: string;
}

export class UsageStore {
  readonly #filePath: string;
  readonly #records = new Map<string, UsageRecord>();

  constructor(options: UsageStoreOptions) {
    this.#filePath = options.filePath;
    this.#load();
  }

  #load(): void {
    if (!existsSync(this.#filePath)) return;
    try {
      const content = readFileSync(this.#filePath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed) as UsageRecord;
          if (record.recordId) {
            this.#records.set(record.recordId, record);
          }
        } catch {
          // ignore corrupted line
        }
      }
    } catch (err) {
      console.warn(`[UsageStore] Warning: failed to load existing records from ${this.#filePath}:`, err);
    }
  }

  saveRecord(record: UsageRecord): void {
    this.#records.set(record.recordId, record);
    this.#appendToFile(record);
  }

  updateRecord(recordId: string, patch: Partial<UsageRecord>): UsageRecord | undefined {
    const existing = this.#records.get(recordId);
    if (!existing) return undefined;
    const updated: UsageRecord = { ...existing, ...patch };
    this.#records.set(recordId, updated);
    this.#appendToFile(updated);
    return updated;
  }

  getRecord(recordId: string): UsageRecord | undefined {
    return this.#records.get(recordId);
  }

  getAllRecords(): UsageRecord[] {
    return Array.from(this.#records.values());
  }

  queryRecords(filter?: {
    startTime?: string;
    endTime?: string;
    channel?: BotChannel;
    isTest?: '是' | '否';
    onlyValid?: boolean;
  }): UsageRecord[] {
    return this.getAllRecords().filter((record) => {
      if (filter?.channel && record.channel !== filter.channel) return false;
      if (filter?.isTest && record.isTest !== filter.isTest) return false;
      if (filter?.onlyValid && !record.isValidRequest) return false;
      if (filter?.startTime && record.startTime < filter.startTime) return false;
      if (filter?.endTime && record.startTime > filter.endTime) return false;
      return true;
    });
  }

  getUnsyncedRecords(limit: number = 100): UsageRecord[] {
    const result: UsageRecord[] = [];
    for (const record of this.#records.values()) {
      if (!record.syncedToFeishu) {
        result.push(record);
        if (result.length >= limit) break;
      }
    }
    return result;
  }

  markSynced(recordIds: string[]): void {
    const set = new Set(recordIds);
    for (const id of set) {
      const record = this.#records.get(id);
      if (record) {
        record.syncedToFeishu = true;
      }
    }
    // Rewrite file periodically or on sync to keep JSONL compact if needed
    this.#compact();
  }

  #appendToFile(record: UsageRecord): void {
    try {
      mkdirSync(dirname(this.#filePath), { recursive: true, mode: 0o700 });
      appendFileSync(this.#filePath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    } catch (err) {
      console.error(`[UsageStore] Failed to append record ${record.recordId} to ${this.#filePath}:`, err);
    }
  }

  #compact(): void {
    try {
      const tempPath = `${this.#filePath}.${process.pid}.tmp`;
      mkdirSync(dirname(this.#filePath), { recursive: true, mode: 0o700 });
      const content = Array.from(this.#records.values())
        .map((r) => JSON.stringify(r))
        .join('\n');
      writeFileSync(tempPath, `${content}\n`, { mode: 0o600 });
      renameSync(tempPath, this.#filePath);
    } catch {
      // Non-fatal if compaction fails
    }
  }
}
