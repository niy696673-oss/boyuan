import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ConversationAgent, ConversationDecision, ConversationHistoryEntry } from './conversation-agent.js';
import { parseFeishuTextMessage, type FeishuCompanyResearchMessage, type FeishuTextMessage } from './direct-feishu-intake.js';

interface Turn {
  message: FeishuTextMessage;
  decision?: ConversationDecision;
  research: Record<string, string>;
  status: 'pending' | 'completed' | 'failed';
  response?: string;
  attempts?: number;
}

interface ConversationData {
  schemaVersion: 1;
  turns: Record<string, Turn>;
}

export interface FeishuConversationOptions {
  botOpenId: string;
  statePath: string;
  agent: ConversationAgent;
  reply(message: FeishuTextMessage, text: string, uuid: string): Promise<void>;
  research(message: FeishuCompanyResearchMessage): Promise<string>;
  onError?(error: unknown): void;
  setTimer?(callback: () => void, delayMs: number): unknown;
}

/** One persisted inbox per service; histories and queues are isolated by chat AND sender. */
export class FeishuConversationIngress {
  readonly #options: FeishuConversationOptions;
  readonly #data: ConversationData;
  readonly #active = new Map<string, Promise<void>>();
  readonly #queues = new Map<string, Promise<void>>();

  constructor(options: FeishuConversationOptions) {
    this.#options = options;
    this.#data = existsSync(options.statePath)
      ? JSON.parse(readFileSync(options.statePath, 'utf8')) as ConversationData
      : { schemaVersion: 1, turns: {} };
    if (this.#data.schemaVersion !== 1 || !this.#data.turns) {
      throw new Error('feishu_conversation_state_invalid');
    }
  }

  async handle(event: unknown): Promise<{ handled: boolean }> {
    const message = parseFeishuTextMessage(event, new Date(), this.#options.botOpenId);
    if (!message) return { handled: false };
    if (!this.#data.turns[message.messageId]) {
      this.#data.turns[message.messageId] = { message, research: {}, status: 'pending' };
      this.#save();
    }
    await this.#enqueue(message.messageId);
    return { handled: true };
  }

  resumePending(): void {
    for (const [id, turn] of Object.entries(this.#data.turns)) {
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
    const next = previous.catch(() => undefined).then(() => this.#process(turn));
    this.#active.set(id, next);
    this.#queues.set(owner, next);
    void next.finally(() => {
      this.#active.delete(id);
      if (this.#queues.get(owner) === next) this.#queues.delete(owner);
    }).catch(() => undefined);
    void next.catch((error) => {
      this.#options.onError?.(error);
      if (turn.status === 'pending' && (turn.attempts ?? 0) < 3) {
        const schedule = this.#options.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms).unref());
        schedule(() => { void this.#enqueue(id).catch(() => undefined); }, 1500 * (turn.attempts ?? 1));
      }
    });
    return next;
  }

  async #process(turn: Turn): Promise<void> {
    const { message } = turn;
    const history = this.#history(turn);
    turn.attempts = (turn.attempts ?? 0) + 1;
    this.#save();
    let deliveringReply = false;
    try {
      // A size guard protects model capacity; it never silently truncates a user's message.
      if (message.text.length > 16_000) {
        turn.decision = { kind: 'reply', text: '这条消息太长了，请分成几条发送，我会逐条处理。' };
      }
      if (!turn.decision) {
        turn.decision = await this.#options.agent.respond({ text: message.text, history });
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
                chatId: message.chatId, messageId: message.messageId, senderId: message.senderId,
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

  async #reply(message: FeishuTextMessage, text: string): Promise<void> {
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

function conversationKey(message: FeishuTextMessage): string {
  return `${message.chatId}:${message.senderId}`;
}
