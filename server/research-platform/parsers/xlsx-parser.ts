import { posix } from 'node:path';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { SaxesParser, type SaxesTagPlain } from 'saxes';
import type { ParsedBlock, ParsedDocument } from './contracts.js';
import { DocumentParserError } from './contracts.js';
import { normalizeCell } from './company-list-columns.js';

interface SheetRef { name: string; relationId: string }
interface Cell { reference: string; value: string }

export async function parseXlsx(path: string): Promise<ParsedDocument> {
  try {
    const archive = unzipSync(new Uint8Array(await readFile(path)));
    const workbook = archive['xl/workbook.xml'];
    const relations = archive['xl/_rels/workbook.xml.rels'];
    if (!workbook || !relations) throw new DocumentParserError('xlsx_workbook_missing', 'XLSX workbook metadata is missing');
    const sharedStrings = archive['xl/sharedStrings.xml'] ? parseSharedStrings(strFromU8(archive['xl/sharedStrings.xml'])) : [];
    const relationTargets = parseRelations(strFromU8(relations));
    const blocks: ParsedBlock[] = [];
    for (const [sheetIndex, sheet] of parseWorkbook(strFromU8(workbook)).entries()) {
      const target = relationTargets.get(sheet.relationId);
      if (!target) continue;
      const normalizedTarget = posix.normalize(posix.join('xl', target.replace(/^\//u, '').replace(/^xl\//u, '')));
      const xml = archive[normalizedTarget];
      if (!xml) continue;
      blocks.push(...sheetCompanyBlocks(parseSheet(strFromU8(xml), sharedStrings), sheet.name, sheetIndex + 1));
    }
    if (blocks.length === 0) throw new DocumentParserError('company_list_has_no_rows', 'XLSX contains no non-empty company rows');
    return { format: 'xlsx', blocks };
  } catch (error) {
    if (error instanceof DocumentParserError) throw error;
    throw new DocumentParserError('xlsx_parse_failed', 'failed to parse XLSX', { cause: error });
  }
}

function parseWorkbook(xml: string): SheetRef[] {
  const parser = new SaxesParser({ xmlns: false });
  const sheets: SheetRef[] = [];
  parser.on('opentag', (tag) => {
    if (localName(tag.name) !== 'sheet') return;
    const name = attributeValue(tag, 'name');
    const relationId = attributeValue(tag, 'id');
    if (name && relationId) sheets.push({ name, relationId });
  });
  parser.write(xml).close();
  return sheets;
}

function parseRelations(xml: string): Map<string, string> {
  const parser = new SaxesParser({ xmlns: false });
  const relations = new Map<string, string>();
  parser.on('opentag', (tag) => {
    if (localName(tag.name) !== 'Relationship') return;
    const id = attributeValue(tag, 'Id');
    const target = attributeValue(tag, 'Target');
    if (id && target && !target.includes('..')) relations.set(id, target);
  });
  parser.write(xml).close();
  return relations;
}

function parseSharedStrings(xml: string): string[] {
  const parser = new SaxesParser({ xmlns: false });
  const strings: string[] = [];
  let parts: string[] | undefined;
  let inText = false;
  parser.on('opentag', (tag) => {
    const name = localName(tag.name);
    if (name === 'si') parts = [];
    else if (name === 't' && parts) inText = true;
  });
  parser.on('text', (text) => { if (parts && inText) parts.push(text); });
  parser.on('closetag', (tag) => {
    const name = localName(tag.name);
    if (name === 't') inText = false;
    else if (name === 'si' && parts) {
      strings.push(parts.join(''));
      parts = undefined;
    }
  });
  parser.write(xml).close();
  return strings;
}

function parseSheet(xml: string, sharedStrings: string[]): Cell[] {
  const parser = new SaxesParser({ xmlns: false });
  const cells: Cell[] = [];
  let reference = '';
  let type = '';
  let value = '';
  let inValue = false;
  let inInlineText = false;
  parser.on('opentag', (tag) => {
    const name = localName(tag.name);
    if (name === 'c') {
      reference = attributeValue(tag, 'r') ?? '';
      type = attributeValue(tag, 't') ?? '';
      value = '';
    } else if (name === 'v') inValue = true;
    else if (name === 't' && type === 'inlineStr') inInlineText = true;
  });
  parser.on('text', (text) => { if (inValue || inInlineText) value += text; });
  parser.on('closetag', (tag) => {
    const name = localName(tag.name);
    if (name === 'v') inValue = false;
    else if (name === 't') inInlineText = false;
    else if (name === 'c' && reference) {
      const resolved = type === 's' ? sharedStrings[Number(value)] ?? '' : value;
      cells.push({ reference, value: resolved });
    }
  });
  parser.write(xml).close();
  return cells;
}

function sheetCompanyBlocks(cells: Cell[], sheet: string, sheetIndex: number): ParsedBlock[] {
  const rows = new Map<number, Map<number, Cell>>();
  for (const cell of cells) {
    const location = cellLocation(cell.reference);
    if (!location) continue;
    const row = rows.get(location.row) ?? new Map<number, Cell>();
    row.set(location.column, cell);
    rows.set(location.row, row);
  }
  const rowNumbers = [...rows.keys()].sort((left, right) => left - right);
  const blocks: ParsedBlock[] = [];
  for (const rowNumber of rowNumbers) {
    const populatedCells = [...(rows.get(rowNumber)?.entries() ?? [])]
      .map(([column, cell]) => ({ column, cell, value: normalizeCell(cell.value) }))
      .filter((item) => item.value)
      .sort((left, right) => left.column - right.column);
    if (populatedCells.length === 0) continue;
    const firstReference = populatedCells[0]?.cell.reference;
    const lastReference = populatedCells.at(-1)?.cell.reference;
    if (!firstReference || !lastReference) continue;
    blocks.push({
      blockId: `xlsx-sheet-${sheetIndex}-row-${rowNumber}`,
      kind: 'table_cell',
      text: populatedCells.map((item) => item.value).join(' | '),
      sheet,
      row: rowNumber,
      cellRange: firstReference === lastReference ? firstReference : `${firstReference}:${lastReference}`,
    });
  }
  return blocks;
}

function cellLocation(reference: string): { column: number; row: number } | undefined {
  const match = /^([A-Z]+)([1-9]\d*)$/iu.exec(reference);
  if (!match?.[1] || !match[2]) return undefined;
  let column = 0;
  for (const letter of match[1].toUpperCase()) column = column * 26 + letter.charCodeAt(0) - 64;
  return { column, row: Number(match[2]) };
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
