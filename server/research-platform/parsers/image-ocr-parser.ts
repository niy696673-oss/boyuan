import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { OpenCodeAnalysisOptions } from '../analysis/opencode-analysis.js';
import { createOpenCodeClient } from '../opencode/client.js';
import type { ParseDocumentInput, ParsedDocument } from './contracts.js';
import { DocumentParserError } from './contracts.js';

export type ImageOcr = (input: ParseDocumentInput) => Promise<ParsedDocument>;

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

export function createOpenCodeImageOcr(options: OpenCodeAnalysisOptions): ImageOcr {
  const client = createOpenCodeClient(
    options,
    (status) => new DocumentParserError('image_ocr_http_error', `OpenCode returned HTTP ${status}`),
    180_000,
  );

  return async (input) => {
    const sessionId = await client.createSession(`博源图片识别：${input.fileName}`);
    const body = {
      ...(options.model ? { model: { providerID: options.model.providerId, modelID: options.model.modelId } } : {}),
      ...(options.variant ? { variant: options.variant } : {}),
      system: '你是博源 AI 平台的图片文字识别器。只转录图片中可见的文字，不概括、不纠错、不补造。按阅读顺序输出 JSON，不要 Markdown。',
      tools: { bash: false, edit: false, write: false, webfetch: false, websearch: false },
      parts: [
        { type: 'file', mime: imageMimeType(input), filename: input.fileName, url: pathToFileURL(input.path).href },
        { type: 'text', text: JSON.stringify({ task: '将图片中的文字按视觉阅读顺序分行转录。表格的每个逻辑行尽量保持为一行。', outputSchema: { lines: ['第一行文字'] } }) },
      ],
    };
    const response = await client.sendMessage(sessionId, body);
    if (response.info.error) throw new DocumentParserError('image_ocr_message_error', 'OpenCode image OCR failed');
    const raw = response.parts.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n').trim();
    return parseOcrResponse(raw);
  };
}

export const unavailableImageOcr: ImageOcr = async () => {
  throw new DocumentParserError('image_ocr_unavailable', 'image OCR requires a configured OpenCode vision model');
};

function parseOcrResponse(raw: string): ParsedDocument {
  let parsed: unknown;
  try {
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(raw.trim());
    parsed = JSON.parse(fenced?.[1] ?? raw);
  } catch (error) {
    throw new DocumentParserError('image_ocr_json_invalid', 'image OCR did not return valid JSON', { cause: error });
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.lines)) {
    throw new DocumentParserError('image_ocr_schema_invalid', 'image OCR JSON must contain lines');
  }
  const lines = parsed.lines.filter((line): line is string => typeof line === 'string').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new DocumentParserError('image_ocr_empty', 'OCR did not recognize any text in the image');
  return {
    format: 'image',
    blocks: lines.map((line, index) => ({
      blockId: `image-ocr-line-${index + 1}`,
      kind: 'page_text',
      text: line,
      page: 1,
      paragraph: index + 1,
    })),
  };
}

function imageMimeType(input: ParseDocumentInput): string {
  const declared = input.mimeType?.toLowerCase().split(';', 1)[0]?.trim();
  if (declared?.startsWith('image/')) return declared;
  return IMAGE_MIME_TYPES[extname(input.fileName).toLowerCase()] ?? 'application/octet-stream';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
