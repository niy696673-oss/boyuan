// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createDeterministicAnalysisAdapter } from "../server/research-platform/analysis/deterministic-analysis.js";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createPlatformModule } from "../server/research-platform/platform-module.js";

const CURRENT_SCHEMA_VERSION = 22;
const roots: string[] = [];
const modules: PlatformModule[] = [];

afterEach(async () => {
  while (modules.length) modules.pop()?.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("research-platform SQLite schema reconciliation", () => {
  it("creates the current schema for a fresh database", async () => {
    const dataRoot = await createDataRoot();
    const platform = openPlatform(dataRoot);

    const seeded = await seedMaterial(platform, "fresh-message");

    expect(
      (await platform.getConversation(seeded.conversationId)).receiptCount,
    ).toBe(1);
    expectCurrentSchema(dataRoot);
  });

  it("upgrades origin/main v12 without losing receipts or intake idempotency", async () => {
    const dataRoot = await createDataRoot();
    const original = openPlatform(dataRoot);
    const seeded = await seedMaterial(original, "main-v12-message");
    closeModule(original);

    convertCurrentDatabaseToMainV12(dataRoot);
    expectSchemaHistory(dataRoot, 12);
    expect(tableExists(dataRoot, "intake_idempotency")).toBe(true);
    expect(tableExists(dataRoot, "notification_reads")).toBe(false);
    expect(columnNames(dataRoot, "industries")).not.toContain("watched");
    expect(tableExists(dataRoot, "industry_research_runs")).toBe(false);

    const upgraded = openPlatform(dataRoot);
    const replay = await upgraded.ingestDocument({
      fileName: "不应创建的新材料.txt",
      mimeType: "text/plain",
      sourceChannel: "feishu",
      sourceMessageId: "main-v12-message",
      sourceAttachmentKey: "file_legacy_retry",
      content: chunks(
        "迁移兼容科技有限公司\n公司位于人工智能产业中游，提供工业软件。",
      ),
    });

    expect(replay.reusedDocument).toBe(true);
    expect(replay.conversation.conversationId).toBe(seeded.conversationId);
    const secondAttachment = await upgraded.ingestDocument({
      fileName: "同消息第二份材料.txt",
      mimeType: "text/plain",
      sourceChannel: "feishu",
      sourceMessageId: "main-v12-message",
      sourceAttachmentKey: "file_second",
      content: chunks("同一条旧消息中的新附件应创建独立对话。"),
    });
    const secondAttachmentReplay = await upgraded.ingestDocument({
      fileName: "第二份材料重试.txt",
      mimeType: "text/plain",
      sourceChannel: "feishu",
      sourceMessageId: "main-v12-message",
      sourceAttachmentKey: "file_second",
      content: chunks("相同附件标识重试时应复用独立对话。"),
    });
    expect(secondAttachment.reusedDocument).toBe(false);
    expect(secondAttachment.conversation.conversationId).not.toBe(
      seeded.conversationId,
    );
    expect(secondAttachmentReplay).toMatchObject({
      reusedDocument: true,
      conversation: {
        conversationId: secondAttachment.conversation.conversationId,
      },
    });
    expect(
      (await upgraded.getConversation(seeded.conversationId)).receiptCount,
    ).toBe(1);
    expect(await upgraded.listConversations()).toHaveLength(2);
    expect(intakeAttachmentKeys(dataRoot, "main-v12-message")).toEqual([
      "file_legacy_retry",
      "file_second",
    ]);
    expectCurrentSchema(dataRoot);
  });

  it("keeps a new attachment independent when it arrives before the keyed retry of a v12 legacy attachment", async () => {
    const dataRoot = await createDataRoot();
    const original = openPlatform(dataRoot);
    const seeded = await seedMaterial(original, "main-v12-reversed-message");
    closeModule(original);

    convertCurrentDatabaseToMainV12(dataRoot);
    const upgraded = openPlatform(dataRoot);
    const secondAttachment = await upgraded.ingestDocument({
      fileName: "同消息第二份材料.txt",
      mimeType: "text/plain",
      sourceChannel: "feishu",
      sourceMessageId: "main-v12-reversed-message",
      sourceAttachmentKey: "file_second",
      content: chunks("同一条旧消息中的新附件应创建独立对话。"),
    });
    const legacyRetry = await upgraded.ingestDocument({
      fileName: "迁移兼容性 BP.txt",
      mimeType: "text/plain",
      sourceChannel: "feishu",
      sourceMessageId: "main-v12-reversed-message",
      sourceAttachmentKey: "file_legacy_retry",
      content: chunks(
        "迁移兼容科技有限公司\n公司位于人工智能产业中游，提供工业软件。",
      ),
    });
    const secondAttachmentReplay = await upgraded.ingestDocument({
      fileName: "第二份材料重试.txt",
      mimeType: "text/plain",
      sourceChannel: "feishu",
      sourceMessageId: "main-v12-reversed-message",
      sourceAttachmentKey: "file_second",
      content: chunks("相同附件标识重试时不应再次写入。"),
    });
    const legacyReplay = await upgraded.ingestDocument({
      fileName: "旧附件再次重试.txt",
      mimeType: "text/plain",
      sourceChannel: "feishu",
      sourceMessageId: "main-v12-reversed-message",
      sourceAttachmentKey: "file_legacy_retry",
      content: chunks("相同旧附件标识重试时不应再次写入。"),
    });

    expect(secondAttachment).toMatchObject({
      reusedDocument: false,
      conversation: { document: { fileName: "同消息第二份材料.txt" } },
    });
    expect(secondAttachment.conversation.conversationId).not.toBe(
      seeded.conversationId,
    );
    expect(legacyRetry).toMatchObject({
      reusedDocument: true,
      conversation: { conversationId: seeded.conversationId },
    });
    expect(secondAttachmentReplay).toMatchObject({
      reusedDocument: true,
      conversation: {
        conversationId: secondAttachment.conversation.conversationId,
      },
    });
    expect(legacyReplay).toMatchObject({
      reusedDocument: true,
      conversation: { conversationId: seeded.conversationId },
    });
    expect(
      (await upgraded.getConversation(seeded.conversationId)).receiptCount,
    ).toBe(1);
    expect(
      (
        await upgraded.getConversation(
          secondAttachment.conversation.conversationId,
        )
      ).receiptCount,
    ).toBe(1);
    expect(await upgraded.listConversations()).toHaveLength(2);
    expect(intakeAttachmentKeys(dataRoot, "main-v12-reversed-message")).toEqual([
      "file_legacy_retry",
      "file_second",
    ]);
    expectCurrentSchema(dataRoot);
  });

  it("reconciles feature v13 without losing receipts, notification reads, or industry watch state", async () => {
    const dataRoot = await createDataRoot();
    const original = openPlatform(dataRoot);
    const seeded = await seedMaterial(original, "feature-v13-message");
    const industry = (await original.listIndustries()).find(
      (item) => item.industryId === seeded.industryId,
    );
    if (!industry) throw new Error("seed industry missing");
    const watched = await original.setIndustryWatched(
      industry.industryId,
      true,
      industry.version,
    );
    const notification = (await original.listNotifications())[0];
    if (!notification) throw new Error("seed notification missing");
    const read = await original.markNotificationRead(
      notification.notificationId,
    );
    closeModule(original);

    convertCurrentDatabaseToFeatureV13(dataRoot);
    expectSchemaHistory(dataRoot, 13);
    expect(tableExists(dataRoot, "intake_idempotency")).toBe(false);
    expect(tableExists(dataRoot, "notification_reads")).toBe(true);
    expect(columnNames(dataRoot, "industries")).toEqual(
      expect.arrayContaining(["watched", "version"]),
    );

    const upgraded = openPlatform(dataRoot);
    const restoredIndustry = (await upgraded.listIndustries()).find(
      (item) => item.industryId === industry.industryId,
    );
    const restoredNotification = (await upgraded.listNotifications()).find(
      (item) => item.notificationId === notification.notificationId,
    );

    expect(
      (await upgraded.getConversation(seeded.conversationId)).receiptCount,
    ).toBe(1);
    expect(restoredIndustry).toMatchObject({
      watched: true,
      version: watched.version,
    });
    expect(restoredNotification).toMatchObject({ readAt: read.readAt });
    expectCurrentSchema(dataRoot);
  });

  it("reconciles a collided v17 marker without skipping either feature schema", async () => {
    const dataRoot = await createDataRoot();
    const original = openPlatform(dataRoot);
    await seedMaterial(original, "collided-v17-message");
    closeModule(original);

    withDatabase(dataRoot, (database) => {
      database.exec(`
        DROP TABLE subject_company_links;
        DELETE FROM schema_migrations WHERE version >= 18;
      `);
    });
    expectSchemaHistory(dataRoot, 17);
    expect(tableExists(dataRoot, "company_quick_card_results")).toBe(true);
    expect(tableExists(dataRoot, "subject_company_links")).toBe(false);

    openPlatform(dataRoot);

    expectCurrentSchema(dataRoot);
    expectDatabaseIntegrity(dataRoot);
  });

  it("v16 cleans legacy company labels and merges generated draft industries without losing links", async () => {
    const dataRoot = await createDataRoot();
    const original = openPlatform(dataRoot);
    const seeded = await seedMaterial(original, "legacy-generated-labels");
    const company = (await original.listCompanies())[0];
    if (!company) throw new Error("seed company missing");
    closeModule(original);
    const duplicateCompanyId = "company-duplicate-v16";

    withDatabase(dataRoot, (database) => {
      database.exec("PRAGMA foreign_keys = ON");
      database
        .prepare(
          `INSERT INTO companies (
             company_id, canonical_name, status, version,
             created_at, updated_at, watched
           ) VALUES (?, ?, 'provisional', 1, ?, ?, 1)`,
        )
        .run(
          duplicateCompanyId,
          `创新组11+${company.canonicalName}`,
          new Date().toISOString(),
          new Date().toISOString(),
        );
      database
        .prepare(
          `INSERT INTO company_aliases (
             alias_id, company_id, alias, alias_type, created_at
           ) VALUES (?, ?, ?, 'declared', ?)`,
        )
        .run(
          "alias-malformed-v16",
          duplicateCompanyId,
          "气动院）是航空工业唯一的空气动力专业研究机构",
          new Date().toISOString(),
        );
      for (const table of [
        "conversation_companies",
        "knowledge_candidates",
        "company_industries",
      ]) {
        database
          .prepare(`UPDATE ${table} SET company_id = ? WHERE company_id = ?`)
          .run(duplicateCompanyId, company.companyId);
      }
      database
        .prepare(
          `UPDATE company_match_cases SET resolved_company_id = ?
           WHERE resolved_company_id = ?`,
        )
        .run(duplicateCompanyId, company.companyId);
      database
        .prepare("UPDATE industries SET name = ? WHERE industry_id = ?")
        .run(`${company.canonicalName}相关行业`, seeded.industryId);
      database.prepare("DELETE FROM schema_migrations WHERE version = 16").run();
    });

    const upgraded = openPlatform(dataRoot);
    const upgradedCompanies = await upgraded.listCompanies();
    expect(upgradedCompanies).toEqual([
      expect.objectContaining({
        companyId: company.companyId,
        canonicalName: company.canonicalName,
        materialCount: 1,
        pendingCandidateCount: expect.any(Number),
        profile: expect.objectContaining({ watched: true }),
        aliases: expect.not.arrayContaining([
          expect.objectContaining({
            alias: "气动院）是航空工业唯一的空气动力专业研究机构",
          }),
        ]),
      }),
    ]);
    expect(
      upgradedCompanies[0]?.aliases.some((alias) =>
        alias.alias.includes("是航空工业"),
      ),
    ).toBe(false);
    expect(
      withDatabase(dataRoot, (database) =>
        database
          .prepare("SELECT 1 AS present FROM companies WHERE company_id = ?")
          .get(duplicateCompanyId),
      ),
    ).toBeUndefined();
    expect(
      (await upgraded.getConversation(seeded.conversationId)).company,
    ).toMatchObject({ companyId: company.companyId });
    expect(await upgraded.listIndustries()).toEqual([
      expect.objectContaining({
        name: "人工智能与企业服务",
        companyCount: 1,
        materialCount: 1,
      }),
    ]);
    expect(
      (await upgraded.getIndustry((await upgraded.listIndustries())[0]!.industryId))
        .companies,
    ).toEqual([
      expect.objectContaining({
        company: expect.objectContaining({ companyId: company.companyId }),
      }),
    ]);
    expectDatabaseIntegrity(dataRoot);
    expectCurrentSchema(dataRoot);
  });
});

async function createDataRoot(): Promise<string> {
  const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-platform-migration-"));
  roots.push(dataRoot);
  return dataRoot;
}

function openPlatform(dataRoot: string): PlatformModule {
  const platform = createPlatformModule({
    dataRoot,
    analysis: createDeterministicAnalysisAdapter(),
  });
  modules.push(platform);
  return platform;
}

function closeModule(platform: PlatformModule): void {
  platform.close();
  modules.splice(modules.indexOf(platform), 1);
}

async function seedMaterial(
  platform: PlatformModule,
  sourceMessageId: string,
): Promise<{ conversationId: string; industryId: string }> {
  const ingested = await platform.ingestDocument({
    fileName: "迁移兼容性 BP.txt",
    mimeType: "text/plain",
    sourceChannel: "feishu",
    sourceMessageId,
    content: chunks(
      "迁移兼容科技有限公司\n公司位于人工智能产业中游，提供工业软件。",
    ),
  });
  for (let index = 0; index < 20; index += 1) {
    if ((await platform.runPendingSteps()) === 0) break;
  }
  const industry = (await platform.listIndustries())[0];
  if (!industry) throw new Error("seed industry missing");
  return {
    conversationId: ingested.conversation.conversationId,
    industryId: industry.industryId,
  };
}

async function* chunks(value: string): AsyncGenerator<Uint8Array> {
  yield Buffer.from(value);
}

function convertCurrentDatabaseToMainV12(dataRoot: string): void {
  withDatabase(dataRoot, (database) => {
    database.exec("PRAGMA foreign_keys = OFF");
    database.exec(`
      DROP TABLE industry_web_search_results;
      DROP TABLE industry_research_runs;
      DROP TABLE conversation_industries;
      ALTER TABLE company_research_runs DROP COLUMN workflow_context_json;
      ALTER TABLE company_research_runs DROP COLUMN workflow_skill;
      DROP TABLE notification_reads;
      ALTER TABLE industries DROP COLUMN watched;
      ALTER TABLE industries DROP COLUMN version;
      ALTER TABLE intake_idempotency RENAME TO intake_idempotency_current;
      CREATE TABLE intake_idempotency (
        source_channel TEXT NOT NULL,
        source_message_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
        created_at TEXT NOT NULL,
        PRIMARY KEY (source_channel, source_message_id),
        UNIQUE (conversation_id)
      );
      INSERT INTO intake_idempotency (
        source_channel, source_message_id, conversation_id, created_at
      )
      SELECT source_channel, source_message_id, conversation_id, created_at
      FROM intake_idempotency_current;
      DROP TABLE intake_idempotency_current;
      DELETE FROM schema_migrations WHERE version >= 13;
    `);
  });
}

function convertCurrentDatabaseToFeatureV13(dataRoot: string): void {
  withDatabase(dataRoot, (database) => {
    database.exec("PRAGMA foreign_keys = OFF");
    database.exec(`
      DROP TABLE intake_idempotency;
      DELETE FROM schema_migrations WHERE version >= 14;
    `);
  });
}

function expectCurrentSchema(dataRoot: string): void {
  expectSchemaHistory(dataRoot, CURRENT_SCHEMA_VERSION);
  expect(tableExists(dataRoot, "intake_idempotency")).toBe(true);
  expect(columnNames(dataRoot, "intake_idempotency")).toContain(
    "source_attachment_key",
  );
  expect(tableExists(dataRoot, "notification_reads")).toBe(true);
  expect(tableExists(dataRoot, "industry_research_runs")).toBe(true);
  expect(tableExists(dataRoot, "company_quick_card_results")).toBe(true);
  expect(tableExists(dataRoot, "fund_profiles")).toBe(true);
  expect(tableExists(dataRoot, "people")).toBe(true);
  expect(tableExists(dataRoot, "company_person_relations")).toBe(true);
  expect(tableExists(dataRoot, "company_relation_insights")).toBe(true);
  expect(tableExists(dataRoot, "company_copilot_threads")).toBe(true);
  expect(tableExists(dataRoot, "company_copilot_messages")).toBe(true);
  withDatabase(dataRoot, (database) => {
    const funds = database.prepare(`
      SELECT fund_id, investment_period_active, capital_available
      FROM fund_profiles ORDER BY fund_id
    `).all();
    expect(funds).toEqual([
      { fund_id: "F01", investment_period_active: 0, capital_available: 0 },
      { fund_id: "F02", investment_period_active: 1, capital_available: 1 },
      { fund_id: "F03", investment_period_active: 1, capital_available: 1 },
      { fund_id: "F04", investment_period_active: 1, capital_available: 1 },
    ]);
  });
  expect(columnNames(dataRoot, "industries")).toEqual(
    expect.arrayContaining(["watched", "version"]),
  );
  expect(columnNames(dataRoot, "company_research_runs")).toEqual(
    expect.arrayContaining(["workflow_skill", "workflow_context_json"]),
  );
  expect(columnNames(dataRoot, "company_relation_insights")).toContain(
    "source_kind",
  );
  expect(columnNames(dataRoot, "company_relations")).toEqual(
    expect.arrayContaining(["from_category", "to_category"]),
  );
  withDatabase(dataRoot, (database) => {
    const sourceKind = database.prepare(`
      SELECT dflt_value, "notnull" AS not_null
      FROM pragma_table_info('company_relation_insights')
      WHERE name = 'source_kind'
    `).get();
    expect(sourceKind).toEqual({ dflt_value: "'bp_self_report'", not_null: 1 });
  });
  expect(columnNames(dataRoot, "companies")).toEqual(
    expect.arrayContaining([
      "subject_kind",
      "subject_kind_status",
      "suggested_subject_kind",
      "subject_kind_reason",
    ]),
  );
  expect(tableExists(dataRoot, "subject_company_links")).toBe(true);
}

function expectSchemaHistory(dataRoot: string, latestVersion: number): void {
  withDatabase(dataRoot, (database) => {
    const versions = database
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all() as unknown as Array<{ version: number }>;
    expect(versions.at(-1)?.version).toBe(latestVersion);
  });
}

function expectDatabaseIntegrity(dataRoot: string): void {
  withDatabase(dataRoot, (database) => {
    const quickCheck = database.prepare("PRAGMA quick_check").all() as unknown as Array<{
      quick_check: string;
    }>;
    const foreignKeyErrors = database.prepare("PRAGMA foreign_key_check").all();
    expect(quickCheck).toEqual([{ quick_check: "ok" }]);
    expect(foreignKeyErrors).toEqual([]);
  });
}

function tableExists(dataRoot: string, tableName: string): boolean {
  return withDatabase(dataRoot, (database) =>
    Boolean(
      database
        .prepare(
          "SELECT 1 AS present FROM sqlite_schema WHERE type = 'table' AND name = ?",
        )
        .get(tableName),
    ),
  );
}

function columnNames(dataRoot: string, tableName: string): string[] {
  return withDatabase(dataRoot, (database) =>
    (
      database
        .prepare(`PRAGMA table_info(${tableName})`)
        .all() as unknown as Array<{
        name: string;
      }>
    ).map((column) => column.name),
  );
}

function intakeAttachmentKeys(
  dataRoot: string,
  sourceMessageId: string,
): string[] {
  return withDatabase(dataRoot, (database) =>
    (
      database
        .prepare(
          `SELECT source_attachment_key
           FROM intake_idempotency
           WHERE source_message_id = ?
           ORDER BY source_attachment_key`,
        )
        .all(sourceMessageId) as unknown as Array<{
        source_attachment_key: string;
      }>
    ).map((row) => row.source_attachment_key),
  );
}

function withDatabase<T>(
  dataRoot: string,
  run: (database: DatabaseSync) => T,
): T {
  const database = new DatabaseSync(
    join(dataRoot, "database", "platform.sqlite"),
  );
  try {
    return run(database);
  } finally {
    database.close();
  }
}
