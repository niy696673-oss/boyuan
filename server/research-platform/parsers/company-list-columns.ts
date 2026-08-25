const COMPANY_HEADERS = new Set(['公司名称', '企业名称', 'company', 'name']);

export function companyColumnIndex(row: string[]): number | undefined {
  const index = row.findIndex((value) => COMPANY_HEADERS.has(normalizeHeader(value)));
  return index >= 0 ? index : undefined;
}

export function normalizeCell(value: string): string {
  return [...value.normalize('NFKC')]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint === 9 || codePoint === 10 || codePoint === 13 || (codePoint >= 32 && codePoint !== 127);
    })
    .join('')
    .trim();
}

function normalizeHeader(value: string): string {
  return normalizeCell(value).replace(/[\s_-]+/gu, '').toLowerCase();
}
