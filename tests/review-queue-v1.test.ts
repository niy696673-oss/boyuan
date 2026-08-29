// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app.js";
import { createDemoServices } from "../server/platform/runtime.js";
import { createDeterministicAnalysisAdapter } from "../server/research-platform/analysis/deterministic-analysis.js";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createPlatformModule } from "../server/research-platform/platform-module.js";
import { initialStoreData, Store } from "../server/store.js";

const roots: string[] = [];
const modules: PlatformModule[] = [];

vi.setConfig({ testTimeout: 15_000 });

afterEach(async () => {
  while (modules.length) modules.pop()?.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("研究平台 v1 待确认队列接缝", () => {
  it("返回页面可直接使用的持久候选、公司、证据和已有知识", async () => {
    const { app, platform } = await fixture();
    await seedCandidate(app, platform);

    const response = await request(app).get("/api/v1/review-queue");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      total: 1,
      items: [
        {
          status: "pending",
          version: 1,
          knowledgeType: "company_summary",
          company: { canonicalName: "白杨智能有限公司" },
          evidence: [
            {
              sourceType: "material",
              fileName: "白杨智能 BP.txt",
              quote: "白杨智能有限公司",
            },
          ],
          currentKnowledge: [],
        },
      ],
    });
    expect(response.body.items[0].candidateId).toEqual(expect.any(String));
  });

  it("确认候选后生成正式知识，并在重启后保持已处理状态", async () => {
    const { app, dataRoot, platform, store } = await fixture();
    const candidate = await seedCandidate(app, platform);

    const confirmed = await request(app)
      .post(`/api/v1/review-queue/${candidate.candidateId}/decision`)
      .send({ expectedVersion: candidate.version, action: "confirm" });

    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({
      candidate: { status: "confirmed", version: 2 },
      currentKnowledge: [
        {
          status: "current",
          version: 1,
          sourceCandidateId: candidate.candidateId,
          evidence: [{ sourceType: "material", fileName: "白杨智能 BP.txt" }],
        },
      ],
      remainingCount: 0,
    });
    expect((await request(app).get("/api/v1/review-queue")).body).toMatchObject(
      {
        items: [],
        total: 0,
      },
    );

    platform.close();
    modules.splice(modules.indexOf(platform), 1);
    const reopened = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
    });
    modules.push(reopened);
    const restarted = createApp(store, createDemoServices(store), {
      researchPlatform: reopened,
    });

    expect(
      (await request(restarted).get("/api/v1/review-queue")).body,
    ).toMatchObject({ items: [], total: 0 });
    const stale = await request(restarted)
      .post(`/api/v1/review-queue/${candidate.candidateId}/decision`)
      .send({ expectedVersion: candidate.version, action: "reject" });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "version_conflict" });
  });

  it("修改确认后以新陈述生成正式知识", async () => {
    const { app, platform } = await fixture();
    const candidate = await seedCandidate(app, platform);

    const response = await request(app)
      .post(`/api/v1/review-queue/${candidate.candidateId}/decision`)
      .send({
        expectedVersion: candidate.version,
        action: "modify",
        statement: "白杨智能专注制造业智能化服务。",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      candidate: {
        status: "modified_confirmed",
        statement: "白杨智能专注制造业智能化服务。",
        version: 2,
      },
      currentKnowledge: [
        {
          statement: "白杨智能专注制造业智能化服务。",
          status: "current",
          sourceCandidateId: candidate.candidateId,
        },
      ],
      remainingCount: 0,
    });
  });

  it("驳回后不生成正式知识并清空待确认队列", async () => {
    const { app, platform } = await fixture();
    const candidate = await seedCandidate(app, platform);

    const response = await request(app)
      .post(`/api/v1/review-queue/${candidate.candidateId}/decision`)
      .send({ expectedVersion: candidate.version, action: "reject" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      candidate: { status: "rejected", version: 2 },
      currentKnowledge: [],
      remainingCount: 0,
    });
    expect((await request(app).get("/api/v1/review-queue")).body).toMatchObject(
      { items: [], total: 0 },
    );
  });

  it("按主体、13 维和知识类型压缩重复候选，并保护批量确认边界", async () => {
    const { app, dataRoot, platform } = await fixture();
    await seedCandidate(app, platform);
    const before = await request(app).get("/api/v1/review-queue");
    const safe = before.body.items.find(
      (item: {
        highImpact: boolean;
        sensitive: boolean;
        status: string;
        evidence: unknown[];
      }) =>
        !item.highImpact
        && !item.sensitive
        && item.status === "pending"
        && item.evidence.length > 0,
    );
    expect(safe).toBeTruthy();
    const duplicateId = "candidate-duplicate-safe";
    const database = new DatabaseSync(join(dataRoot, "database", "platform.sqlite"));
    database.prepare(`
      INSERT INTO knowledge_candidates (
        candidate_id, task_id, company_id, section_key, knowledge_type,
        statement, value, effective_at, status, version, high_impact,
        sensitive, created_at, updated_at
      )
      SELECT ?, task_id, company_id, section_key, knowledge_type,
        '  ' || statement || '。 ', value, effective_at, status, version,
        high_impact, sensitive, created_at, updated_at
      FROM knowledge_candidates WHERE candidate_id = ?
    `).run(duplicateId, safe.candidateId);
    database.prepare(`
      INSERT INTO candidate_evidence (
        candidate_id, evidence_id, status, updated_at
      )
      SELECT ?, evidence_id, status, updated_at
      FROM candidate_evidence WHERE candidate_id = ?
    `).run(duplicateId, safe.candidateId);
    database.close();

    const grouped = await request(app).get("/api/v1/review-queue");
    expect(grouped.status).toBe(200);
    expect(grouped.body).toMatchObject({
      packageTotal: 1,
      packages: [
        {
          company: { companyId: safe.companyId },
          candidateCount: before.body.total + 1,
          groupCount: expect.any(Number),
        },
      ],
    });
    const cluster = grouped.body.packages[0].groups
      .flatMap((group: { clusters: unknown[] }) => group.clusters)
      .find(
        (item: { candidateIds: string[] }) =>
          item.candidateIds.includes(safe.candidateId),
      );
    expect(cluster).toMatchObject({
      candidateCount: 2,
      safeToConfirm: true,
    });

    const batched = await request(app)
      .post("/api/v1/review-queue/batch-decision")
      .send({
        decisions: [
          {
            candidateId: safe.candidateId,
            expectedVersion: safe.version,
            action: "confirm",
          },
          {
            candidateId: duplicateId,
            expectedVersion: safe.version,
            action: "reject",
          },
        ],
      });
    expect(batched.status).toBe(200);
    expect(batched.body.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ candidateId: safe.candidateId, status: "confirmed" }),
        expect.objectContaining({ candidateId: duplicateId, status: "rejected" }),
      ]),
    );

    const risky = (await request(app).get("/api/v1/review-queue")).body.items.find(
      (item: { highImpact: boolean; sensitive: boolean; status: string }) =>
        item.highImpact || item.sensitive || item.status === "conflicted",
    );
    if (risky) {
      const protectedResponse = await request(app)
        .post("/api/v1/review-queue/batch-decision")
        .send({
          decisions: [
            {
              candidateId: risky.candidateId,
              expectedVersion: risky.version,
              action: "confirm",
            },
          ],
        });
      expect(protectedResponse.status).toBe(400);
      expect(protectedResponse.body).toMatchObject({
        error: "unsafe_batch_confirmation",
      });
    }
  });
});

async function seedCandidate(
  app: ReturnType<typeof createApp>,
  platform: PlatformModule,
) {
  const uploaded = await request(app)
    .post("/api/v1/documents")
    .attach(
      "file",
      Buffer.from("白杨智能有限公司\n公司专注企业智能化服务。"),
      "白杨智能 BP.txt",
    );
  expect(uploaded.status).toBe(201);
  for (let index = 0; index < 20; index += 1) {
    if ((await platform.runPendingSteps()) === 0) break;
  }
  const queue = await request(app).get("/api/v1/review-queue");
  expect(queue.status).toBe(200);
  const candidate = queue.body.items[0] as {
    candidateId: string;
    version: number;
  };
  expect(candidate).toBeTruthy();
  return candidate;
}

async function fixture() {
  const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-review-queue-v1-"));
  roots.push(dataRoot);
  const platform = createPlatformModule({
    dataRoot,
    analysis: createDeterministicAnalysisAdapter(),
  });
  modules.push(platform);
  const store = new Store({
    initialData: initialStoreData(),
    persistToDisk: false,
  });
  return {
    dataRoot,
    platform,
    store,
    app: createApp(store, createDemoServices(store), {
      researchPlatform: platform,
    }),
  };
}
