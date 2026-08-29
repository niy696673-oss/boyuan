import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JsonJobStore } from '../src/job-store.js';
import { tempDir } from './helpers.js';

describe('JSON intake job store', () => {
  it('migrates the legacy final-card flag without resending a completed card', () => {
    const temp = tempDir();
    const statePath = `${temp.path}/state.json`;
    writeFileSync(statePath, JSON.stringify({
      schemaVersion: 1,
      jobs: {
        job: {
          key: 'job', chatId: 'chat', sessionId: 'session', messageId: 'message',
          fileKey: 'file', fileName: 'bp.pdf', conversationId: 'conversation',
          platformAcceptedAt: '2026-08-25T00:00:00.000Z', completionCardMs: 1200,
          finalCardSent: true, createdAt: '2026-08-25T00:00:00.000Z',
        },
      },
    }));

    try {
      const store = new JsonJobStore(statePath);
      expect(store.get('job')).toMatchObject({ completionCardSent: true });
      expect(store.listPending()).toEqual([]);
      store.put(store.get('job')!);
      expect(readFileSync(statePath, 'utf8')).not.toContain('finalCardSent');
    } finally {
      temp.cleanup();
    }
  });

  it('migrates a persisted company job from fileName to the discriminated companyName field', () => {
    const temp = tempDir();
    const statePath = `${temp.path}/state.json`;
    writeFileSync(statePath, JSON.stringify({
      schemaVersion: 1,
      jobs: {
        company: {
          key: 'company', kind: 'company_research', chatId: 'oc_chat', sessionId: 'session',
          messageId: 'om_company', fileKey: 'company-research', fileName: '白杨智能',
          conversationId: 'conversation-company', platformAcceptedAt: '2026-08-29T00:00:00.000Z',
          completionCardMs: 0, completionCardSent: false, createdAt: '2026-08-29T00:00:00.000Z',
        },
      },
    }));

    try {
      const store = new JsonJobStore(statePath);
      expect(store.get('company')).toMatchObject({
        kind: 'company_research',
        companyName: '白杨智能',
        completionCardSent: false,
      });
      store.put(store.get('company')!);
      const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as {
        jobs: { company: Record<string, unknown> };
      };
      expect(persisted.jobs.company.companyName).toBe('白杨智能');
      expect(persisted.jobs.company).not.toHaveProperty('fileName');
    } finally {
      temp.cleanup();
    }
  });

  it('persists the processing-card receipt before a complete intake job exists', () => {
    const temp = tempDir();
    const statePath = `${temp.path}/state.json`;
    try {
      const store = new JsonJobStore(statePath);
      store.putStatusCard({
        key: 'receipt',
        chatId: 'oc_chat',
        messageId: 'om_message',
        fileKey: 'file',
        fileName: 'bp.pdf',
        cardMessageId: 'om_status_card',
        createdAt: '2026-08-26T00:00:00.000Z',
      });

      expect(new JsonJobStore(statePath).getStatusCard('receipt')).toMatchObject({
        cardMessageId: 'om_status_card',
      });
      store.deleteStatusCard('receipt');
      expect(new JsonJobStore(statePath).listStatusCards()).toEqual([]);
    } finally {
      temp.cleanup();
    }
  });

  it('rejects a malformed processing-card receipt index', () => {
    const temp = tempDir();
    const statePath = `${temp.path}/state.json`;
    writeFileSync(statePath, JSON.stringify({
      schemaVersion: 1,
      jobs: {},
      statusCards: [],
    }));

    try {
      expect(() => new JsonJobStore(statePath)).toThrow('intake_state_invalid');
    } finally {
      temp.cleanup();
    }
  });
});
