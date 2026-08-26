import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IntakeJob, JobStore, StatusCardReceipt } from './types.js';

interface StoreData {
  schemaVersion: 1;
  jobs: Record<string, IntakeJob>;
  statusCards: Record<string, StatusCardReceipt>;
}
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

  getStatusCard(key: string): StatusCardReceipt | undefined {
    const receipt = this.#data.statusCards[key];
    return receipt ? structuredClone(receipt) : undefined;
  }

  putStatusCard(receipt: StatusCardReceipt): void {
    this.#data.statusCards[receipt.key] = structuredClone(receipt);
    this.#save();
  }

  listPending(): IntakeJob[] {
    return Object.values(this.#data.jobs).filter((job) => !job.completionCardSent).map((job) => structuredClone(job));
  }

  #load(): StoreData {
    if (!existsSync(this.#path)) {
      return { schemaVersion: 1, jobs: {}, statusCards: {} };
    }
    try {
      const parsed = JSON.parse(readFileSync(this.#path, 'utf8')) as {
        schemaVersion?: number;
        jobs?: Record<string, StoredIntakeJob>;
        statusCards?: Record<string, StatusCardReceipt>;
      };
      if (
        parsed.schemaVersion !== 1
        || !parsed.jobs
        || typeof parsed.jobs !== 'object'
        || Array.isArray(parsed.jobs)
        || (parsed.statusCards !== undefined && (
          !parsed.statusCards
          || typeof parsed.statusCards !== 'object'
          || Array.isArray(parsed.statusCards)
        ))
      ) throw new Error();
      return {
        schemaVersion: 1,
        statusCards: parsed.statusCards ?? {},
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
  readonly statusCards = new Map<string, StatusCardReceipt>();
  get(key: string): IntakeJob | undefined { return this.jobs.get(key); }
  put(job: IntakeJob): void { this.jobs.set(job.key, structuredClone(job)); }
  getStatusCard(key: string): StatusCardReceipt | undefined {
    const receipt = this.statusCards.get(key);
    return receipt ? structuredClone(receipt) : undefined;
  }
  putStatusCard(receipt: StatusCardReceipt): void {
    this.statusCards.set(receipt.key, structuredClone(receipt));
  }
  listPending(): IntakeJob[] { return [...this.jobs.values()].filter((job) => !job.completionCardSent); }
}
