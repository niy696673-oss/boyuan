// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  BP_SECTION_KEYS,
  type MaterialAnalysisPort,
} from "../server/research-platform/analysis/contracts.js";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createPlatformModule } from "../server/research-platform/platform-module.js";

const roots: string[] = [];
const modules: PlatformModule[] = [];

afterEach(async () => {
  while (modules.length) modules.pop()?.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("公司分析人物与关联全景 v1", () => {
  it("持久化人物和关系证据，并在同一公司的两份材料间复用人物实体", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-analysis-entities-"));
    roots.push(dataRoot);
    const platform = createPlatformModule({
      dataRoot,
      analysis: materialEntityAnalysisAdapter(),
    });
    modules.push(platform);

    const firstUpload = await platform.ingestDocument({
      fileName: "云杉智能有限公司-团队与供应链.txt",
      mimeType: "text/plain",
      sourceChannel: "web",
      content: Readable.from([
        Buffer.from("云杉智能有限公司由张航担任创始人兼 CEO，北斗云为其提供训练云算力。"),
      ]),
    });
    await drainPipeline(platform);
    const firstConversation = await platform.getConversation(
      firstUpload.conversation.conversationId,
    );
    const companyId = firstConversation.company?.companyId;
    expect(companyId).toEqual(expect.any(String));

    const firstDetail = await platform.getCompany(companyId!);
    expect(firstDetail.people).toHaveLength(1);
    const personId = firstDetail.people[0]?.personId;
    expect(firstDetail.people[0]).toMatchObject({
      name: "张航",
      role: "创始人兼 CEO",
      sourceLabel: "云杉智能有限公司-团队与供应链.txt",
      evidence: [
        expect.objectContaining({
          sourceType: "material",
          fileName: "云杉智能有限公司-团队与供应链.txt",
          blockId: expect.any(String),
          quote: expect.stringContaining("北斗云"),
        }),
      ],
    });
    expect(firstDetail.relationInsights).toEqual([
      expect.objectContaining({
        targetName: "北斗云",
        category: "upstream",
        relationType: "云算力供应商",
        evidence: [expect.objectContaining({ blockId: expect.any(String) })],
      }),
    ]);

    await platform.ingestCompanyDocument(companyId!, {
      fileName: "云杉智能有限公司-客户进展.txt",
      mimeType: "text/plain",
      sourceChannel: "web",
      content: Readable.from([
        Buffer.from("创始人兼 CEO 张航负责商业化，星河制造已成为云杉智能有限公司的标杆客户。"),
      ]),
    });
    await drainPipeline(platform);

    const secondDetail = await platform.getCompany(companyId!);
    expect(secondDetail.people).toHaveLength(1);
    expect(secondDetail.people[0]).toMatchObject({
      personId,
      name: "张航",
      sourceLabel: "云杉智能有限公司-客户进展.txt",
      evidence: [
        expect.objectContaining({
          quote: expect.stringContaining("星河制造"),
          blockId: expect.any(String),
        }),
      ],
    });
    expect(secondDetail.relationInsights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetName: "北斗云", category: "upstream" }),
        expect.objectContaining({ targetName: "星河制造", category: "customer" }),
      ]),
    );
    expect(secondDetail.relationInsights.every((item) => item.evidence.length > 0)).toBe(true);
  });
});

function materialEntityAnalysisAdapter(): MaterialAnalysisPort {
  return {
    async analyze(input) {
      const block = input.blocks.find((item) => item.text.trim())!;
      const customerMaterial = input.fileName.includes("客户进展");
      const relation = customerMaterial
        ? {
            targetName: "星河制造",
            category: "customer" as const,
            relationType: "标杆客户",
            description: "材料称星河制造已成为标杆客户。",
            blockIds: [block.blockId],
          }
        : {
            targetName: "北斗云",
            category: "upstream" as const,
            relationType: "云算力供应商",
            description: "材料称北斗云提供训练云算力。",
            blockIds: [block.blockId],
          };
      const sections = BP_SECTION_KEYS.map((key) => ({
        key,
        summary: key === "founders_team_and_governance"
          ? "张航担任创始人兼 CEO。"
          : "材料未披露",
        blockIds: key === "founders_team_and_governance" ? [block.blockId] : [],
      }));
      return {
        providerId: "deterministic-entity-test",
        modelId: "fixture-v1",
        variant: "deterministic",
        sessionId: `entity-${input.taskId}`,
        toolUsage: [],
        sections,
        candidates: [],
        people: [{
          name: "张航",
          role: "创始人兼 CEO",
          summary: customerMaterial ? "负责商业化。" : "负责公司战略。",
          blockIds: [block.blockId],
        }],
        relations: [relation],
        rawText: JSON.stringify({ sections, people: ["张航"], relations: [relation] }),
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
