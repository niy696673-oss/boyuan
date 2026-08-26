import { createReadStream } from "node:fs";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDeterministicAnalysisAdapter } from "./research-platform/analysis/deterministic-analysis.js";
import { createPlatformModule } from "./research-platform/platform-module.js";

type LegacyEvidence = {
  documentId: string;
  fileName: string;
};

type LegacyCompany = {
  standardName: string;
  aliases: string[];
  attentionStatus?: string;
  evidence: LegacyEvidence[];
};

type LegacyStore = {
  companies: LegacyCompany[];
};

type ImportRow = {
  outcome: "indexed" | "duplicate" | "failed";
  relativePath: string;
  documentId?: string;
};

type LegacyImportReport = {
  sourceDirectory: string;
  results: ImportRow[];
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const legacyStorePath = path.resolve(
  process.env.BOYUAN_LEGACY_STORE_PATH ?? path.join(root, "data", "runtime-store.json"),
);
const legacyReportPath = process.env.BOYUAN_LEGACY_IMPORT_REPORT
  ? path.resolve(process.env.BOYUAN_LEGACY_IMPORT_REPORT)
  : await latestImportReport(path.join(root, "data", "import-reports"));
const dataRoot = path.resolve(
  process.env.BOYUAN_RESEARCH_DATA_ROOT ?? path.join(root, "data", "research-platform"),
);

const legacy = JSON.parse(await readFile(legacyStorePath, "utf8")) as LegacyStore;
const importReport = JSON.parse(
  await readFile(legacyReportPath, "utf8"),
) as LegacyImportReport;
const companyByDocumentId = new Map<string, LegacyCompany>();
for (const company of legacy.companies) {
  for (const evidence of company.evidence) {
    companyByDocumentId.set(evidence.documentId, company);
  }
}

const platform = createPlatformModule({
  dataRoot,
  analysis: createDeterministicAnalysisAdapter(),
});

const migratedFiles: string[] = [];
const skippedFiles: string[] = [];
const failedFiles: Array<{ fileName: string; reason: string }> = [];

try {
  for (const company of legacy.companies) {
    await platform.ensureCompany({
      canonicalName: company.standardName,
      aliases: company.aliases.map((alias) => ({ alias, type: "legacy_alias" })),
      watched: company.attentionStatus !== "未关注",
    });
  }

  const existingFiles = new Set(
    (await Promise.all((await platform.listCompanies()).map((company) =>
      platform.getCompany(company.companyId),
    ))).flatMap((company) =>
      company.materials.map((material) => `${company.canonicalName}\u0000${material.fileName}`),
    ),
  );

  for (const row of importReport.results) {
    if (row.outcome !== "indexed" || !row.documentId) continue;
    const company = companyByDocumentId.get(row.documentId);
    if (!company) {
      failedFiles.push({
        fileName: row.relativePath,
        reason: "旧公司目录中找不到该文档对应的公司",
      });
      continue;
    }
    const sourcePath = path.join(importReport.sourceDirectory, row.relativePath);
    const fileName = path.basename(sourcePath);
    const migrationKey = `${company.standardName}\u0000${fileName}`;
    if (existingFiles.has(migrationKey)) {
      skippedFiles.push(fileName);
      continue;
    }
    try {
      await access(sourcePath);
      await platform.ingestDocument({
        fileName,
        mimeType: mimeTypeFor(fileName),
        sourceChannel: "web",
        targetCompanyName: company.standardName,
        content: createReadStream(sourcePath),
      });
      migratedFiles.push(fileName);
      existingFiles.add(migrationKey);
      console.log(`[${migratedFiles.length}] 已迁移 ${company.standardName} / ${fileName}`);
    } catch (error) {
      failedFiles.push({
        fileName,
        reason: error instanceof Error ? error.message : "迁移失败",
      });
    }
  }

  let processedSteps = 0;
  for (let round = 0; round < 2_000; round += 1) {
    const processed = await platform.runPendingSteps(50);
    processedSteps += processed;
    if (processed === 0) break;
  }

  const companies = await platform.listCompanies();
  const conversations = await platform.listConversations();
  const candidates = await platform.listCandidates();
  const result = {
    migratedAt: new Date().toISOString(),
    legacyStorePath,
    legacyReportPath,
    sourceDirectory: importReport.sourceDirectory,
    companies: companies.length,
    materials: companies.reduce((sum, company) => sum + company.materialCount, 0),
    conversations: conversations.length,
    candidates: candidates.length,
    processedSteps,
    migratedFiles,
    skippedFiles,
    failedFiles,
  };
  const outputPath = path.join(root, "data", "import-reports", "research-platform-migration-latest.json");
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...result, migratedFiles: migratedFiles.length, outputPath }, null, 2));
} finally {
  platform.close();
}

async function latestImportReport(directory: string): Promise<string> {
  const files = (await readdir(directory))
    .filter((file) => /^knowledge-import-.*\.json$/u.test(file))
    .sort();
  const latest = files.at(-1);
  if (!latest) throw new Error("找不到旧知识库导入报告");
  return path.join(directory, latest);
}

function mimeTypeFor(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (extension === ".txt") return "text/plain";
  if (extension === ".md") return "text/markdown";
  return "application/octet-stream";
}
