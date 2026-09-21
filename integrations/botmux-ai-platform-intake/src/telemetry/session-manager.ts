import { randomUUID } from 'node:crypto';
import type { BotChannel, SessionState } from './types.js';

export const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 分钟

export class SessionManager {
  readonly #sessions = new Map<string, SessionState>();
  readonly #activeUserSession = new Map<string, string>(); // userKey -> sessionId

  constructor(initialSessions?: SessionState[]) {
    if (initialSessions) {
      for (const s of initialSessions) {
        this.#sessions.set(s.sessionId, s);
        const userKey = this.#userKey(s.channel, s.userId);
        this.#activeUserSession.set(userKey, s.sessionId);
      }
    }
  }

  #userKey(channel: BotChannel, userId: string): string {
    return `${channel}:${userId}`;
  }

  /**
   * 按照“连续 30 分钟无新有效请求后，下次请求开启新会话”口径分配或延续 Session。
   */
  allocateSession(
    channel: BotChannel,
    userId: string,
    timestampMs: number = Date.now(),
    isValidRequest: boolean = true,
  ): { sessionId: string; isNewSession: boolean } {
    const userKey = this.#userKey(channel, userId);
    const existingSessionId = this.#activeUserSession.get(userKey);
    const existing = existingSessionId ? this.#sessions.get(existingSessionId) : undefined;

    if (existing && timestampMs - existing.lastRequestAt <= SESSION_INACTIVITY_TIMEOUT_MS) {
      // 在 30 分钟窗口内，延续会话
      existing.lastRequestAt = timestampMs;
      existing.totalRequests += 1;
      if (isValidRequest) existing.validRequests += 1;
      return { sessionId: existing.sessionId, isNewSession: false };
    }

    // 超过 30 分钟或初次访问，新建会话
    const sessionId = `sess_${timestampMs.toString(36)}_${randomUUID().slice(0, 8)}`;
    const newSession: SessionState = {
      sessionId,
      userId,
      channel,
      firstRequestAt: timestampMs,
      lastRequestAt: timestampMs,
      totalRequests: 1,
      validRequests: isValidRequest ? 1 : 0,
    };

    this.#sessions.set(sessionId, newSession);
    this.#activeUserSession.set(userKey, sessionId);
    return { sessionId, isNewSession: true };
  }

  recordResponse(sessionId: string, responseTimestampMs: number = Date.now()): void {
    const session = this.#sessions.get(sessionId);
    if (session) {
      session.lastResponseAt = responseTimestampMs;
    }
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.#sessions.get(sessionId);
  }

  getAllSessions(): SessionState[] {
    return Array.from(this.#sessions.values());
  }
}
