import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IntakeJob, JobStore } from './types.js';

interface StoreData { schemaVersion: 1; jobs: Record<string, IntakeJob> }
type StoredIntakeJob = Omit<IntakeJob, 'completionCardSent'> & {
  completionCardSent?: boolean;
  finalCardSent?: boolean;
};

export class JsonJobStore implements JobStore {
  readonly #path: string;
  #data: StoreData;

  constructor(path: string) {
    this.#path = path;
    this.#data = this.#load();
  }

  get(key: string): IntakeJob | undefined {
    const job = this.#data.jobs[key];
    return job ? structuredClone(job) : undefined;
  }

  put(job: IntakeJob): void {
    this.#data.jobs[job.key] = structuredClone(job);
    this.#save();
  }

  listPending(): IntakeJob[] {
    return Object.values(this.#data.jobs).filter((job) => !job.completionCardSent).map((job) => structuredClone(job));
  }

  #load(): StoreData {
    if (!existsSync(this.#path)) return { schemaVersion: 1, jobs: {} };
    try {
      const parsed = JSON.parse(readFileSync(this.#path, 'utf8')) as {
        schemaVersion?: number;
        jobs?: Record<string, StoredIntakeJob>;
      };
      if (parsed.schemaVersion !== 1 || !parsed.jobs || typeof parsed.jobs !== 'object') throw new Error();
      return {
        schemaVersion: 1,
        jobs: Object.fromEntries(Object.entries(parsed.jobs).map(([key, job]) => {
          const { finalCardSent, ...current } = job;
          return [key, {
            ...current,
            completionCardSent: current.completionCardSent ?? finalCardSent ?? false,
          }];
        })) as Record<string, IntakeJob>,
      };
    } catch {
      throw new Error('intake_state_invalid');
    }
  }

  #save(): void {
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.#data, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.#path);
  }
}

export class MemoryJobStore implements JobStore {
  readonly jobs = new Map<string, IntakeJob>();
  get(key: string): IntakeJob | undefined { return this.jobs.get(key); }
  put(job: IntakeJob): void { this.jobs.set(job.key, structuredClone(job)); }
  listPending(): IntakeJob[] { return [...this.jobs.values()].filter((job) => !job.completionCardSent); }
}
