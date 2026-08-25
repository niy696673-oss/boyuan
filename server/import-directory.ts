import fs from "node:fs/promises";
import path from "node:path";

const sourceArgument =
  process.argv.slice(2).find((argument) => argument !== "--") || "";
const sourceDirectory = path.resolve(sourceArgument);
const apiBaseUrl = (
  process.env.BOYUAN_API_BASE_URL || "http://127.0.0.1:4174"
).replace(/\/$/, "");
const allowedExtensions = new Set([
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".csv",
  ".pptx",
]);

if (!sourceArgument) throw new Error("请提供待导入的知识库目录");

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const rows = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectFiles(target);
      return allowedExtensions.has(path.extname(entry.name).toLowerCase())
        ? [target]
        : [];
    }),
  );
  return rows.flat().sort((left, right) => left.localeCompare(right, "zh-CN"));
}

type ImportResult = {
  fileName: string;
  relativePath: string;
  size: number;
  outcome: "indexed" | "duplicate" | "failed";
  documentId?: string;
  companies?: string[];
  reason?: string;
};

const files = await collectFiles(sourceDirectory);
const results: ImportResult[] = [];

for (let index = 0; index < files.length; index += 1) {
  const filePath = files[index];
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)]),
    path.basename(filePath),
  );
  form.append("visibility", "organization");

  try {
    const response = await fetch(`${apiBaseUrl}/api/upload`, {
      method: "POST",
      headers: { "x-user-id": "u-admin" },
      body: form,
    });
    const payload = (await response.json()) as Record<string, unknown>;
    const outcome = payload.duplicate
      ? "duplicate"
      : response.ok && payload.status !== "解析失败"
        ? "indexed"
        : "failed";
    results.push({
      fileName: path.basename(filePath),
      relativePath: path.relative(sourceDirectory, filePath),
      size: buffer.length,
      outcome,
      documentId: typeof payload.id === "string" ? payload.id : undefined,
      companies: Array.isArray(payload.detectedCompanies)
        ? payload.detectedCompanies.map(String)
        : undefined,
      reason: response.ok
        ? undefined
        : String(
            payload.failureReason || payload.error || `HTTP ${response.status}`,
          ),
    });
    console.log(
      `[${index + 1}/${files.length}] ${outcome} ${path.basename(filePath)}`,
    );
  } catch (error) {
    results.push({
      fileName: path.basename(filePath),
      relativePath: path.relative(sourceDirectory, filePath),
      size: buffer.length,
      outcome: "failed",
      reason: error instanceof Error ? error.message : "导入请求失败",
    });
    console.log(
      `[${index + 1}/${files.length}] failed ${path.basename(filePath)}`,
    );
  }
}

const summary = {
  sourceDirectory,
  importedAt: new Date().toISOString(),
  total: results.length,
  indexed: results.filter((row) => row.outcome === "indexed").length,
  duplicates: results.filter((row) => row.outcome === "duplicate").length,
  failed: results.filter((row) => row.outcome === "failed").length,
  results,
};
const reportDirectory = path.resolve("data/import-reports");
await fs.mkdir(reportDirectory, { recursive: true });
const reportPath = path.join(
  reportDirectory,
  `knowledge-import-${summary.importedAt.replace(/[:.]/g, "-")}.json`,
);
await fs.writeFile(reportPath, JSON.stringify(summary, null, 2));
console.log(
  JSON.stringify({ ...summary, results: undefined, reportPath }, null, 2),
);
