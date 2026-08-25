import { readFile } from 'node:fs/promises';
import type { ParsedDocument } from './contracts.js';
import { DocumentParserError } from './contracts.js';

export async function parsePlainText(path: string): Promise<ParsedDocument> {
  try {
    const text = (await readFile(path, 'utf8')).replace(/^\uFEFF/u, '');
    const blocks = text.split(/\r?\n/gu).map((line) => line.trim()).filter(Boolean).map((line, index) => ({
      blockId: `text-line-${index + 1}`,
      kind: 'paragraph' as const,
      text: line,
      paragraph: index + 1,
    }));
    if (blocks.length === 0) throw new DocumentParserError('company_list_has_no_rows', 'text contains no non-empty rows');
    return { format: 'text', blocks };
  } catch (error) {
    if (error instanceof DocumentParserError) throw error;
    throw new DocumentParserError('text_parse_failed', 'failed to parse plain text', { cause: error });
  }
}
