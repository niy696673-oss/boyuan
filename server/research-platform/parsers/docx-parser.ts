import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { SaxesParser, type SaxesTagPlain } from 'saxes';
import type { ParsedBlock, ParsedDocument } from './contracts.js';
import { DocumentParserError } from './contracts.js';

interface ParagraphState {
  text: string[];
  style?: string;
}

export async function parseDocx(path: string): Promise<ParsedDocument> {
  try {
    const archive = unzipSync(new Uint8Array(await readFile(path)));
    const documentXml = archive['word/document.xml'];
    if (!documentXml) throw new DocumentParserError('docx_document_missing', 'DOCX has no word/document.xml');
    const blocks = parseDocumentXml(strFromU8(documentXml));
    if (blocks.length === 0) throw new DocumentParserError('docx_has_no_text', 'DOCX contains no extractable text');
    return { format: 'docx', blocks };
  } catch (error) {
    if (error instanceof DocumentParserError) throw error;
    throw new DocumentParserError('docx_parse_failed', 'failed to parse DOCX', { cause: error });
  }
}

export function parseDocumentXml(xml: string): ParsedBlock[] {
  const parser = new SaxesParser({ xmlns: false });
  const blocks: ParsedBlock[] = [];
  const headingPath: string[] = [];
  let paragraph: ParagraphState | undefined;
  let paragraphNumber = 0;
  let insideText = false;

  parser.on('opentag', (tag) => {
    const name = localName(tag.name);
    if (name === 'p') paragraph = { text: [] };
    else if (paragraph && name === 'pStyle') paragraph.style = attributeValue(tag, 'val');
    else if (paragraph && name === 't') insideText = true;
    else if (paragraph && name === 'tab') paragraph.text.push('\t');
    else if (paragraph && (name === 'br' || name === 'cr')) paragraph.text.push('\n');
  });
  parser.on('text', (text) => {
    if (paragraph && insideText) paragraph.text.push(text);
  });
  parser.on('closetag', (tag) => {
    const name = localName(tag.name);
    if (name === 't') insideText = false;
    if (name !== 'p' || !paragraph) return;
    paragraphNumber += 1;
    const text = paragraph.text.join('').replace(/[ \t]+/gu, ' ').replace(/\n{3,}/gu, '\n\n').trim();
    const level = headingLevel(paragraph.style);
    if (text && level) {
      headingPath.length = level - 1;
      headingPath[level - 1] = text;
      blocks.push({ blockId: `docx-paragraph-${paragraphNumber}`, kind: 'heading', text, paragraph: paragraphNumber, headingPath: [...headingPath] });
    } else if (text) {
      blocks.push({
        blockId: `docx-paragraph-${paragraphNumber}`,
        kind: 'paragraph',
        text,
        paragraph: paragraphNumber,
        ...(headingPath.length ? { headingPath: [...headingPath] } : {}),
      });
    }
    paragraph = undefined;
  });
  parser.write(xml).close();
  return blocks;
}

function localName(name: string): string {
  return name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
}

function attributeValue(tag: SaxesTagPlain, local: string): string | undefined {
  for (const [name, value] of Object.entries(tag.attributes)) {
    if (localName(name) === local) return value;
  }
  return undefined;
}

function headingLevel(style: string | undefined): number | undefined {
  if (!style) return undefined;
  const match = /^(?:heading|标题)[-_ ]?([1-9])$/iu.exec(style);
  return match?.[1] ? Number(match[1]) : undefined;
}
