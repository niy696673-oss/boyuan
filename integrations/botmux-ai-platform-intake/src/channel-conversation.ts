import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ConversationAgent, ConversationDecision, ConversationHistoryEntry } from './conversation-agent.js';
export interface ConversationMessage {
  chatId: string; senderId: string; messageId: string; receivedAt: string; text: string;
  context?: Record<string, string>;
}
export interface ConversationFile {
  chatId: string; senderId?: string; messageId: string; receivedAt: string;
  fileKey: string; fileName: string; context?: Record<string, string>;
}
export interface ConversationResearch extends Omit<ConversationFile, 'fileKey' | 'fileName'> {
  companyName: string; researchKey?: string; researchFocus?: string;
}

interface Turn {
  message: ConversationMessage;
  file?: ConversationFile;
  decision?: ConversationDecision;
  research: Record<string, string>;
  status: 'pending' | 'completed' | 'failed';
  response?: string;
  attempts?: number;
}

interface ConversationData {
  schemaVersion: 1;
  turns: Record<string, Turn>;
  sessions?: Record<string, string>;
  restoredFiles?: Record<string, boolean>;
}

export interface ChannelConversationOptions {
  statePath: string;
  agent: ConversationAgent;
  reply(message: ConversationMessage, text: string, uuid: string): Promise<void>;
  research(message: ConversationResearch): Promise<string>;
  file?(message: ConversationFile): Promise<string>;
  finish?(message: ConversationMessage): Promise<void>;
  restoreFiles?(message: ConversationMessage): Promise<Array<{ file: ConversationFile; content: string }>>;
  onError?(error: unknown): void;
  setTimer?(callback: () => void, delayMs: number): unknown;
}

/** One persisted inbox per service; histories and queues are isolated by chat AND sender. */
export class ChannelConversation {
  readonly #options: ChannelConversationOptions;
  readonly #data: ConversationData;
  readonly #active = new Map<string, Promise<void>>();
  readonly #queues = new Map<string, Promise<void>>();

  constructor(options: ChannelConversationOptions) {
    this.#options = options;
    this.#data = existsSync(options.statePath)
      ? JSON.parse(readFileSync(options.statePath, 'utf8')) as ConversationData
      : { schemaVersion: 1, turns: {} };
    if (this.#data.schemaVersion !== 1 || !this.#data.turns) {
      throw new Error('channel_conversation_state_invalid');
    }
  }

  /** Persist synchronously before returning the processing promise so a channel may acknowledge receipt safely. */
  accept(message: ConversationMessage, file?: ConversationFile): Promise<void> {
    if (!this.#data.turns[message.messageId]) {
      this.#data.turns[message.messageId] = { message, research: {}, status: 'pending', ...(file ? { file } : {}) };
      try { this.#save(); } catch (error) { delete this.#data.turns[message.messageId]; throw error; }
    }
    return this.#enqueue(message.messageId);
  }

  has(messageId: string): boolean { return Boolean(this.#data.turns[messageId]); }

  async waitForIdle(): Promise<void> {
    while (this.#active.size) await Promise.allSettled([...this.#active.values()]);
  }

  resumePending(): void {
    for (const [id, turn] of Object.entries(this.#data.turns).sort(([, a], [, b]) =>
      Date.parse(a.message.receivedAt) - Date.parse(b.message.receivedAt))) {
      if (turn.status === 'pending') void this.#enqueue(id).catch((error) => this.#options.onError?.(error));
    }
  }

  #enqueue(id: string): Promise<void> {
    const current = this.#active.get(id);
    if (current) return current;
    const turn = this.#data.turns[id]!;
    if (turn.status !== 'pending') return Promise.resolve();
    const owner = conversationKey(turn.message);
    const previous = this.#queues.get(owner) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.#processWithRetry(turn));
    this.#active.set(id, next);
    this.#queues.set(owner, next);
    void next.finally(() => {
      this.#active.delete(id);
      if (this.#queues.get(owner) === next) this.#queues.delete(owner);
    }).catch(() => undefined);
    void next.catch((error) => {
      this.#options.onError?.(error);
    });
    return next;
  }

  async #processWithRetry(turn: Turn): Promise<void> {
    while (true) {
      try { await this.#process(turn); return; } catch (error) {
        if ((turn.attempts ?? 0) >= 3) {
          turn.status = 'failed';
          turn.response = '这条消息处理失败，请重新发送后再试。';
          this.#save();
          await this.#reply(turn.message, turn.response).catch(this.#options.onError ?? (() => undefined));
          throw error;
        }
        // Hold the same conversation lock throughout retries. Later messages cannot overtake it.
        await new Promise<void>((resolve) => {
          const schedule = this.#options.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
          schedule(resolve, 1500 * (turn.attempts ?? 1));
        });
      }
    }
  }

  async #process(turn: Turn): Promise<void> {
    const { message } = turn;
    turn.attempts = (turn.attempts ?? 0) + 1;
    this.#save();
    if (turn.file) {
      if (!this.#options.file) throw new Error('conversation_file_handler_missing');
      turn.response = await this.#options.file(turn.file);
      await this.#options.finish?.(message);
      turn.status = 'completed';
      this.#save();
      return;
    }
    const owner = conversationKey(message);
    if (this.#options.restoreFiles && !this.#data.restoredFiles?.[owner]) {
      for (const restored of await this.#options.restoreFiles(message)) {
        if (restored.file.chatId !== message.chatId || restored.file.senderId !== message.senderId
          || this.#data.turns[restored.file.messageId]) continue;
        this.#data.turns[restored.file.messageId] = {
          message: { chatId: message.chatId, senderId: message.senderId,
            messageId: restored.file.messageId, receivedAt: restored.file.receivedAt,
            text: `[上传文件] ${restored.file.fileName}` },
          file: restored.file, status: 'completed', response: restored.content, research: {},
        };
      }
      this.#data.restoredFiles ??= {};
      this.#data.restoredFiles[owner] = true;
      this.#save();
    }
    const history = this.#history(turn);
    let deliveringReply = false;
    try {
      // A size guard protects model capacity; it never silently truncates a user's message.
      if (message.text.length > 16_000) {
        turn.decision = { kind: 'reply', text: '这条消息太长了，请分成几条发送，我会逐条处理。' };
      }
      if (!turn.decision) {
        const sessionId = this.#data.sessions?.[owner];
        turn.decision = await this.#options.agent.respond({
          text: message.text, history,
          materials: this.#materials(turn),
          session: {
            ...(sessionId ? { id: sessionId } : {}),
            onCreated: (id) => {
              this.#data.sessions ??= {};
              this.#data.sessions[owner] = id;
              this.#save();
            },
          },
        });
        this.#save();
      }
      if (turn.decision.kind === 'reply') {
        turn.response = turn.decision.text;
        deliveringReply = true;
        await this.#reply(message, turn.decision.text);
      } else {
        const decision = turn.decision;
        const failures: unknown[] = [];
        // Bounded fan-out within one message; other users have independent queues.
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(2, decision.companies.length) }, async () => {
          while (cursor < decision.companies.length) {
            const companyName = decision.companies[cursor++]!;
            const researchKey = companyResearchKey(companyName);
            if (Object.hasOwn(turn.research, researchKey)) continue;
            try {
              turn.research[researchKey] = await this.#options.research({
                ...message,
                receivedAt: message.receivedAt, companyName, researchKey,
                ...(decision.focus ? { researchFocus: decision.focus } : {}),
              });
            } catch (error) {
              this.#options.onError?.(error);
              failures.push(error);
            }
            this.#save();
          }
        }));
        if (failures.length) throw new Error('company_research_retry_pending');
        turn.response = decision.companies.map((name) => turn.research[companyResearchKey(name)]).join('\n\n');
      }
      deliveringReply = true;
      await this.#options.finish?.(message);
      turn.status = 'completed';
    } catch (error) {
      this.#options.onError?.(error);
      if (deliveringReply || turn.decision?.kind === 'research') {
        this.#save();
        throw error;
      }
      turn.response = '这次处理暂时失败了，请稍后再试。你可以直接用自然语言提问。';
      // If delivery fails, leave this turn pending so restart/event replay can deliver it.
      turn.decision = { kind: 'reply', text: turn.response };
      this.#save();
      await this.#reply(message, turn.response);
      turn.status = 'failed';
    }
    this.#save();
  }

  #materials(current: Turn): Array<{ fileName: string; content: string }> {
    const before = Object.values(this.#data.turns).filter((turn) =>
      conversationKey(turn.message) === conversationKey(current.message)
      && turn !== current && turn.file && turn.status === 'completed' && turn.response
      && Date.parse(turn.message.receivedAt) <= Date.parse(current.message.receivedAt));
    let budget = 80_000;
    return before.sort((a, b) => Date.parse(b.message.receivedAt) - Date.parse(a.message.receivedAt))
      .slice(0, 3).flatMap((turn) => {
        if (budget <= 0) return [];
        const content = turn.response!.slice(0, budget);
        budget -= content.length;
        return [{ fileName: turn.file!.fileName, content: content.length < turn.response!.length
          ? `${content}\n[上下文容量有限，后续内容未纳入，不能推断省略部分]` : content }];
      }).reverse();
  }

  #history(current: Turn): ConversationHistoryEntry[] {
    const owner = conversationKey(current.message);
    const turns = Object.values(this.#data.turns)
      .filter((turn) => conversationKey(turn.message) === owner)
      .sort((a, b) => Date.parse(a.message.receivedAt) - Date.parse(b.message.receivedAt));
    // Build in original message order, never in completion/retry order.
    return turns.slice(0, turns.indexOf(current)).slice(-6).flatMap((turn) => [
      { role: 'user' as const, content: turn.message.text.slice(0, 8_000) },
      { role: 'assistant' as const, content: (turn.response
        ?? '这条请求仍在处理，尚未取得可用结果。').slice(0, 8_000) },
    ]);
  }

  async #reply(message: ConversationMessage, text: string): Promise<void> {
    const uuid = createHash('sha256').update(`boyuan-dialogue:${message.messageId}`).digest('hex').slice(0, 50);
    await this.#options.reply(message, text, uuid);
  }

  #save(): void {
    mkdirSync(dirname(this.#options.statePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.#options.statePath}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.#data), { mode: 0o600 });
    renameSync(temporary, this.#options.statePath);
  }
}

export function companyResearchKey(companyName: string): string {
  return `company-research:${createHash('sha256').update(companyName.normalize('NFKC').toLowerCase()).digest('hex').slice(0, 24)}`;
}

function conversationKey(message: ConversationMessage): string {
  return `${message.chatId}:${message.senderId}`;
}
