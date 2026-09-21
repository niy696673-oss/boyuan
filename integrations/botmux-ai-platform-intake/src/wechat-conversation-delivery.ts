import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { encodeReceipt, requiredReceipt, splitWechatText } from './direct-wechat-kf-intake.js';
import { wechatRoute } from './wechat-conversation.js';
import type { ConversationMessage } from './channel-conversation.js';
import type { WechatKfClient, WechatKfFileMessage } from './wechat-kf-client.js';
import type { IntakeDelivery, CompletionDeliveryInput, FailureDeliveryInput } from './types.js';
import { renderWeComCompletion } from './wecom-text.js';

interface Outbox {
  openKfid: string; externalUserId: string;
  acknowledged: boolean; results: Record<string, string>; order: string[]; sent: number; chunks?: string[];
}

/** One ack + at most three final messages per incoming turn, including multi-company research. */
export class WechatConversationDelivery implements IntakeDelivery {
  readonly #entries: Record<string, Outbox>;
  readonly #acknowledging = new Map<string, Promise<void>>();
  constructor(private readonly options: { statePath: string; client: Pick<WechatKfClient, 'sendText'> }) {
    const data = existsSync(options.statePath) ? JSON.parse(readFileSync(options.statePath, 'utf8')) : { schemaVersion: 1, entries: {} };
    if (data.schemaVersion !== 1 || !data.entries || typeof data.entries !== 'object') throw new Error('wechat_outbox_invalid');
    this.#entries = data.entries;
  }

  async openProcessing(input: Omit<WechatKfFileMessage, 'mediaId'> & { fileKey: string; kind?: string; subject?: string }): Promise<string> {
    const entry = this.#entry(input.messageId, input);
    if (!entry.order.includes(input.fileKey)) { entry.order.push(input.fileKey); this.#save(); }
    if (!entry.acknowledged) {
      let active = this.#acknowledging.get(input.messageId);
      if (!active) {
        active = this.#send(input.messageId, entry, 'ack', '【通约助手】已收到，正在分析，完成后会在此回复。')
          .then(() => { entry.acknowledged = true; this.#save(); });
        this.#acknowledging.set(input.messageId, active);
      }
      try { await active; } finally { this.#acknowledging.delete(input.messageId); }
    }
    return encodeReceipt(input);
  }

  async complete(input: CompletionDeliveryInput): Promise<void> {
    const entry = this.#entry(input.messageId, requiredReceipt(input.statusReceipt));
    entry.results[input.fileKey] = renderWeComCompletion(input, { includeNavigation: false });
    this.#save();
    if (!input.messageId.startsWith('wechat-kf:')) await this.flush(input.messageId);
  }

  async fail(input: FailureDeliveryInput): Promise<void> {
    const entry = this.#entry(input.messageId, requiredReceipt(input.statusReceipt));
    entry.results[input.fileKey] = `【通约助手】“${input.subject}”处理失败，请稍后再试。`;
    this.#save();
    if (!input.messageId.startsWith('wechat-kf:')) await this.flush(input.messageId);
  }

  async reply(message: ConversationMessage, text: string): Promise<void> {
    const entry = this.#entry(message.messageId, wechatRoute(message));
    // A terminal queue failure may follow partially successful research; retain any unsent result.
    entry.results.reply = text;
    if (entry.chunks && entry.sent === 0) delete entry.chunks;
    this.#save();
    await this.flush(message.messageId);
  }

  async flush(messageId: string): Promise<void> {
    const entry = this.#entries[messageId];
    if (!entry) return;
    if (!entry.chunks) {
      const keys = [...entry.order, ...Object.keys(entry.results).filter((key) => !entry.order.includes(key))];
      const results = keys.filter((key) => entry.results[key]).map((key) => entry.results[key]!);
      if (!results.length) throw new Error('wechat_turn_result_missing');
      const notice = '\n[本条结果较长，部分内容未展示；可继续询问具体公司或字段。]';
      // Reserve an equal share per company so a long first result cannot hide all later companies.
      const share = Math.floor((6000 - Buffer.byteLength(notice) * results.length - 2 * (results.length - 1)) / results.length);
      const combined = results.map((text) => Buffer.byteLength(text) > Math.max(80, share)
        ? truncate(text, Math.max(80, share)) + notice : text).join('\n\n');
      entry.chunks = splitWechatText(truncate(combined, 6000));
      this.#save();
    }
    while (entry.sent < entry.chunks.length) {
      await this.#send(messageId, entry, `result-${entry.sent}`, entry.chunks[entry.sent]!);
      entry.sent += 1;
      this.#save();
    }
  }

  #entry(id: string, route: { openKfid: string; externalUserId: string }): Outbox {
    const existing = this.#entries[id];
    if (existing && (existing.openKfid !== route.openKfid || existing.externalUserId !== route.externalUserId)) throw new Error('wechat_outbox_owner_mismatch');
    if (!existing) { this.#entries[id] = { openKfid: route.openKfid, externalUserId: route.externalUserId, acknowledged: false, results: {}, order: [], sent: 0 }; this.#save(); }
    return this.#entries[id]!;
  }
  async #send(id: string, entry: Outbox, part: string, content: string): Promise<void> {
    const msgid = createHash('sha256').update(JSON.stringify([entry.openKfid, entry.externalUserId, id, part])).digest('hex').slice(0, 32);
    await this.options.client.sendText({ openKfid: entry.openKfid, externalUserId: entry.externalUserId, content, msgid });
  }
  #save(): void {
    mkdirSync(dirname(this.options.statePath), { recursive: true, mode: 0o700 });
    const temp = `${this.options.statePath}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify({ schemaVersion: 1, entries: this.#entries }), { mode: 0o600 });
    renameSync(temp, this.options.statePath);
  }
}

function truncate(text: string, maxBytes: number): string {
  let result = '', size = 0;
  for (const c of text) { size += Buffer.byteLength(c); if (size > maxBytes) break; result += c; }
  return result;
}
