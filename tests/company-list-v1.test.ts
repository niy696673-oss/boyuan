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

describe("研究平台 v1 公司名单接缝", () => {
  it("识别已有和新公司，确认后写入持久公司目录", async () => {
    const { app, platform } = await fixture();
    await seedExistingCompany(app, platform);

    const uploaded = await request(app)
      .post("/api/v1/company-lists")
      .attach(
        "file",
        Buffer.from("公司名称\n云杉智能有限公司\n松涛科技有限公司"),
        { filename: "公司名单.csv", contentType: "text/csv" },
      );
    expect(uploaded.status).toBe(201);
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    const conversation = await request(app).get(
      `/api/v1/conversations/${uploaded.body.conversation.conversationId}`,
    );
    expect(conversation.status).toBe(200);
    expect(conversation.body.companyList.rows).toMatchObject([
      { normalizedName: "云杉智能有限公司", matchStatus: "existing" },
      { normalizedName: "松涛科技有限公司", matchStatus: "new" },
    ]);

    const list = conversation.body.companyList;
    const confirmed = await request(app)
      .post(`/api/v1/company-lists/${list.listId}/confirmations`)
      .send({
        rows: list.rows.map((row: {
          rowId: string;
          version: number;
          matchStatus: string;
          normalizedName?: string;
          options: Array<{ companyId: string }>;
        }) => ({
          rowId: row.rowId,
          expectedVersion: row.version,
          ...(row.matchStatus === "existing"
            ? { companyId: row.options[0].companyId }
            : { createName: row.normalizedName }),
        })),
      });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("completed");
    expect(confirmed.body.rows.every((row: { confirmationStatus: string }) => row.confirmationStatus === "confirmed")).toBe(true);

    const companies = await request(app).get("/api/v1/companies");
    expect(companies.body.total).toBe(2);
    expect(companies.body.items.map((item: { canonicalName: string }) => item.canonicalName))
      .toEqual(expect.arrayContaining(["云杉智能有限公司", "松涛科技有限公司"]));
  });

  it("名单和行确认状态在 SQLite 重启后保留", async () => {
    const { app, dataRoot, platform, store } = await fixture();
    const uploaded = await request(app)
      .post("/api/v1/company-lists")
      .attach("file", Buffer.from("公司名称\n松涛科技有限公司"), {
        filename: "公司名单.csv",
        contentType: "text/csv",
      });
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }
    const conversation = await request(app).get(
      `/api/v1/conversations/${uploaded.body.conversation.conversationId}`,
    );
    const list = conversation.body.companyList;
    const row = list.rows[0];
    await request(app)
      .post(`/api/v1/company-lists/${list.listId}/confirmations`)
      .send({ rows: [{ rowId: row.rowId, expectedVersion: row.version, createName: row.normalizedName }] });

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
    const persisted = await request(restarted).get(
      `/api/v1/company-lists/${list.listId}`,
    );
    expect(persisted.status).toBe(200);
    expect(persisted.body).toMatchObject({
      listId: list.listId,
      status: "completed",
      rows: [{ confirmationStatus: "confirmed", company: { canonicalName: "松涛科技有限公司" } }],
    });
  });
});

async function seedExistingCompany(
  app: ReturnType<typeof createApp>,
  platform: PlatformModule,
) {
  const response = await request(app)
    .post("/api/v1/documents")
    .attach("file", Buffer.from("云杉智能有限公司\n公司专注企业智能化服务。"), "云杉智能 BP.txt");
  expect(response.status).toBe(201);
  for (let index = 0; index < 20; index += 1) {
    if ((await platform.runPendingSteps()) === 0) break;
  }
}

async function fixture() {
  const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-company-list-v1-"));
  roots.push(dataRoot);
  const platform = createPlatformModule({
    dataRoot,
    analysis: createDeterministicAnalysisAdapter(),
  });
  modules.push(platform);
  const store = new Store({ initialData: initialStoreData(), persistToDisk: false });
  return {
    dataRoot,
    platform,
    store,
    app: createApp(store, createDemoServices(store), { researchPlatform: platform }),
  };
}
