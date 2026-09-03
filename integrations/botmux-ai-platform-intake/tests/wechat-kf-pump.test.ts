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
          recalledMessageIds: [],
          messages: [{
            messageId: 'message-1',
            openKfid: 'wkAJ2GCAAAexample',
            externalUserId: 'wmAJ2GCAAAcustomer',
            receivedAt: '2026-09-03T00:00:00.000Z',
            mediaId: 'media-1',
          }],
        };
      }
      return { nextCursor: 'cursor-2', hasMore: false, recalledMessageIds: [], messages: [] };
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

    expect(order).toEqual(['sync:empty', 'sync:cursor-1', 'ingest:message-1']);
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
      return { nextCursor: 'cursor-final', hasMore: false, recalledMessageIds: [], messages: [] };
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

  it('collects every page, skips recalled files, and processes remaining files sequentially', async () => {
    const order: string[] = [];
    const handle = vi.fn(async (message: { messageId: string }) => {
      order.push(`start:${message.messageId}`);
      await Promise.resolve();
      order.push(`finish:${message.messageId}`);
    });
    const pump = new WechatKfMessagePump({
      client: {
        syncMessages: vi.fn(async (input: { cursor?: string }) => {
          order.push(`sync:${input.cursor ?? 'empty'}`);
          if (!input.cursor) {
            return {
              nextCursor: 'cursor-1',
              hasMore: true,
              recalledMessageIds: [],
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
            };
          }
          return {
            nextCursor: 'cursor-final',
            hasMore: false,
            recalledMessageIds: ['message-1'],
            messages: [{
              messageId: 'message-3', openKfid: 'wk-account', externalUserId: 'user-3',
              receivedAt: '2026-09-03T00:00:02.000Z', mediaId: 'media-3',
            }],
          };
        }),
      },
      ingress: { handle },
      cursorStore: new MemoryWechatKfCursorStore(),
    });

    await pump.handleEvent({ token: 'callback-token', openKfid: 'wk-account' });

    expect(order).toEqual([
      'sync:empty',
      'sync:cursor-1',
      'start:message-2',
      'finish:message-2',
      'start:message-3',
      'finish:message-3',
    ]);
    expect(handle.mock.calls.map(([message]) => message.messageId)).toEqual(['message-2', 'message-3']);
  });

  it('polls known accounts without a callback token', async () => {
    const cursorStore = new MemoryWechatKfCursorStore();
    cursorStore.put('wk-account', 'cursor-before');
    const syncMessages = vi.fn(async () => ({
      nextCursor: 'cursor-after',
      hasMore: false,
      recalledMessageIds: [],
      messages: [],
    }));
    const pump = new WechatKfMessagePump({
      client: { syncMessages },
      ingress: { handle: vi.fn(async () => undefined) },
      cursorStore,
    });

    await pump.pollKnownAccounts();

    expect(syncMessages).toHaveBeenCalledWith({
      openKfid: 'wk-account',
      cursor: 'cursor-before',
    });
    expect(cursorStore.get('wk-account')).toBe('cursor-after');
  });

  it('keeps the cursor unchanged when sequential ingestion exhausts reply capacity', async () => {
    const cursorStore = new MemoryWechatKfCursorStore();
    cursorStore.put('wk-account', 'cursor-before');
    const handle = vi.fn(async (message: { messageId: string }) => {
      if (message.messageId === 'message-2') throw new Error('wechat_kf_api_95001');
    });
    const pump = new WechatKfMessagePump({
      client: {
        syncMessages: vi.fn(async () => ({
          nextCursor: 'cursor-after',
          hasMore: false,
          recalledMessageIds: [],
          messages: [
            {
              messageId: 'message-1', openKfid: 'wk-account', externalUserId: 'user-1',
              receivedAt: '2026-09-03T00:00:00.000Z', mediaId: 'media-1',
            },
            {
              messageId: 'message-2', openKfid: 'wk-account', externalUserId: 'user-1',
              receivedAt: '2026-09-03T00:00:01.000Z', mediaId: 'media-2',
            },
          ],
        })),
      },
      ingress: { handle },
      cursorStore,
    });

    await expect(pump.pollKnownAccounts()).rejects.toThrow('wechat_kf_api_95001');

    expect(handle.mock.calls.map(([message]) => message.messageId)).toEqual(['message-1', 'message-2']);
    expect(cursorStore.get('wk-account')).toBe('cursor-before');
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
