// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { createDemoServices } from "../server/platform/runtime.js";
import { createDeterministicAnalysisAdapter } from "../server/research-platform/analysis/deterministic-analysis.js";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createPlatformModule } from "../server/research-platform/platform-module.js";
import { initialStoreData, Store } from "../server/store.js";

const roots: string[] = [];
const modules: PlatformModule[] = [];

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
