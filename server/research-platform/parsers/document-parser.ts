import { extname } from 'node:path';
import type { DocumentParser, ParseDocumentInput, ParsedDocument } from './contracts.js';
import { DocumentParserError } from './contracts.js';
import { parseCsv } from './csv-parser.js';
import { parseDocx } from './docx-parser.js';
import { unavailableImageOcr, type ImageOcr } from './image-ocr-parser.js';
import { parsePdf } from './pdf-parser.js';
import { parsePlainText } from './plain-text-parser.js';
import { parseXlsx } from './xlsx-parser.js';

const PDF_MIME_TYPES = new Set(['application/pdf']);
const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
]);
const XLSX_MIME_TYPES = new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv', 'text/plain']);
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/tiff', 'image/heic', 'image/heif']);

export interface DocumentParserOptions {
  imageOcr?: ImageOcr;
}

export function createDocumentParser(options: DocumentParserOptions = {}): DocumentParser {
  return { parse: (input) => parseDocument(input, options) };
}

export async function parseDocument(input: ParseDocumentInput, options: DocumentParserOptions = {}): Promise<ParsedDocument> {
  const extension = extname(input.fileName).toLowerCase();
  const mimeType = input.mimeType?.toLowerCase().split(';', 1)[0]?.trim();
  if (extension === '.pdf' || (mimeType && PDF_MIME_TYPES.has(mimeType))) return parsePdf(input.path);
  if (extension === '.docx' || (extension !== '.xlsx' && mimeType && DOCX_MIME_TYPES.has(mimeType))) return parseDocx(input.path);
  if (extension === '.xlsx' || (mimeType && XLSX_MIME_TYPES.has(mimeType))) return parseXlsx(input.path);
  if (extension === '.csv' || (mimeType && CSV_MIME_TYPES.has(mimeType) && mimeType !== 'text/plain')) return parseCsv(input.path);
  if (extension === '.txt' || mimeType === 'text/plain') return parsePlainText(input.path);
  if (['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.heic', '.heif'].includes(extension)
    || (mimeType && IMAGE_MIME_TYPES.has(mimeType))) return (options.imageOcr ?? unavailableImageOcr)(input);
  throw new DocumentParserError('unsupported_document_format', `unsupported document format: ${extension || mimeType || 'unknown'}`);
}
