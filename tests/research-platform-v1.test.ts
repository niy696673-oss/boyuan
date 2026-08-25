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

describe("研究平台 v1 HTTP 接缝", () => {
  it("上传材料后可通过对话 API 查看任务，并在服务重启后恢复", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-research-v1-"));
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
    const app = createApp(store, createDemoServices(store), {
      researchPlatform: platform,
    });

    const uploaded = await request(app)
      .post("/api/v1/documents")
      .attach(
        "file",
        Buffer.from("白杨智能有限公司\n公司专注企业智能化服务。"),
        "白杨智能 BP.txt",
      );

    expect(uploaded.status).toBe(201);
    expect(uploaded.body.reusedDocument).toBe(false);
    expect(uploaded.body.conversation).toMatchObject({
      title: "白杨智能 BP.txt",
      status: "processing",
      document: { fileName: "白杨智能 BP.txt", parseStatus: "queued" },
      task: {
        status: "queued",
        steps: expect.arrayContaining(
          [
            { name: "persist_document", status: "completed" },
            { name: "verify_storage", status: "queued" },
          ].map((step) => expect.objectContaining(step)),
        ),
      },
    });

    const conversationId = uploaded.body.conversation.conversationId as string;
    const listed = await request(app).get("/api/v1/conversations");
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([
      expect.objectContaining({ conversationId, title: "白杨智能 BP.txt" }),
    ]);

    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }
    const completed = await request(app).get(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
    );
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({
      conversationId,
      status: "completed",
      company: { canonicalName: "白杨智能有限公司" },
      document: { parseStatus: "parsed", archiveStatus: "archived" },
      task: { status: "completed", resultStatus: "validated" },
    });
    expect(completed.body.task.steps).toContainEqual(
      expect.objectContaining({
        name: "analyze_material",
        status: "completed",
      }),
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
    const restored = await request(restarted).get("/api/v1/conversations");

    expect(restored.status).toBe(200);
    expect(restored.body).toEqual([
      expect.objectContaining({
        conversationId,
        status: "completed",
        title: "白杨智能 BP.txt",
      }),
    ]);
  });
});
