// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  BP_SECTION_KEYS,
  type MaterialAnalysisPort,
} from "../server/research-platform/analysis/contracts.js";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createPlatformModule } from "../server/research-platform/platform-module.js";
import type { CompanyResearchPort } from "../server/research-platform/research/contracts.js";
import type { WebSearchPort } from "../server/research-platform/search/contracts.js";

const roots: string[] = [];
const modules: PlatformModule[] = [];

afterEach(async () => {
  while (modules.length) modules.pop()?.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("公司关联性全景三来源", () => {
  it("保留 BP 自陈与外部来源的同一关系，并持久化本次搜索的完整 URL", async () => {
    const { platform, dataRoot } = await fixture({
      analysis: materialRelationshipAdapter(),
      research: externalRelationshipAdapter(),
      search: relationshipSearchAdapter(),
    });
    const uploaded = await platform.ingestDocument({
      fileName: "白杨智能-BP.txt",
      mimeType: "text/plain",
      sourceChannel: "web",
      content: Readable.from([
        Buffer.from("白杨智能有限公司披露青松科技有限公司是其核心技术提供方。"),
      ]),
    });
    await drainPipeline(platform);
    const material = await platform.getConversation(uploaded.conversation.conversationId);
    const companyId = material.company?.companyId;
    expect(companyId).toEqual(expect.any(String));

    await platform.startCompanyResearch({
      companyId,
      intent: "核验上游、下游、客户和竞品关系",
      explicitWebSearch: true,
    });
    await drainPipeline(platform);

    const detail = await platform.getCompany(companyId!);
    const matching = detail.relationshipPanorama.filter(
      (item) =>
        item.targetName === "青松科技有限公司"
        && item.category === "upstream"
        && item.relationType === "技术提供方",
    );
    expect(matching).toHaveLength(2);
    expect(matching.map((item) => item.sourceKind).sort()).toEqual([
      "bp_self_report",
      "external",
    ]);
    expect(matching.every((item) => item.verificationStatus === "unverified")).toBe(true);
    expect(matching.find((item) => item.sourceKind === "bp_self_report")?.evidence)
      .toEqual([expect.objectContaining({ sourceType: "material" })]);
    expect(matching.find((item) => item.sourceKind === "external")?.evidence)
      .toEqual([
        expect.objectContaining({
          sourceType: "web",
          url: "https://example.com/research/full-path?company=white-poplar",
        }),
      ]);

    withDatabase(dataRoot, (database) => {
      const sourceKinds = database.prepare(`
        SELECT source_kind, COUNT(*) AS total
        FROM company_relation_insights
        GROUP BY source_kind ORDER BY source_kind
      `).all() as unknown as Array<{ source_kind: string; total: number }>;
      expect(sourceKinds).toEqual([
        { source_kind: "bp_self_report", total: 1 },
        { source_kind: "external", total: 1 },
      ]);
    });
  });

  it("拒绝外部关系引用本次搜索结果之外的 URL", async () => {
    const research = externalRelationshipAdapter();
    const { platform, dataRoot } = await fixture({
      analysis: materialRelationshipAdapter(),
      research: {
        async analyze(input) {
          const result = await research.analyze(input);
          return {
            ...result,
            relations: result.relations?.map((item) => ({
              ...item,
              evidenceUrls: ["https://untrusted.example/outside-this-run"],
            })),
          };
        },
      },
      search: relationshipSearchAdapter(),
    });
    const uploaded = await platform.ingestDocument({
      fileName: "白杨智能-BP.txt",
      mimeType: "text/plain",
      sourceChannel: "web",
      content: Readable.from([
        Buffer.from("白杨智能有限公司披露青松科技有限公司是其核心技术提供方。"),
      ]),
    });
    await drainPipeline(platform);
    const material = await platform.getConversation(uploaded.conversation.conversationId);
    const started = await platform.startCompanyResearch({
      companyId: material.company!.companyId,
      intent: "核验关联公司",
      explicitWebSearch: true,
    });
    await drainPipeline(platform);

    expect((await platform.getConversation(started.conversationId)).status).toBe("failed");
    withDatabase(dataRoot, (database) => {
      expect(database.prepare(`
        SELECT COUNT(*) AS total FROM company_relation_insights
        WHERE source_kind = 'external'
      `).get()).toEqual({ total: 0 });
    });
  });

  it("确认关系候选后写入企业项目库，并按正式状态读取证据", async () => {
    const { platform, dataRoot } = await fixture({
      analysis: formalRelationshipCandidateAdapter(),
    });
    const uploaded = await platform.ingestDocument({
      fileName: "白杨智能-供应链.txt",
      mimeType: "text/plain",
      sourceChannel: "web",
      content: Readable.from([
        Buffer.from("白杨智能有限公司披露：青松科技有限公司是其核心供应商。"),
      ]),
    });
    await drainPipeline(platform);
    const material = await platform.getConversation(uploaded.conversation.conversationId);
    const companyId = material.company?.companyId;
    expect(companyId).toEqual(expect.any(String));
    const candidate = (await platform.listCandidates("pending")).find(
      (item) => item.companyId === companyId && item.knowledgeType === "supplier_company",
    );
    expect(candidate).toBeTruthy();

    await platform.decideCandidate({
      candidateId: candidate!.candidateId,
      expectedVersion: candidate!.version,
      action: "confirm",
    });

    const detail = await platform.getCompany(companyId!);
    expect(detail.relationshipPanorama).toEqual([
      expect.objectContaining({
        targetName: "青松科技有限公司",
        targetCompanyId: expect.any(String),
        category: "upstream",
        relationType: "供应商",
        sourceKind: "project_library",
        sourceLabel: "企业项目库",
        verificationStatus: "confirmed",
        evidence: [expect.objectContaining({ sourceType: "material" })],
      }),
    ]);

    withDatabase(dataRoot, (database) => {
      expect(database.prepare(`
        SELECT status, from_category, to_category, source_candidate_id, evidence_id
        FROM company_relations
      `).get()).toMatchObject({
        status: "confirmed",
        from_category: "upstream",
        to_category: "downstream",
        source_candidate_id: candidate!.candidateId,
        evidence_id: expect.any(String),
      });
    });
  });
});

async function fixture(options: {
  analysis: MaterialAnalysisPort;
  research?: CompanyResearchPort;
  search?: WebSearchPort;
}) {
  const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-relationship-panorama-"));
  roots.push(dataRoot);
  const platform = createPlatformModule({ dataRoot, ...options });
  modules.push(platform);
  return { dataRoot, platform };
}

function materialRelationshipAdapter(): MaterialAnalysisPort {
  return {
    async analyze(input) {
      const block = input.blocks.find((item) => item.text.trim())!;
      return analysisResult(input.taskId, block.blockId, {
        candidates: [],
        relations: [{
          targetName: "青松科技有限公司",
          category: "upstream",
          relationType: "技术提供方",
          description: "BP 披露青松科技为核心技术提供方。",
          blockIds: [block.blockId],
        }],
      });
    },
  };
}

function formalRelationshipCandidateAdapter(): MaterialAnalysisPort {
  return {
    async analyze(input) {
      const block = input.blocks.find((item) => item.text.trim())!;
      return analysisResult(input.taskId, block.blockId, {
        candidates: [{
          sectionKey: "supply_chain_and_partners",
          knowledgeType: "supplier_company",
          statement: "青松科技有限公司是白杨智能有限公司的核心供应商。",
          value: "青松科技有限公司",
          blockIds: [block.blockId],
          highImpact: false,
          sensitive: false,
        }],
        relations: [],
      });
    },
  };
}

function analysisResult(
  taskId: string,
  blockId: string,
  values: Pick<Awaited<ReturnType<MaterialAnalysisPort["analyze"]>>, "candidates" | "relations">,
): Awaited<ReturnType<MaterialAnalysisPort["analyze"]>> {
  const sections = BP_SECTION_KEYS.map((key) => ({
    key,
    summary: key === "supply_chain_and_partners" ? "已披露供应链关系。" : "材料未披露",
    blockIds: key === "supply_chain_and_partners" ? [blockId] : [],
  }));
  return {
    providerId: "relationship-test",
    modelId: "fixture-v1",
    variant: "deterministic",
    sessionId: `relationship-${taskId}`,
    toolUsage: [],
    sections,
    candidates: values.candidates,
    people: [],
    relations: values.relations,
    rawText: JSON.stringify(values),
  };
}

function relationshipSearchAdapter(): WebSearchPort {
  return {
    async search() {
      return [{
        title: "白杨智能与青松科技合作公告",
        url: "https://example.com/research/full-path?company=white-poplar",
        site: "example.com",
        highlights: ["公告确认青松科技是白杨智能的技术提供方。"],
        accessStatus: "accessible",
        retrievedAt: "2026-09-03T00:00:00.000Z",
      }];
    },
  };
}

function externalRelationshipAdapter(): CompanyResearchPort {
  return {
    async analyze(input) {
      const source = input.webResults[0]!;
      return {
        providerId: "relationship-test",
        modelId: "fixture-v1",
        sessionId: `external-${input.taskId}`,
        summary: "公开来源确认双方存在技术合作。",
        candidates: [],
        relations: [{
          targetName: "青松科技有限公司",
          category: "upstream",
          relationType: "技术提供方",
          description: "公开公告确认青松科技为技术提供方。",
          evidenceUrls: [source.url],
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

function withDatabase(
  dataRoot: string,
  inspect: (database: DatabaseSync) => void,
): void {
  const database = new DatabaseSync(join(dataRoot, "database", "platform.sqlite"));
  try {
    inspect(database);
  } finally {
    database.close();
  }
}
