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

describe("研究平台 v1 行业目录接缝", () => {
  it("从材料分析结果返回持久行业、产业节点、材料和公司", async () => {
    const { app, platform } = await fixture();
    await seedIndustry(app, platform);

    const directory = await request(app).get("/api/v1/industries");
    expect(directory.status).toBe(200);
    expect(directory.body).toMatchObject({
      total: 1,
      unclassifiedMaterialCount: 0,
      items: [
        {
          name: "人工智能",
          materialCount: 1,
          companyCount: 1,
        },
      ],
    });

    const industryId = directory.body.items[0].industryId as string;
    const detail = await request(app).get(`/api/v1/industries/${industryId}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      industryId,
      name: "人工智能",
      nodes: [
        { stage: "upstream" },
        { stage: "midstream" },
        { stage: "downstream" },
      ],
      materials: [{ fileName: "云杉智能 BP.txt" }],
      companies: [
        {
          company: { canonicalName: "云杉智能有限公司" },
          nodeName: "产品与解决方案",
        },
      ],
    });
  });

  it("返回尚未形成行业证据的持久材料数量", async () => {
    const { app, platform } = await fixture();
    const uploaded = await request(app)
      .post("/api/v1/documents")
      .attach(
        "file",
        Buffer.from("木棉软件有限公司\n公司专注企业智能化服务。"),
        "木棉软件 BP.txt",
      );
    expect(uploaded.status).toBe(201);
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    const directory = await request(app).get("/api/v1/industries");
    expect(directory.status).toBe(200);
    expect(directory.body).toMatchObject({
      items: [],
      total: 0,
      unclassifiedMaterialCount: 1,
    });
  });

  it("行业详情在 SQLite 重启后保持一致，未知 ID 返回 404", async () => {
    const { app, dataRoot, platform, store } = await fixture();
    await seedIndustry(app, platform);
    const directory = await request(app).get("/api/v1/industries");
    const industryId = directory.body.items[0].industryId as string;

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

    const detail = await request(restarted).get(
      `/api/v1/industries/${industryId}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      industryId,
      materialCount: 1,
      companyCount: 1,
    });
    const missing = await request(restarted).get("/api/v1/industries/missing");
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: "not_found" });
  });
});

async function seedIndustry(
  app: ReturnType<typeof createApp>,
  platform: PlatformModule,
) {
  const uploaded = await request(app)
    .post("/api/v1/documents")
    .attach(
      "file",
      Buffer.from(
        "云杉智能有限公司\n公司专注企业智能化服务。\n公司位于人工智能产业中游，提供工业软件。",
      ),
      "云杉智能 BP.txt",
    );
  expect(uploaded.status).toBe(201);
  for (let index = 0; index < 20; index += 1) {
    if ((await platform.runPendingSteps()) === 0) break;
  }
}

async function fixture() {
  const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-industry-v1-"));
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
