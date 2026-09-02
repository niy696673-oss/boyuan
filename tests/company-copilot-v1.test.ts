// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { createDemoServices } from "../server/platform/runtime.js";
import { createDeterministicAnalysisAdapter } from "../server/research-platform/analysis/deterministic-analysis.js";
import type {
  CompanyCopilotInput,
  CompanyCopilotPort,
} from "../server/research-platform/copilot/contracts.js";
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

describe("公司 Copilot v1 HTTP 接缝", () => {
  it("连续两问复用公司 OpenCode Session，并在重启后恢复消息历史", async () => {
    const inputs: CompanyCopilotInput[] = [];
    const companyCopilot: CompanyCopilotPort = {
      async chat(input) {
        inputs.push(input);
        return {
          sessionId: input.sessionId ?? "opencode-company-session-1",
          providerId: "openai",
          modelId: "gpt-5.6-sol",
          answer: inputs.length === 1 ? "第一轮回答" : "第二轮回答",
        };
      },
    };
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-copilot-v1-"));
    roots.push(dataRoot);
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
      companyCopilot,
    });
    modules.push(platform);
    const store = new Store({
      initialData: initialStoreData(),
      persistToDisk: false,
    });
    const app = createApp(store, createDemoServices(store), {
      researchPlatform: platform,
    });
    const companyId = await seedCompany(app, platform);

    const emptyThread = await request(app).get(
      `/api/v1/companies/${encodeURIComponent(companyId)}/copilot`,
    );
    expect(emptyThread.status).toBe(200);
    expect(emptyThread.body).toMatchObject({
      companyId,
      status: "idle",
      messages: [],
    });
    const threadId = emptyThread.body.threadId as string;

    const first = await request(app)
      .post(
        `/api/v1/companies/${encodeURIComponent(companyId)}/copilot/messages`,
      )
      .send({ content: "总结这家公司的业务" });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      threadId,
      messages: [
        { role: "user", content: "总结这家公司的业务" },
        { role: "assistant", content: "第一轮回答" },
      ],
    });
    expect(inputs[0]?.sessionId).toBeUndefined();

    const second = await request(app)
      .post(
        `/api/v1/companies/${encodeURIComponent(companyId)}/copilot/messages`,
      )
      .send({ content: "继续说说主要风险" });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      threadId,
      messages: [
        { role: "user", content: "总结这家公司的业务" },
        { role: "assistant", content: "第一轮回答" },
        { role: "user", content: "继续说说主要风险" },
        { role: "assistant", content: "第二轮回答" },
      ],
    });
    expect(inputs[1]?.sessionId).toBe("opencode-company-session-1");

    platform.close();
    modules.splice(modules.indexOf(platform), 1);
    const reopened = createPlatformModule({ dataRoot, companyCopilot });
    modules.push(reopened);
    const restartedApp = createApp(store, createDemoServices(store), {
      researchPlatform: reopened,
    });
    const restored = await request(restartedApp).get(
      `/api/v1/companies/${encodeURIComponent(companyId)}/copilot`,
    );

    expect(restored.status).toBe(200);
    expect(restored.body.threadId).toBe(threadId);
    expect(restored.body.messages).toHaveLength(4);
    expect(restored.body.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "第二轮回答",
    });
    expect(inputs).toHaveLength(2);
  });

  it("拒绝空白或非字符串消息", async () => {
    const platform = {
      sendCompanyCopilotMessage: async () => {
        throw new Error("should_not_be_called");
      },
    } as unknown as PlatformModule;
    const store = new Store({
      initialData: initialStoreData(),
      persistToDisk: false,
    });
    const app = createApp(store, createDemoServices(store), {
      researchPlatform: platform,
    });

    for (const content of ["   ", 42, null]) {
      const response = await request(app)
        .post("/api/v1/companies/company-1/copilot/messages")
        .send({ content });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("invalid_copilot_message");
    }
  });
});

async function seedCompany(
  app: ReturnType<typeof createApp>,
  platform: PlatformModule,
): Promise<string> {
  const uploaded = await request(app)
    .post("/api/v1/documents")
    .attach(
      "file",
      Buffer.from("云杉智能有限公司\n公司专注企业智能化服务。"),
      "云杉智能 BP.txt",
    );
  expect(uploaded.status).toBe(201);
  const conversationId = uploaded.body.conversation.conversationId as string;
  for (let index = 0; index < 20; index += 1) {
    if ((await platform.runPendingSteps()) === 0) break;
  }
  const conversation = await platform.getConversation(conversationId);
  expect(conversation.company?.companyId).toEqual(expect.any(String));
  return conversation.company!.companyId;
}
