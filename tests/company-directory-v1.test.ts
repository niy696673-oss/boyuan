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

describe("研究平台 v1 公司目录接缝", () => {
  it("返回持久公司及页面所需的材料、正式知识和待确认计数", async () => {
    const { app, platform } = await fixture();
    await seedConfirmedCompany(app, platform);

    const response = await request(app).get("/api/v1/companies");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      total: 1,
      items: [
        {
          canonicalName: "云杉智能有限公司",
          materialCount: 1,
          knowledgeCount: 1,
          pendingCandidateCount: 0,
          profile: {
            summary: {
              value: expect.any(String),
              state: "confirmed",
            },
          },
        },
      ],
    });
    expect(response.body.items[0].companyId).toEqual(expect.any(String));
  });

  it("返回公司正式知识、证据和材料，并在重启后保持一致", async () => {
    const { app, dataRoot, platform, store } = await fixture();
    const companyId = await seedConfirmedCompany(app, platform);

    const response = await request(app).get(`/api/v1/companies/${companyId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      companyId,
      canonicalName: "云杉智能有限公司",
      materialCount: 1,
      pendingCandidateCount: 0,
      materials: [{ fileName: "云杉智能 BP.txt" }],
      knowledge: [
        {
          statement: expect.any(String),
          status: "current",
          evidence: [
            {
              sourceType: "material",
              fileName: "云杉智能 BP.txt",
              quote: "云杉智能有限公司",
            },
          ],
        },
      ],
    });

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

    const afterRestart = await request(restarted).get(
      `/api/v1/companies/${companyId}`,
    );
    expect(afterRestart.status).toBe(200);
    expect(afterRestart.body).toMatchObject({
      companyId,
      materialCount: 1,
      knowledge: [{ statement: expect.any(String) }],
    });
  });

  it("未知公司返回 404，而不是其他公司的档案", async () => {
    const { app } = await fixture();

    const response = await request(app).get("/api/v1/companies/not-found");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: "not_found" });
  });
});

async function seedConfirmedCompany(
  app: ReturnType<typeof createApp>,
  platform: PlatformModule,
) {
  const uploaded = await request(app)
    .post("/api/v1/documents")
    .attach(
      "file",
      Buffer.from("云杉智能有限公司\n公司专注企业智能化服务。"),
      "云杉智能 BP.txt",
    );
  expect(uploaded.status).toBe(201);
  for (let index = 0; index < 20; index += 1) {
    if ((await platform.runPendingSteps()) === 0) break;
  }
  const queue = await request(app).get("/api/v1/review-queue");
  expect(queue.status).toBe(200);
  const candidate = queue.body.items[0] as {
    candidateId: string;
    companyId: string;
    version: number;
  };
  expect(candidate).toBeTruthy();
  const confirmed = await request(app)
    .post(`/api/v1/review-queue/${candidate.candidateId}/decision`)
    .send({ expectedVersion: candidate.version, action: "confirm" });
  expect(confirmed.status).toBe(200);
  return candidate.companyId;
}

async function fixture() {
  const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-company-v1-"));
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
