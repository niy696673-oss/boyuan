import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import type { ParsedBlock, ParsedDocument } from './contracts.js';
import { DocumentParserError } from './contracts.js';

export async function parsePptx(path: string): Promise<ParsedDocument> {
  try {
    const archive = unzipSync(new Uint8Array(await readFile(path)));
    const slideEntries = Object.keys(archive)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name))
      .sort((a, b) => {
        const numA = Number(/^ppt\/slides\/slide(\d+)\.xml$/u.exec(a)?.[1] ?? 0);
        const numB = Number(/^ppt\/slides\/slide(\d+)\.xml$/u.exec(b)?.[1] ?? 0);
        return numA - numB;
      });

    if (slideEntries.length === 0) {
      return {
        format: 'pptx',
        blocks: [{
          blockId: 'pptx-empty-1',
          kind: 'paragraph',
          text: '【PPT材料】演示文稿中未发现有效幻灯片。',
          page: 1,
          paragraph: 1,
        }],
      };
    }

    const blocks: ParsedBlock[] = [];
    let globalOrder = 0;

    for (const [index, slidePath] of slideEntries.entries()) {
      const slideXml = archive[slidePath];
      if (!slideXml) continue;
      const slideNumber = index + 1;
      const slideBlocks = parseSlideXml(strFromU8(slideXml), slideNumber, globalOrder);
      globalOrder += slideBlocks.length;
      blocks.push(...slideBlocks);
    }

    if (blocks.length === 0) {
      return {
        format: 'pptx',
        blocks: [{
          blockId: 'pptx-empty-1',
          kind: 'paragraph',
          text: '【PPT材料】演示文稿中未包含可提取的文本内容。',
          page: 1,
          paragraph: 1,
        }],
      };
    }

    return { format: 'pptx', blocks };
  } catch (error) {
    if (error instanceof DocumentParserError) throw error;
    throw new DocumentParserError('pptx_parse_failed', 'failed to parse PPTX', { cause: error });
  }
}

export function parseSlideXml(xml: string, slideNumber: number, _startOrder: number): ParsedBlock[] {
  const parser = new SaxesParser({ xmlns: false });
  const blocks: ParsedBlock[] = [];
  let paragraphText: string[] | undefined;
  let insideText = false;
  let pIndex = 0;

  parser.on('opentag', (tag) => {
    const name = localName(tag.name);
    if (name === 'p') {
      paragraphText = [];
    } else if (paragraphText && name === 't') {
      insideText = true;
    } else if (paragraphText && name === 'tab') {
      paragraphText.push('\t');
    } else if (paragraphText && (name === 'br' || name === 'cr')) {
      paragraphText.push('\n');
    }
  });

  parser.on('text', (text) => {
    if (paragraphText && insideText) paragraphText.push(text);
  });

  parser.on('closetag', (tag) => {
    const name = localName(tag.name);
    if (name === 't') insideText = false;
    if (name !== 'p' || !paragraphText) return;
    const text = paragraphText.join('').replace(/[ \t]+/gu, ' ').trim();
    if (text) {
      pIndex += 1;
      blocks.push({
        blockId: `pptx-s${slideNumber}-p${pIndex}`,
        kind: 'paragraph',
        text,
        page: slideNumber,
        paragraph: pIndex,
      });
    }
    paragraphText = undefined;
  });

  parser.write(xml).close();
  return blocks;
}

function localName(name: string): string {
  return name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
}
