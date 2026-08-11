import { randomUUID } from "node:crypto";
import * as mammoth from "mammoth";
import type { Store } from "../store.js";
import type { Database } from "./database.js";
import type {
  HybridSearch,
  ObjectStorage,
  ParseJobPayload,
} from "./contracts.js";

async function extractPdf(buffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) })
    .promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
    );
  }
  return pages.join("\n\n");
}

export async function extractDocumentText(fileType: string, buffer: Buffer) {
  if (["txt", "md", "csv"].includes(fileType)) return buffer.toString("utf8");
  if (fileType === "docx")
    return (await mammoth.extractRawText({ buffer })).value;
  if (fileType === "pdf") return extractPdf(buffer);
  throw new Error(`UNSUPPORTED_FILE_TYPE:${fileType}`);
}

export class DocumentProcessor {
  constructor(
    private readonly store: Store,
    private readonly storage: ObjectStorage,
    private readonly search: HybridSearch,
    private readonly database?: Database,
  ) {}

  async process(job: ParseJobPayload) {
    const document = this.store.data.documents.find(
      (row) => row.id === job.documentId,
    );
    try {
      if (document) {
        document.status = "解析中";
        document.statusTrace ??= [];
        document.statusTrace.push({
          status: "解析中",
          at: new Date().toISOString(),
        });
      }
      await this.database?.updateDocumentStatus(job.documentId, "解析中");
      const content = (
        await extractDocumentText(
          job.fileType,
          await this.storage.get(job.objectKey),
        )
      ).trim();
      if (!content) throw new Error("DOCUMENT_EMPTY");
      const companies = this.store.data.companies.filter((company) =>
        [
          company.standardName,
          ...company.aliases,
          company.englishName || "",
        ].some(
          (name) => name && content.toLowerCase().includes(name.toLowerCase()),
        ),
      );
      for (const company of companies) {
        const evidenceId = randomUUID();
        const excerpt = content.slice(0, 1200);
        company.evidence.push({
          id: evidenceId,
          documentId: job.documentId,
          fileName: job.fileName,
          excerpt,
          sourceDate: new Date().toISOString().slice(0, 10),
          visibility: document?.visibility || "organization",
        });
        await this.search.indexEvidence({
          evidenceId,
          companyId: company.id,
          documentId: job.documentId,
          fileName: job.fileName,
          text: excerpt,
          visibility: document?.visibility || "organization",
        });
      }
      if (document) {
        document.status = "已索引";
        document.detectedCompanies = companies.map(
          (company) => company.standardName,
        );
        document.statusTrace?.push({
          status: "已解析",
          at: new Date().toISOString(),
        });
        document.statusTrace?.push({
          status: "已索引",
          at: new Date().toISOString(),
        });
      }
      await this.database?.updateDocumentStatus(job.documentId, "已索引");
      this.store.audit(
        "异步解析 Worker",
        "资料解析完成",
        job.fileName,
        `解析 ${content.length} 字符，关联 ${companies.length} 家公司`,
      );
      return {
        characters: content.length,
        companies: companies.map((company) => company.id),
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "DOCUMENT_PARSE_FAILED";
      if (document) {
        document.status = "解析失败";
        document.failureReason = reason;
        document.statusTrace?.push({
          status: "解析失败",
          at: new Date().toISOString(),
        });
      }
      await this.database?.updateDocumentStatus(
        job.documentId,
        "解析失败",
        reason,
      );
      this.store.audit("异步解析 Worker", "资料解析失败", job.fileName, reason);
      throw error;
    }
  }
}
