import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MAX_BATCH_COMPANIES, type CompanyListExtractor } from './company-list-extractor.js';
import type { WechatKfClient, WechatKfImageMessage, WechatKfTextMessage } from './wechat-kf-client.js';
import type { PlatformClient } from './types.js';
import type { UsageCollector } from './telemetry/usage-collector.js';

type Input = WechatKfTextMessage | WechatKfImageMessage;
interface CompanyItem {
  name: string;
  conversationId?: string;
  summary?: string;
  risk?: string;
  done?: boolean;
  failed?: boolean;
}
interface Batch {
  input: Input;
  processingSent?: boolean;
  items?: CompanyItem[];
  uncertain?: string[];
  pages?: string[];
  sent: number;
  done: boolean;
}

export interface CompanyBatchOptions {
  statePath: string;
  client: Pick<WechatKfClient, 'downloadMedia' | 'sendText'>;
  extractor: CompanyListExtractor;
  platform: Pick<PlatformClient, 'startCompanyResearch' | 'companyQuickCard'>;
  publicProductUrl: string;
  onError(error: unknown): void;
  telemetry?: UsageCollector;
}

// Durable parent jobs own results and delivery progress; the platform owns each company's research.
// One batch runs at a time, with at most two companies within it calling the platform concurrently.
export class WechatKfCompanyBatch {
  readonly #options: CompanyBatchOptions;
  readonly #jobs: Record<string, Batch>;
  readonly #acknowledging = new Map<Batch, Promise<void>>();
  #running: Promise<void> | undefined;

  constructor(options: CompanyBatchOptions) {
    this.#options = options;
    if (existsSync(options.statePath)) {
      if (lstatSync(options.statePath).isSymbolicLink()) throw new Error('company_batch_state_symlink');
      const state = JSON.parse(readFileSync(options.statePath, 'utf8'));
      if (state?.schemaVersion !== 1 || !state.jobs || typeof state.jobs !== 'object' || Array.isArray(state.jobs)) {
        throw new Error('company_batch_state_invalid');
      }
      this.#jobs = state.jobs;
    } else this.#jobs = {};
  }

  async handle(input: Input): Promise<void> {
    const key = this.#key(input);
    if (!this.#jobs[key]) {
      this.#jobs[key] = { input, sent: 0, done: false };
      this.#save();
      this.#options.telemetry?.onTurnStart({
        recordId: input.messageId,
        channel: '微信客服',
        userId: input.externalUserId,
        text: 'text' in input ? input.text : '[图片名单]',
        fileName: 'imageMediaId' in input ? '公司名单图片.png' : undefined,
        receivedAt: input.receivedAt,
      });
    }
    if (!this.#jobs[key]!.done) await this.#acknowledge(this.#jobs[key]!);
    this.resumePending();
  }

  resumePending(): void {
    if (this.#running) return;
    this.#running = this.#drain().finally(() => { this.#running = undefined; });
    void this.#running.catch(this.#options.onError);
  }

  async waitForIdle(): Promise<void> { await this.#running; }

  async #drain(): Promise<void> {
    const attempted = new Set<Batch>();
    let batch: Batch | undefined;
    while ((batch = Object.values(this.#jobs).find((job) => !job.done && !attempted.has(job)))) {
      attempted.add(batch);
      try {
        await this.#run(batch);
      } catch (error) {
        this.#options.telemetry?.onTurnFail({ recordId: batch.input.messageId, error });
        this.#options.onError(error);
      }
    }
  }

  async #acknowledge(batch: Batch): Promise<void> {
    if (batch.processingSent) return;
    let active = this.#acknowledging.get(batch);
    if (!active) {
      active = this.#options.client.sendText({
        externalUserId: batch.input.externalUserId, openKfid: batch.input.openKfid,
        content: '【通约助手】已收到，正在识别公司名单并逐家分析。完成后将汇总回复。',
      }).then(() => { batch.processingSent = true; this.#save(); });
      this.#acknowledging.set(batch, active);
    }
    try { await active; } finally { this.#acknowledging.delete(batch); }
  }

  async #run(batch: Batch): Promise<void> {
    const send = (content: string) => this.#options.client.sendText({
      externalUserId: batch.input.externalUserId, openKfid: batch.input.openKfid, content,
    });
    await this.#acknowledge(batch);
    if (!batch.items && !batch.pages) {
      try {
        const input = batch.input;
        const extracted = await this.#options.extractor.extract('text' in input
          ? { text: input.text }
          : { image: (await this.#options.client.downloadMedia(input.imageMediaId)).buffer });
        if (extracted.companies.length > MAX_BATCH_COMPANIES) {
          batch.pages = [`【通约助手】识别到超过 ${MAX_BATCH_COMPANIES} 家公司，本次尚未启动分析。请按每批不超过 ${MAX_BATCH_COMPANIES} 家拆分发送。`];
        } else if (extracted.companies.length > 0) {
          batch.items = extracted.companies.map((name) => ({ name }));
          batch.uncertain = extracted.uncertain;
        } else if (extracted.isCompanyList === false || extracted.summary) {
          const summary = extracted.summary || '图片已完成视觉识别与解析。';
          batch.pages = [`【通约助手】已接收并解析图片内容：\n\n${summary}\n\n你可以就图片中的业务、数据或内容发送文字继续提问。`];
        } else {
          batch.pages = ['【通约助手】未识别到清晰的公司名称，本次未启动分析。请发送公司名单文字或更清晰的图片。'];
        }
      } catch (error) {
        this.#options.onError(error);
        batch.pages = ['【通约助手】本次图片或名单识别遇到异常，尚未启动分析。请稍后重发文字名单或清晰的图片（不超过 20MB）。'];
      }
      this.#save();
    }
    if (!batch.pages) {
      const items = batch.items!;
      let next = 0;
      const work = async () => {
        while (next < items.length) {
          const index = next++;
          const item = items[index]!;
          if (item.done) continue;
          try {
            if (!item.conversationId) {
              const result = await this.#options.platform.startCompanyResearch({
                chatId: batch.input.externalUserId,
                sessionId: `wechat-kf-batch:${this.#key(batch.input)}`,
                messageId: `kf-batch-${this.#key(batch.input)}-${index}`,
                senderId: batch.input.externalUserId,
                companyName: item.name,
                receivedAt: batch.input.receivedAt,
              });
              item.conversationId = result.conversation.conversationId;
              this.#save();
            }
            const result = await this.#options.platform.companyQuickCard(item.conversationId);
            item.summary = result.productTechnology;
            item.risk = result.riskSignals[0] ?? '信息仍需核验';
            item.failed = result.status !== 'completed';
          } catch (error) {
            item.failed = true;
            this.#options.onError(error);
          }
          item.done = true;
          this.#save();
        }
      };
      await Promise.all([work(), work()]);
      batch.pages = renderBatch(items, batch.uncertain ?? [], this.#options.publicProductUrl);
      this.#save();
    }
    while (batch.sent < batch.pages.length) {
      await send(batch.pages[batch.sent]!);
      batch.sent += 1;
      this.#save();
    }
    batch.done = true;
    this.#save();
    this.#options.telemetry?.onTurnComplete({
      recordId: batch.input.messageId,
      feature: '批量公司研究',
      status: '成功',
    });
  }

  #key(input: Input): string {
    return createHash('sha256').update(`${input.openKfid}\0${input.messageId}`).digest('hex').slice(0, 32);
  }

  #save(): void {
    const path = this.#options.statePath;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 1, jobs: this.#jobs }, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
  }
}

export function renderBatch(items: CompanyItem[], uncertain: string[], _publicProductUrl: string): string[] {
  const short = (value: string, limit: number) => {
    const chars = [...value.replace(/[\r\n]/gu, ' ')];
    return chars.length > limit ? `${chars.slice(0, limit).join('')}…` : chars.join('');
  };
  const blocks = [`【通约助手｜公司批量研究】\n识别 ${items.length} 家，快速分析完成 ${items.filter((i) => !i.failed).length} 家。`];
  for (const [index, item] of items.entries()) {
    blocks.push([
      `${index + 1}）${short(item.name, 20)}`,
      item.failed ? '该公司分析未完成，请单独重试。'
        : `主业：${short(item.summary ?? '待核验', 18)}\n待核验：${short(item.risk ?? '待核验', 12)}`,
    ].join('\n'));
  }
  if (uncertain.length) blocks.push(`另有 ${uncertain.length} 处名称不清晰，未纳入分析：${short(uncertain.join('、'), 80)}。请补充文字确认。`);
  blocks.push('以上为快速预览，不构成投资判断。可以继续提问。');
  const pages: string[] = [];
  let page = '';
  for (let block of blocks) {
    if (Buffer.byteLength(block) > 2048) block = short(block, 300);
    if (Buffer.byteLength(`${page}\n\n${block}`) > 2048) { pages.push(page); page = block; }
    else page = page ? `${page}\n\n${block}` : block;
  }
  if (page) pages.push(page);
  return pages;
}
