// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import {
  BP_SECTION_KEYS,
  type MaterialAnalysisPort,
} from "../server/research-platform/analysis/contracts.js";
import type {
  CompanyCopilotInput,
  CompanyCopilotPort,
} from "../server/research-platform/copilot/contracts.js";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createPlatformModule } from "../server/research-platform/platform-module.js";
import { createDemoServices } from "../server/platform/runtime.js";
import { initialStoreData, Store } from "../server/store.js";

const roots: string[] = [];
const modules: PlatformModule[] = [];

afterEach(async () => {
  while (modules.length) modules.pop()?.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("公司实体合并与 Copilot 并发边界", () => {
  it("合并两个已有分析和 Copilot 的公司后，在目标公司保留实体数据与双方对话历史", async () => {
    const inputs: CompanyCopilotInput[] = [];
    const companyCopilot: CompanyCopilotPort = {
      async chat(input) {
        inputs.push(input);
        return {
          sessionId: input.sessionId ?? `session-${input.companyId}`,
          providerId: "openai",
          modelId: "gpt-5.6-sol",
          answer: `回答：${input.question}`,
        };
      },
    };
    const { app, platform } = await testPlatform(companyCopilot);
    const sourceCompanyId = await seedCompany(
      app,
      platform,
      "源景科技有限公司.txt",
      "源景科技有限公司由林源担任 CEO，北辰云为其提供算力。",
    );
    const targetCompanyId = await seedCompany(
      app,
      platform,
      "目标科技有限公司.txt",
      "目标科技有限公司由周目担任 CEO，星海集团是其标杆客户。",
    );

    for (const [companyId, question] of [
      [sourceCompanyId, "源公司有什么特点？"],
      [targetCompanyId, "目标公司有什么特点？"],
    ] as const) {
      const emptyThread = await request(app).get(
        `/api/v1/companies/${encodeURIComponent(companyId)}/copilot`,
      );
      expect(emptyThread.status).toBe(200);
      expect(emptyThread.body.messages).toEqual([]);
      const reply = await request(app)
        .post(`/api/v1/companies/${encodeURIComponent(companyId)}/copilot/messages`)
        .send({ content: question });
      expect(reply.status).toBe(200);
      expect(reply.body.messages).toHaveLength(2);
    }

    const targetBefore = await platform.getCompany(targetCompanyId);
    await platform.resolveSubject({
      companyId: targetCompanyId,
      expectedVersion: targetBefore.version,
      action: "confirm",
      subjectKind: "legal_company",
    });
    const sourceBefore = await platform.getCompany(sourceCompanyId);
    const merged = await platform.resolveSubject({
      companyId: sourceCompanyId,
      expectedVersion: sourceBefore.version,
      action: "merge",
      targetCompanyId,
    });

    expect(merged.companyId).toBe(targetCompanyId);
    expect(merged.people.map((person) => person.name)).toEqual(
      expect.arrayContaining(["林源", "周目"]),
    );
    expect(merged.relationInsights.map((insight) => insight.targetName)).toEqual(
      expect.arrayContaining(["北辰云", "星海集团"]),
    );
    const mergedThread = await request(app).get(
      `/api/v1/companies/${encodeURIComponent(targetCompanyId)}/copilot`,
    );
    expect(mergedThread.status).toBe(200);
    expect(mergedThread.body.messages).toHaveLength(4);
    expect(mergedThread.body.messages.map((message: { content: string }) => message.content)).toEqual(
      expect.arrayContaining([
        "源公司有什么特点？",
        "回答：源公司有什么特点？",
        "目标公司有什么特点？",
        "回答：目标公司有什么特点？",
      ]),
    );

    const continued = await platform.sendCompanyCopilotMessage(
      targetCompanyId,
      "合并后继续分析",
    );
    expect(inputs[2]?.sessionId).toBeUndefined();
    expect(inputs[2]?.context.conversationHistory).toHaveLength(4);
    expect(inputs[2]?.context.conversationHistory?.map((turn) => turn.content)).toEqual(
      expect.arrayContaining([
        "源公司有什么特点？",
        "回答：源公司有什么特点？",
        "目标公司有什么特点？",
        "回答：目标公司有什么特点？",
      ]),
    );
    expect(continued.messages).toHaveLength(6);
  });

  it("同一公司并发发送两问时，第二问等待第一问并复用其 Session", async () => {
    const inputs: CompanyCopilotInput[] = [];
    let markFirstStarted!: () => void;
    let releaseFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const companyCopilot: CompanyCopilotPort = {
      async chat(input) {
        inputs.push(input);
        if (inputs.length === 1) {
          markFirstStarted();
          await firstGate;
        }
        return {
          sessionId: input.sessionId ?? "shared-company-session",
          providerId: "openai",
          modelId: "gpt-5.6-sol",
          answer: `回答：${input.question}`,
        };
      },
    };
    const { app, platform } = await testPlatform(companyCopilot);
    const companyId = await seedCompany(
      app,
      platform,
      "并发科技有限公司.txt",
      "并发科技有限公司由陈并担任 CEO，东河云为其提供算力。",
    );

    const first = platform.sendCompanyCopilotMessage(companyId, "第一问");
    await firstStarted;
    const second = platform.sendCompanyCopilotMessage(companyId, "第二问");
    releaseFirst();
    const [, thread] = await Promise.all([first, second]);

    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.sessionId).toBeUndefined();
    expect(inputs[1]?.sessionId).toBe("shared-company-session");
    expect(thread.messages).toHaveLength(4);
  });
});

async function testPlatform(companyCopilot: CompanyCopilotPort) {
  const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-entity-merge-"));
  roots.push(dataRoot);
  const platform = createPlatformModule({
    dataRoot,
    analysis: entityAnalysisAdapter(),
    companyCopilot,
  });
  modules.push(platform);
  const store = new Store({ initialData: initialStoreData(), persistToDisk: false });
  return {
    platform,
    app: createApp(store, createDemoServices(store), { researchPlatform: platform }),
  };
}

async function seedCompany(
  app: ReturnType<typeof createApp>,
  platform: PlatformModule,
  fileName: string,
  content: string,
): Promise<string> {
  const uploaded = await request(app)
    .post("/api/v1/documents")
    .attach("file", Buffer.from(content), fileName);
  expect(uploaded.status).toBe(201);
  await drainPipeline(platform);
  const conversation = await platform.getConversation(
    uploaded.body.conversation.conversationId as string,
  );
  expect(conversation.company?.companyId).toEqual(expect.any(String));
  return conversation.company!.companyId;
}

function entityAnalysisAdapter(): MaterialAnalysisPort {
  return {
    async analyze(input) {
      const block = input.blocks.find((item) => item.text.trim())!;
      const source = input.companyName.includes("源景");
      const target = input.companyName.includes("目标");
      const personName = source ? "林源" : target ? "周目" : "陈并";
      const relation = source
        ? { targetName: "北辰云", category: "upstream" as const, relationType: "算力供应商" }
        : target
          ? { targetName: "星海集团", category: "customer" as const, relationType: "标杆客户" }
          : { targetName: "东河云", category: "upstream" as const, relationType: "算力供应商" };
      const sections = BP_SECTION_KEYS.map((key) => ({
        key,
        summary: key === "founders_team_and_governance" ? `${personName}担任 CEO。` : "材料未披露",
        blockIds: key === "founders_team_and_governance" ? [block.blockId] : [],
      }));
      return {
        providerId: "entity-merge-test",
        modelId: "fixture-v1",
        variant: "deterministic",
        sessionId: `analysis-${input.taskId}`,
        toolUsage: [],
        sections,
        candidates: [],
        people: [{
          name: personName,
          role: "CEO",
          summary: `${personName}负责公司经营。`,
          blockIds: [block.blockId],
        }],
        relations: [{
          ...relation,
          description: `${relation.targetName}与公司存在${relation.relationType}关系。`,
          blockIds: [block.blockId],
        }],
        rawText: "{}",
      };
    },
  };
}

async function drainPipeline(platform: PlatformModule): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    if (await platform.runPendingSteps() === 0) return;
  }
  throw new Error("pipeline did not become idle");
}
