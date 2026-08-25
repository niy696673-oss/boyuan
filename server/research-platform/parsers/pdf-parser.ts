import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ParsedDocument } from './contracts.js';
import { DocumentParserError } from './contracts.js';

export async function parsePdf(path: string): Promise<ParsedDocument> {
  try {
    const bytes = await readFile(path);
    const loadingTask = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    const document = await loadingTask.promise;
    const blocks: ParsedDocument['blocks'] = [];
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => 'str' in item ? item.str : '')
          .join(' ')
          .replace(/\s+/gu, ' ')
          .trim();
        if (text) blocks.push({ blockId: `pdf-page-${pageNumber}`, kind: 'page_text', text, page: pageNumber });
        page.cleanup();
      }
    } finally {
      await loadingTask.destroy();
    }
    if (blocks.length === 0) throw new DocumentParserError('pdf_has_no_text', 'PDF contains no extractable text');
    return { format: 'pdf', blocks };
  } catch (error) {
    if (error instanceof DocumentParserError) throw error;
    throw new DocumentParserError('pdf_parse_failed', 'failed to parse PDF', { cause: error });
  }
}
