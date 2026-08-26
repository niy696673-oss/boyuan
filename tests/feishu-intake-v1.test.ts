// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { createDemoServices } from "../server/platform/runtime.js";
import { createDeterministicAnalysisAdapter } from "../server/research-platform/analysis/deterministic-analysis.js";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createFeishuIntakeRouter } from "../server/research-platform/feishu-intake-router.js";
import { createPlatformModule } from "../server/research-platform/platform-module.js";
import type { QuickCardAnalysisPort } from "../server/research-platform/quick-card/contracts.js";
import { initialStoreData, Store } from "../server/store.js";

const roots: string[] = [];
const modules: PlatformModule[] = [];

afterEach(async () => {
  while (modules.length) modules.pop()?.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("飞书材料接入新工作台", () => {
  it("使用独立密钥创建飞书对话，并在深度任务运行期间返回快速卡", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-feishu-v1-"));
    roots.push(dataRoot);
    const quickCardAnalysis: QuickCardAnalysisPort = {
      analyze: async () => ({
        companyName: "白杨智能",
        companyIdentity: "北京白杨智能科技有限公司，总部位于北京，成立于2018年",
        industryTrack: "特种具身智能",
        financing: "已完成A轮及A+轮融资",
        keyPeople: "龙HT董事长、总经理",
        highlights: ["国家级专精特新小巨人"],
        competitorNames: ["Google DeepMind", "Anduril", "Shield AI"],
        upstreamNames: [],
        downstreamNames: [],
        providerId: "openai",
        modelId: "gpt-5.6-luna",
        variant: "none",
        sessionId: "quick-session",
      }),
    };
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
      quickCardAnalysis,
    });
    modules.push(platform);
    const store = new Store({
      initialData: initialStoreData(),
      persistToDisk: false,
    });
    const app = createApp(store, createDemoServices(store), {
      researchPlatform: platform,
      feishuIntakeKey: "test-feishu-intake-key-123",
    });

    const denied = await request(app)
      .post("/api/v1/feishu/documents")
      .set("x-boyuan-intake-key", "wrong-key-value-12345")
      .set("x-boyuan-message-id", "om_denied")
      .attach("file", Buffer.from("白杨智能商业计划书"), "白杨智能BP.txt");
    expect(denied.status).toBe(401);
    expect(denied.body).toEqual({ error: "invalid_intake_key" });

    const uploaded = await request(app)
      .post("/api/v1/feishu/documents")
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123")
      .set("x-boyuan-message-id", "om_feishu_material")
      .set("x-boyuan-sender-id", "ou_sender")
      .attach(
        "file",
        Buffer.from("北京白杨智能科技有限公司\n公司专注特种具身智能。"),
        "白杨智能BP.txt",
      );

    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toMatchObject({
      reusedDocument: false,
      conversation: {
        sourceChannel: "feishu",
        title: "白杨智能BP.txt",
        status: "processing",
        task: { status: "queued" },
      },
    });

    const replayed = await request(app)
      .post("/api/v1/feishu/documents")
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123")
      .set("x-boyuan-message-id", "om_feishu_material")
      .set("x-boyuan-sender-id", "ou_sender")
      .attach(
        "file",
        Buffer.from("同一条飞书消息重试时不应新建对话"),
        "重试副本.txt",
      );
    expect(replayed.status).toBe(201);
    expect(replayed.body).toMatchObject({
      reusedDocument: true,
      conversation: {
        conversationId: uploaded.body.conversation.conversationId,
        title: "白杨智能BP.txt",
      },
    });
    expect(await platform.listConversations()).toHaveLength(1);

    const conversationId = uploaded.body.conversation.conversationId as string;
    const quick = await request(app)
      .post(
        `/api/v1/feishu/conversations/${encodeURIComponent(conversationId)}/quick-card`,
      )
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123");

    expect(quick.status).toBe(200);
    expect(quick.body).toMatchObject({
      companyName: "白杨智能",
      industryTrack: "特种具身智能",
      competitorNames: ["Google DeepMind", "Anduril", "Shield AI"],
      confidenceLevel: "中",
      navigation: {},
      modelId: "gpt-5.6-luna",
    });

    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }
    const completed = await request(app).get(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
    );
    expect(completed.body).toMatchObject({
      sourceChannel: "feishu",
      status: "completed",
      task: { status: "completed" },
    });
  });

  it("未配置飞书接入密钥时不开放入口", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-feishu-v1-"));
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

    const response = await request(app)
      .post("/api/v1/feishu/documents")
      .set("x-boyuan-intake-key", "unconfigured-key")
      .set("x-boyuan-message-id", "om_unavailable")
      .attach("file", Buffer.from("x"), "x.txt");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "feishu_intake_unavailable" });
  });

  it("只把研究行业映射为产品 UI 中真实存在的产业链 ID", async () => {
    const platform = {
      quickAnalyzeConversation: async () => ({
        companyName: "白杨智能",
        companyIdentity: "北京白杨智能科技有限公司",
        industryTrack: "特种具身智能",
        financing: "材料未披露",
        keyPeople: "材料未披露",
        highlights: [],
        competitorNames: [],
        upstreamNames: [],
        downstreamNames: [],
        providerId: "openai",
        modelId: "gpt-5.6-luna",
        variant: "none",
        sessionId: "quick-session",
        confidence: 50,
        confidenceLevel: "中" as const,
        navigation: {
          companyId: "research-company",
          industryId: "research-industry",
        },
      }),
      getIndustry: async () => ({ name: "具身智能" }),
    } as unknown as PlatformModule;
    const app = express();
    app.use(
      "/api/v1/feishu",
      createFeishuIntakeRouter(platform, "test-feishu-intake-key-123", {
        resolveProductIndustryId: (name) =>
          name === "具身智能" ? "product-industry" : undefined,
      }),
    );

    const response = await request(app)
      .post("/api/v1/feishu/conversations/conversation/quick-card")
      .set("x-boyuan-intake-key", "test-feishu-intake-key-123");

    expect(response.status).toBe(200);
    expect(response.body.navigation).toEqual({
      companyId: "research-company",
      industryId: "product-industry",
    });
  });
});
