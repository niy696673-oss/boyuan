import type { UsageRecord } from './types.js';
import type { UsageStore } from './usage-store.js';

export interface FeishuBitableSyncerOptions {
  appId: string;
  appSecret: string;
  appToken: string; // Base Token (e.g. IOk1bb1H1aIF3bsGdg8ckVYon0g)
  tableId?: string; // Optional, defaults to finding table named "02 使用记录"
  store: UsageStore;
}

export class FeishuBitableSyncer {
  readonly #options: FeishuBitableSyncerOptions;
  #cachedTableId: string | undefined;

  constructor(options: FeishuBitableSyncerOptions) {
    this.#options = options;
    this.#cachedTableId = options.tableId;
  }

  async getTenantAccessToken(): Promise<string> {
    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        app_id: this.#options.appId,
        app_secret: this.#options.appSecret,
      }),
    });
    const data = (await res.json()) as { code?: number; msg?: string; tenant_access_token?: string };
    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(`feishu_token_failed: ${data.msg ?? 'unknown'}`);
    }
    return data.tenant_access_token;
  }

  async resolveTableId(token: string): Promise<string> {
    if (this.#cachedTableId) return this.#cachedTableId;

    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${this.#options.appToken}/tables`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as {
      code: number;
      msg: string;
      data?: { items?: Array<{ table_id: string; name: string }> };
    };

    if (data.code !== 0 || !data.data?.items) {
      throw new Error(`feishu_bitable_tables_failed: code=${data.code} msg=${data.msg}`);
    }

    const table = data.data.items.find((t) => t.name.includes('使用记录')) ?? data.data.items[0];
    if (!table) throw new Error('feishu_bitable_table_not_found');
    this.#cachedTableId = table.table_id;
    return table.table_id;
  }

  async syncBatch(limit: number = 100): Promise<{ syncedCount: number; error?: string }> {
    const records = this.#options.store.getUnsyncedRecords(limit);
    if (!records.length) return { syncedCount: 0 };

    let token: string;
    try {
      token = await this.getTenantAccessToken();
    } catch (err) {
      return { syncedCount: 0, error: err instanceof Error ? err.message : String(err) };
    }

    let tableId: string;
    try {
      tableId = await this.resolveTableId(token);
    } catch (err) {
      return { syncedCount: 0, error: err instanceof Error ? err.message : String(err) };
    }

    const batchUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${this.#options.appToken}/tables/${tableId}/records/batch_create`;
    const payload = {
      records: records.map((r) => {
        const fields: Record<string, unknown> = {
          '记录ID': r.recordId,
          '用户标识': r.userId,
          '渠道': r.channel,
          '使用功能': r.feature,
          '开始时间': r.startTimestampMs,
          '结果状态': r.status,
          '响应秒数': r.durationSeconds,
          '会话ID': r.sessionId,
          '内部测试': r.isTest === '是',
          '用户反馈': r.feedback,
        };
        if (r.endTimestampMs) {
          fields['结束时间'] = r.endTimestampMs;
        }
        if (r.failureReason) {
          fields['失败原因'] = r.failureReason;
        }
        if (r.notes) {
          fields['备注'] = r.notes;
        }
        return { fields };
      }),
    };

    const res = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { code: number; msg: string };
    if (data.code !== 0) {
      return {
        syncedCount: 0,
        error: `batch_create_failed: code=${data.code} msg=${data.msg}`,
      };
    }

    this.#options.store.markSynced(records.map((r) => r.recordId));
    return { syncedCount: records.length };
  }
}
