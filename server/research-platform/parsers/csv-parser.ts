import { readFile } from 'node:fs/promises';
import type { ParsedBlock, ParsedDocument } from './contracts.js';
import { DocumentParserError } from './contracts.js';
import { normalizeCell } from './company-list-columns.js';

export async function parseCsv(path: string): Promise<ParsedDocument> {
  try {
    const text = (await readFile(path, 'utf8')).replace(/^\uFEFF/u, '');
    const rows = parseCsvRows(text);
    const blocks = companyBlocks(rows);
    if (blocks.length === 0) throw new DocumentParserError('company_list_has_no_rows', 'CSV contains no non-empty company rows');
    return { format: 'csv', blocks };
  } catch (error) {
    if (error instanceof DocumentParserError) throw error;
    throw new DocumentParserError('csv_parse_failed', 'failed to parse CSV', { cause: error });
  }
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (quoted) throw new DocumentParserError('csv_unclosed_quote', 'CSV contains an unclosed quoted cell');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function companyBlocks(rows: string[][]): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const populatedCells = (rows[index] ?? [])
      .map((cell, column) => ({ column, value: normalizeCell(cell) }))
      .filter((cell) => cell.value);
    if (populatedCells.length === 0) continue;
    const rowNumber = index + 1;
    const firstColumn = spreadsheetColumnName((populatedCells[0]?.column ?? 0) + 1);
    const lastColumn = spreadsheetColumnName((populatedCells.at(-1)?.column ?? 0) + 1);
    blocks.push({
      blockId: `csv-row-${rowNumber}`,
      kind: 'table_cell',
      text: populatedCells.map((cell) => cell.value).join(' | '),
      sheet: 'CSV',
      row: rowNumber,
      cellRange: firstColumn === lastColumn
        ? `${firstColumn}${rowNumber}`
        : `${firstColumn}${rowNumber}:${lastColumn}${rowNumber}`,
    });
  }
  return blocks;
}

function spreadsheetColumnName(column: number): string {
  let value = column;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}
