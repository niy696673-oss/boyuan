import { extname } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  DocumentParser,
  ParseDocumentInput,
  ParsedDocument,
} from "./contracts.js";
import { parseCsv } from "./csv-parser.js";
import { parseDocx } from "./docx-parser.js";
import { parsePptx } from "./pptx-parser.js";
import { unavailableImageOcr, type ImageOcr } from "./image-ocr-parser.js";
import { parsePdf } from "./pdf-parser.js";
import { parsePlainText } from "./plain-text-parser.js";
import { parseXlsx } from "./xlsx-parser.js";

const PDF_MIME_TYPES = new Set(["application/pdf"]);
const DOCX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/zip",
]);
const PPTX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
]);
const XLSX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const CSV_MIME_TYPES = new Set(["text/csv", "application/csv"]);
const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "image/bmp",
  "image/gif",
]);

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".htm",
  ".log",
  ".ini",
  ".conf",
  ".sql",
  ".ts",
  ".js",
  ".py",
  ".java",
  ".c",
  ".cpp",
  ".go",
  ".rs",
  ".sh",
  ".env",
  ".csv",
]);

export interface DocumentParserOptions {
  imageOcr?: ImageOcr;
}

export function createDocumentParser(
  options: DocumentParserOptions = {},
): DocumentParser {
  return { parse: (input) => parseDocument(input, options) };
}

export async function parseDocument(
  input: ParseDocumentInput,
  options: DocumentParserOptions = {},
): Promise<ParsedDocument> {
  const extension = extname(input.fileName).toLowerCase();
  const mimeType = input.mimeType?.toLowerCase().split(";", 1)[0]?.trim();
  if (extension === ".pdf" || (mimeType && PDF_MIME_TYPES.has(mimeType)))
    return parsePdf(input.path);
  if (
    extension === ".docx" ||
    (extension !== ".xlsx" && extension !== ".pptx" && mimeType && DOCX_MIME_TYPES.has(mimeType))
  )
    return parseDocx(input.path);
  if (extension === ".pptx" || (mimeType && PPTX_MIME_TYPES.has(mimeType)))
    return parsePptx(input.path);
  if (extension === ".xlsx" || (mimeType && XLSX_MIME_TYPES.has(mimeType)))
    return parseXlsx(input.path);
  if (
    extension === ".csv" ||
    (mimeType && CSV_MIME_TYPES.has(mimeType) && mimeType !== "text/plain")
  )
    return parseCsv(input.path);
  if (
    TEXT_EXTENSIONS.has(extension) ||
    (mimeType && (mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml" || mimeType === "application/yaml"))
  )
    return parsePlainText(input.path);
  if (
    [
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".tif",
      ".tiff",
      ".heic",
      ".heif",
      ".bmp",
      ".gif",
    ].includes(extension) ||
    (mimeType && IMAGE_MIME_TYPES.has(mimeType))
  )
    return (options.imageOcr ?? unavailableImageOcr)(input);

  try {
    const fd = await readFile(input.path);
    const sample = fd.subarray(0, Math.min(fd.length, 2048));
    const hasNullByte = sample.includes(0);
    if (!hasNullByte) {
      return await parsePlainText(input.path);
    }
  } catch {
    // If reading fails, fall through to fallback block
  }

  return {
    format: 'binary',
    blocks: [{
      blockId: "fallback-1",
      kind: "paragraph",
      text: `【已接收文件：${input.fileName}】文件已接收并归档。`,
      page: 1,
      paragraph: 1,
    }],
  };
}
