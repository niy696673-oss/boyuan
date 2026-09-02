import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  JsonWechatKfCursorStore,
  MemoryWechatKfCursorStore,
  WechatKfMessagePump,
} from '../src/wechat-kf-pump.js';
import { tempDir } from './helpers.js';

describe('WechatKfMessagePump', () => {
  it('pulls every page from the persisted cursor and advances it only after ingestion', async () => {
    const order: string[] = [];
    const syncMessages = vi.fn(async (input: { cursor?: string }) => {
      order.push(`sync:${input.cursor ?? 'empty'}`);
      if (!input.cursor) {
        return {
          nextCursor: 'cursor-1',
          hasMore: true,
          messages: [{
            messageId: 'message-1',
            openKfid: 'wkAJ2GCAAAexample',
            externalUserId: 'wmAJ2GCAAAcustomer',
            receivedAt: '2026-09-03T00:00:00.000Z',
            mediaId: 'media-1',
          }],
        };
      }
      return { nextCursor: 'cursor-2', hasMore: false, messages: [] };
    });
    const handle = vi.fn(async (message: { messageId: string }) => {
      order.push(`ingest:${message.messageId}`);
    });
    const cursorStore = new MemoryWechatKfCursorStore();
    const pump = new WechatKfMessagePump({
      client: { syncMessages },
      ingress: { handle },
      cursorStore,
    });

    await pump.handleEvent({ token: 'callback-token', openKfid: 'wkAJ2GCAAAexample' });

    expect(order).toEqual(['sync:empty', 'ingest:message-1', 'sync:cursor-1']);
    expect(cursorStore.get('wkAJ2GCAAAexample')).toBe('cursor-2');
    expect(syncMessages).toHaveBeenNthCalledWith(1, {
      callbackToken: 'callback-token',
      openKfid: 'wkAJ2GCAAAexample',
      cursor: undefined,
    });
  });

  it('serializes duplicate callbacks for the same customer-service account', async () => {
    let active = 0;
    let maximumActive = 0;
    const syncMessages = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { nextCursor: 'cursor-final', hasMore: false, messages: [] };
    });
    const pump = new WechatKfMessagePump({
      client: { syncMessages },
      ingress: { handle: vi.fn(async () => undefined) },
      cursorStore: new MemoryWechatKfCursorStore(),
    });

    await Promise.all([
      pump.handleEvent({ token: 'callback-token-1', openKfid: 'wkAJ2GCAAAexample' }),
      pump.handleEvent({ token: 'callback-token-2', openKfid: 'wkAJ2GCAAAexample' }),
    ]);

    expect(maximumActive).toBe(1);
  });

  it('starts every file in one sync page without waiting for the previous analysis to finish', async () => {
    let releaseFirst!: () => void;
    const firstFinished = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const handle = vi.fn(async (message: { messageId: string }) => {
      if (message.messageId === 'message-1') await firstFinished;
    });
    const pump = new WechatKfMessagePump({
      client: {
        syncMessages: vi.fn(async () => ({
          nextCursor: 'cursor-final',
          hasMore: false,
          messages: [
            {
              messageId: 'message-1', openKfid: 'wk-account', externalUserId: 'user-1',
              receivedAt: '2026-09-03T00:00:00.000Z', mediaId: 'media-1',
            },
            {
              messageId: 'message-2', openKfid: 'wk-account', externalUserId: 'user-2',
              receivedAt: '2026-09-03T00:00:01.000Z', mediaId: 'media-2',
            },
          ],
        })),
      },
      ingress: { handle },
      cursorStore: new MemoryWechatKfCursorStore(),
    });

    const processing = pump.handleEvent({ token: 'callback-token', openKfid: 'wk-account' });
    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(2));
    releaseFirst();
    await processing;
  });

  it('persists one independent cursor per customer-service account', () => {
    const temp = tempDir();
    const statePath = join(temp.path, 'state', 'wechat-kf-cursors.json');
    try {
      const store = new JsonWechatKfCursorStore(statePath);
      store.put('wk-account-1', 'cursor-1');
      store.put('wk-account-2', 'cursor-2');

      const reloaded = new JsonWechatKfCursorStore(statePath);
      expect(reloaded.get('wk-account-1')).toBe('cursor-1');
      expect(reloaded.get('wk-account-2')).toBe('cursor-2');
    } finally {
      temp.cleanup();
    }
  });
});
