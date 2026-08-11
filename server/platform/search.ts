import { createHash } from "node:crypto";
import type { User } from "../../src/types.js";
import type { Store } from "../store.js";
import type { Database } from "./database.js";
import type { HybridSearch, SearchHit } from "./contracts.js";

function tokens(text: string) {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const chinese = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  for (let index = 0; index < chinese.length - 1; index += 1)
    words.push(`${chinese[index]}${chinese[index + 1]}`);
  return [...new Set(words)];
}

export function deterministicEmbedding(text: string, dimensions = 384) {
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokens(text)) {
    const digest = createHash("sha256").update(token).digest();
    const position = digest.readUInt32BE(0) % dimensions;
    vector[position] += digest[4] % 2 ? 1 : -1;
  }
  const magnitude =
    Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

function cosine(a: number[], b: number[]) {
  let result = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1)
    result += a[index] * b[index];
  return result;
}

export class MemoryHybridSearch implements HybridSearch {
  constructor(private readonly store: Store) {}
  async search(
    query: string,
    user: User,
    companyId?: string,
    limit = 12,
  ): Promise<SearchHit[]> {
    const queryTokens = tokens(query);
    const queryVector = deterministicEmbedding(query);
    const rows = this.store.data.companies
      .filter((company) => !companyId || company.id === companyId)
      .flatMap((company) =>
        company.evidence
          .filter((evidence) => this.store.canSee(user, evidence))
          .map((evidence) => {
            const content = `${evidence.fileName} ${evidence.excerpt}`;
            const contentTokens = tokens(content);
            const matches = queryTokens.filter((token) =>
              contentTokens.some(
                (candidate) =>
                  candidate.includes(token) || token.includes(candidate),
              ),
            ).length;
            const keywordScore = queryTokens.length
              ? matches / queryTokens.length
              : 0;
            const vectorScore = Math.max(
              0,
              cosine(queryVector, deterministicEmbedding(content)),
            );
            return {
              id: evidence.id,
              companyId: company.id,
              documentId: evidence.documentId,
              fileName: evidence.fileName,
              excerpt: evidence.excerpt,
              visibility: evidence.visibility,
              keywordScore,
              vectorScore,
              score: keywordScore * 0.45 + vectorScore * 0.55,
            };
          }),
      )
      .filter((row) => row.keywordScore > 0 || row.vectorScore > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return rows;
  }
  async indexEvidence() {
    return;
  }
}

export class PostgresHybridSearch implements HybridSearch {
  constructor(private readonly database: Database) {}
  async search(
    query: string,
    user: User,
    companyId?: string,
    limit = 12,
  ): Promise<SearchHit[]> {
    const rows = await this.database.hybridSearch({
      query,
      embedding: deterministicEmbedding(query),
      user,
      companyId,
      limit,
    });
    return rows.map((row) => ({
      id: row.evidence_id,
      companyId: row.company_id,
      documentId: row.document_id,
      fileName: row.file_name,
      excerpt: row.content,
      visibility: row.visibility,
      keywordScore: Number(row.keyword_score),
      vectorScore: Number(row.vector_score),
      score: Number(row.score),
    }));
  }
  async indexEvidence(input: Parameters<HybridSearch["indexEvidence"]>[0]) {
    await this.database.upsertEvidenceIndex({
      ...input,
      text: input.text,
      embedding: deterministicEmbedding(input.text),
    });
  }
}
