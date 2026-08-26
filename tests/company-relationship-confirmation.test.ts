// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

describe("证据化企业关系确认", () => {
  it("确认候选后按正确方向沉淀投资、合作、上下游和竞争关系", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-relations-"));
    roots.push(dataRoot);
    const platform = createPlatformModule({
      dataRoot,
      analysis: relationshipAnalysis(),
    });
    modules.push(platform);

    const company = await platform.ensureCompany({
      canonicalName: "苏州兆鑫驰智能科技有限公司",
    });
    await platform.ingestDocument({
      fileName: "苏州兆鑫驰BP.txt",
      mimeType: "text/plain",
      sourceChannel: "web",
      targetCompanyName: company.canonicalName,
      content: singleChunk(
        "苏州兆鑫驰智能科技有限公司与投资机构、合作方、供应商、客户及竞品关系。",
      ),
    });
    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    const candidates = await platform.listCandidates("pending");
    expect(candidates).toHaveLength(5);
    for (const candidate of candidates) {
      await platform.decideCandidate({
        candidateId: candidate.candidateId,
        expectedVersion: candidate.version,
        action: "confirm",
      });
    }

    const detail = await platform.getCompany(company.companyId);
    expect(
      detail.relations.map((item) => ({
        type: item.relationType,
        direction: item.direction,
        evidence: item.evidence?.sourceType,
      })),
    ).toEqual(
      expect.arrayContaining([
        { type: "investment", direction: "incoming", evidence: "material" },
        { type: "cooperation", direction: "outgoing", evidence: "material" },
        { type: "upstream_supplier", direction: "incoming", evidence: "material" },
        { type: "downstream_customer", direction: "outgoing", evidence: "material" },
        { type: "competitor", direction: "outgoing", evidence: "material" },
      ]),
    );
  });
});

function relationshipAnalysis(): MaterialAnalysisPort {
  return {
    async analyze(input) {
      const blockId = input.blocks[0]?.blockId;
      if (!blockId) throw new Error("test block missing");
      const relations = [
        ["relationship_investor", "江苏高投", "江苏高投投资苏州兆鑫驰。"],
        ["relationship_partner", "华为技术有限公司", "苏州兆鑫驰与华为开展合作。"],
        ["relationship_supplier", "上游材料有限公司", "上游材料有限公司向苏州兆鑫驰供货。"],
        ["relationship_customer", "下游客户有限公司", "苏州兆鑫驰向下游客户有限公司供货。"],
        ["relationship_competitor", "精研科技有限公司", "精研科技有限公司是明确竞品。"],
      ] as const;
      return {
        providerId: "relationship-test",
        modelId: "fixture-v1",
        variant: "deterministic",
        sessionId: `fixture-${input.taskId}`,
        toolUsage: [],
        sections: BP_SECTION_KEYS.map((key) => ({
          key,
          summary: key === "business_model_and_competition" ? "材料披露企业关系。" : "材料未披露",
          blockIds: [blockId],
        })),
        candidates: relations.map(([knowledgeType, value, statement]) => ({
          sectionKey: knowledgeType === "relationship_investor"
            ? "financing_valuation_equity_and_use"
            : knowledgeType === "relationship_competitor"
              ? "business_model_and_competition"
              : knowledgeType === "relationship_supplier" || knowledgeType === "relationship_partner"
                ? "supply_chain_and_partners"
                : "customers_orders_and_scenarios",
          knowledgeType,
          statement,
          value,
          blockIds: [blockId],
          highImpact: false,
          sensitive: false,
        })),
        rawText: "fixture",
      };
    },
  };
}

async function* singleChunk(value: string) {
  yield Buffer.from(value, "utf8");
}
