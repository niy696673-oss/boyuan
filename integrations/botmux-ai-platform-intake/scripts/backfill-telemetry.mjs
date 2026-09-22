import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import compiled dist modules
const distPath = resolve(__dirname, '../dist/index.js');
const { UsageStore, UsageCollector, MetricsAggregator, formatDateTime } = await import(distPath);

const FEISHU_CONV_PATH = process.env.FEISHU_CONVERSATIONS_PATH ?? '/opt/boyuan/runtime/feishu/jobs.json.conversations.json';
const FEISHU_TELEMETRY_PATH = process.env.FEISHU_TELEMETRY_PATH ?? '/opt/boyuan/runtime/feishu/jobs.json.telemetry.jsonl';

const WECHAT_CONV_PATH = process.env.WECHAT_CONVERSATIONS_PATH ?? '/opt/boyuan/runtime/wechat-kf/jobs.json.conversations.json';
const WECHAT_TELEMETRY_PATH = process.env.WECHAT_TELEMETRY_PATH ?? '/opt/boyuan/runtime/wechat-kf/jobs.json.telemetry.jsonl';

function processConversationFile(convPath, telemetryPath, channel) {
  if (!existsSync(convPath)) {
    console.log(`[Backfill] File not found: ${convPath} (skipping)`);
    return [];
  }

  const raw = JSON.parse(readFileSync(convPath, 'utf8'));
  const turns = Object.values(raw.turns ?? {});
  console.log(`[Backfill] Found ${turns.length} turns in ${convPath}`);

  // Sort turns chronologically
  turns.sort((a, b) => {
    const tA = a.message?.receivedAt ? Date.parse(a.message.receivedAt) : 0;
    const tB = b.message?.receivedAt ? Date.parse(b.message.receivedAt) : 0;
    return tA - tB;
  });

  const store = new UsageStore({ filePath: telemetryPath });
  const testUserIds = (process.env.BOYUAN_TEST_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const collector = new UsageCollector({ store, testUserIds });

  let backfilledCount = 0;
  for (const turn of turns) {
    const msg = turn.message;
    if (!msg || !msg.messageId) continue;

    const existing = store.getRecord(msg.messageId);
    if (existing && existing.status !== '处理中' && existing.modelOutput) {
      continue; // already recorded and has modelOutput
    }

    const startMs = msg.receivedAt ? Date.parse(msg.receivedAt) : Date.now();
    const startDate = new Date(isNaN(startMs) ? Date.now() : startMs);
    const text = msg.text ?? '';
    const fileName = turn.file?.fileName;

    const { recordId, sessionId } = collector.onTurnStart({
      recordId: msg.messageId,
      channel,
      userId: msg.senderId ?? 'unknown',
      text,
      fileName,
      receivedAt: msg.receivedAt,
    });

    const isFailed = turn.status === 'failed';
    const isCompleted = turn.status === 'completed';

    // Simulate completion with estimated duration
    const endMs = startMs + (turn.decision?.kind === 'research' ? 3500 : 1200);
    const endDate = new Date(endMs);

    if (isFailed) {
      collector.onTurnFail({
        recordId,
        error: new Error(turn.response ?? '消息处理失败'),
        failedAt: endDate,
        modelOutput: turn.response,
      });
    } else {
      collector.onTurnComplete({
        recordId,
        status: '成功',
        completedAt: endDate,
        modelOutput: turn.response,
      });
    }
    backfilledCount++;
  }

  console.log(`[Backfill] Successfully backfilled/updated ${backfilledCount} records in ${telemetryPath}`);
  return store.getAllRecords();
}

console.log('=== 开始回填与聚合机器人使用记录 ===');
const feishuRecords = processConversationFile(FEISHU_CONV_PATH, FEISHU_TELEMETRY_PATH, '飞书');
const wechatRecords = processConversationFile(WECHAT_CONV_PATH, WECHAT_TELEMETRY_PATH, '微信客服');

const allRecords = [...feishuRecords, ...wechatRecords];
console.log(`\n=== 统计概览 (总记录数: ${allRecords.length}) ===`);

if (allRecords.length > 0) {
  const metrics = MetricsAggregator.compute(allRecords);
  console.log('\n' + MetricsAggregator.renderMarkdownReport(metrics));
} else {
  console.log('无有效记录。');
}
