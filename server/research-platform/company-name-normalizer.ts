import { basename } from "node:path";

const LEGAL_SUFFIX = /股份有限公司|有限责任公司|有限公司/gu;
const LEGAL_NAME =
  /^[\p{Script=Han}A-Za-z0-9（）()·&]{2,48}(?:股份有限公司|有限责任公司|有限公司)$/u;
const SUBJECT_BOUNDARY =
  /(?:公司主体|项目主体|企业主体|项目公司|企业名称|公司名称|主体|全称)\s*(?:是|为|[:：])?\s*/gu;
const RELATION_BOUNDARY =
  /(?:(?:已经?|已)\s*)?(?:纳入|进入)(?:了)?\s*|(?:合作方|客户|供应商|投资方)\s*(?:是|为|[:：])?\s*|(?:来自|服务于|隶属于)\s*|(?:^|[）)】])(?:受|由)\s*/gu;
const SENTENCE_WORDS =
  /(?:已经|纳入|供应体系|公司主体|项目主体|企业主体|成立于|计划成立|拟成立|材料提到|团队|致力于|专注于|是一家)/u;

export function normalizeCompanyNameCandidate(
  value: string,
): string | undefined {
  const fileName = basename(value.trim());
  const withoutExtension = fileName.replace(
    /(?:\.(?:pdf|txt|docx?|pptx?|md|ocr))+$/iu,
    "",
  );
  const normalized = withoutExtension
    .normalize("NFKC")
    .replace(/(?:pdf|pptx?|docx?|txt)$/iu, "")
    .replace(/\s*\(\d+\)\s*$/u, "")
    .replace(/^(?:创新组|创业组)\s*\d+\s*\+\s*/u, "")
    .replace(
      /^(?:推荐方|推荐机构|机构)\s*[:：]\s*[\p{L}\p{N}（）()·&]{2,24}\s*[-_—–:：]+\s*/u,
      "",
    )
    .replace(
      /^[\p{L}\p{N}（）()·&]{2,24}(?:推荐|推荐项目)\s*[-_—–:：]+\s*/u,
      "",
    )
    .replace(/\s*(?:only\s+for|for)\s*博源资本\s*$/iu, "")
    .replace(/\s*[-_—–]+\s*(?:博源资本|博源|青桐资本|芯湃推荐)\s*$/u, "")
    .replace(/\s*[-_—–]?\s*v(?:er(?:sion)?)?\s*\d+(?:\.\d+)*\s*$/iu, "")
    .replace(
      /\s*(?:BP|MP)\s*@?\s*(?:(?:19|20)\d{6}|(?:19|20)\d{2}|\d{2}年\d{1,2}月(?:\d{1,2}日?)?)\s*$/iu,
      "",
    )
    .replace(
      /\s*(?:19|20)\d{2}(?:(?:年\d{1,2}月?(?:\d{1,2}日?)?)|(?:[-_./]\d{1,2}){1,2})?\s*$/u,
      "",
    )
    .replace(
      /\s*(?:商业融资计划书|商业计划书|融资计划书|募集说明书|项目介绍|公司介绍|公司简介|路演材料?|Pre-NDA材料|BP|MP)\s*$/iu,
      "",
    )
    .replace(/^【(.+)】$/u, "$1")
    .replace(/^[\[【]|[\]】]$/gu, "")
    .replace(/^[-_—–:：\s]+|[-_—–:：\s]+$/gu, "")
    .trim();
  return normalized || undefined;
}

export function extractLegalCompanyName(text: string): string | undefined {
  const candidates = text
    .normalize("NFKC")
    .split(/[，,。；;！？!?\n\r]/u)
    .flatMap(legalCandidatesFromClause)
    .sort(
      (left, right) => right.score - left.score || left.order - right.order,
    );
  return candidates[0]?.name;
}

function legalCandidatesFromClause(
  clause: string,
): Array<{ name: string; order: number; score: number }> {
  const candidates: Array<{ name: string; order: number; score: number }> = [];
  let suffix: RegExpExecArray | null;
  LEGAL_SUFFIX.lastIndex = 0;
  while ((suffix = LEGAL_SUFFIX.exec(clause)) !== null) {
    const suffixEnd = suffix.index + suffix[0].length;
    const prefix = clause.slice(0, suffixEnd);
    const boundary = lastBoundary(prefix);
    const raw = prefix.slice(boundary.end);
    const name = trimLegalNameDescriptor(raw);
    const score = scoreLegalName(name, boundary.score);
    if (score !== undefined)
      candidates.push({ name, order: suffix.index, score });
  }
  return candidates;
}

function lastBoundary(value: string): { end: number; score: number } {
  let result = { end: 0, score: 0 };
  for (const [pattern, score] of [
    [SUBJECT_BOUNDARY, 50],
    [RELATION_BOUNDARY, 25],
  ] as const) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      const end = (match.index ?? 0) + match[0].length;
      if (end >= result.end) result = { end, score };
    }
  }
  return result;
}

function trimLegalNameDescriptor(value: string): string {
  let result = value.trim();
  const descriptors =
    /^(?:了|的|一家|一个|作为|国内(?:领先|知名|头部)?的?|全球(?:领先|知名|头部)?的?|行业(?:领先|知名|头部)?的?|领先的?|知名的?|头部的?|专业的?|创新型的?)/u;
  while (descriptors.test(result)) result = result.replace(descriptors, "");
  return result.replace(/^[^\p{L}\p{N}]+/u, "").replace(/\s+/gu, "");
}

function scoreLegalName(
  name: string,
  boundaryScore: number,
): number | undefined {
  if (!LEGAL_NAME.test(name) || SENTENCE_WORDS.test(name)) return undefined;
  const baseLength = name.replace(
    /(?:股份有限公司|有限责任公司|有限公司)$/u,
    "",
  ).length;
  if (baseLength < 2 || baseLength > 36) return undefined;
  const lengthScore = baseLength <= 24 ? 20 : 36 - baseLength;
  return 40 + boundaryScore + lengthScore;
}
