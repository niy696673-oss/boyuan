// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDeterministicAnalysisAdapter } from "../server/research-platform/analysis/deterministic-analysis.js";
import type { PlatformModule } from "../server/research-platform/contracts.js";
import { createPlatformModule } from "../server/research-platform/platform-module.js";

const roots: string[] = [];
const modules: PlatformModule[] = [];

afterEach(async () => {
  while (modules.length) modules.pop()?.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("旧材料定向迁移", () => {
  it("保留既有公司主体，并把无法从文件名识别的材料挂到该公司", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "boyuan-legacy-target-"));
    roots.push(dataRoot);
    const platform = createPlatformModule({
      dataRoot,
      analysis: createDeterministicAnalysisAdapter(),
    });
    modules.push(platform);

    const company = await platform.ensureCompany({
      canonicalName: "云杉智能有限公司",
      aliases: [{ alias: "云杉智能", type: "legacy_alias" }],
      watched: true,
    });
    const uploaded = await platform.ingestDocument({
      fileName: "路演材料.txt",
      mimeType: "text/plain",
      sourceChannel: "web",
      targetCompanyName: "云杉智能有限公司",
      content: singleChunk("产品已进入商业化阶段。"),
    });

    for (let index = 0; index < 20; index += 1) {
      if ((await platform.runPendingSteps()) === 0) break;
    }

    const detail = await platform.getCompany(company.companyId);
    expect(uploaded.conversation.company?.companyId).toBe(company.companyId);
    expect(detail).toMatchObject({
      canonicalName: "云杉智能有限公司",
      aliases: expect.arrayContaining([{ alias: "云杉智能", type: "legacy_alias" }]),
      profile: { watched: true },
      materialCount: 1,
      materials: [{ fileName: "路演材料.txt" }],
      pendingCandidateCount: 1,
    });
  });
});

async function* singleChunk(value: string) {
  yield Buffer.from(value, "utf8");
}
