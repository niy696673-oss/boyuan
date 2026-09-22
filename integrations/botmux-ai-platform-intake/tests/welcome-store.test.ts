import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JsonWelcomeStore } from '../src/welcome-store.js';

describe('JsonWelcomeStore', () => {
  let tempDir: string;
  let storePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'welcome-store-test-'));
    storePath = join(tempDir, 'welcomed-users.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('initializes empty and tracks new user IDs', () => {
    const store = new JsonWelcomeStore(storePath);
    expect(store.has('ou_12345')).toBe(false);
    store.add('ou_12345');
    expect(store.has('ou_12345')).toBe(true);
    expect(store.has('ou_67890')).toBe(false);
  });

  it('persists welcomed users and reloads them from disk', () => {
    const store1 = new JsonWelcomeStore(storePath);
    store1.add('user-a');
    store1.add('user-b');

    const store2 = new JsonWelcomeStore(storePath);
    expect(store2.has('user-a')).toBe(true);
    expect(store2.has('user-b')).toBe(true);
    expect(store2.has('user-c')).toBe(false);
  });

  it('gracefully handles empty, missing, or corrupted store files', () => {
    writeFileSync(storePath, 'invalid-json-content', 'utf8');
    const store = new JsonWelcomeStore(storePath);
    expect(store.has('user-a')).toBe(false);
    store.add('user-a');
    expect(store.has('user-a')).toBe(true);
  });

  it('ignores empty IDs and deduplicates identical adds', () => {
    const store = new JsonWelcomeStore(storePath);
    store.add('');
    expect(store.has('')).toBe(false);
    store.add('user-1');
    store.add('user-1');
    expect(store.has('user-1')).toBe(true);
  });
});
