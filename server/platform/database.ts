import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import type { User, Visibility } from "../../src/types.js";
import type { StoreData } from "../store.js";
import type { PlatformConfig } from "./config.js";

export interface IndexedEvidenceRow {
  evidenceId: string;
  companyId: string;
  documentId: string;
  fileName: string;
  text: string;
  visibility: Visibility;
  ownerId?: string;
  projectId?: string;
  embedding: number[];
}

export class Database {
  readonly pool: Pool;
  constructor(config: PlatformConfig) {
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 12,
      idleTimeoutMillis: 30_000,
    });
  }

  async ping() {
    await this.pool.query("select 1");
  }

  async loadPlatformState(): Promise<StoreData | null> {
    const result = await this.pool.query(
      "select payload from platform_state where id=true",
    );
    return result.rowCount ? (result.rows[0].payload as StoreData) : null;
  }

  async savePlatformState(data: StoreData) {
    await this.pool.query(
      `insert into platform_state(id,payload,updated_at) values(true,$1::jsonb,now())
       on conflict(id) do update set payload=excluded.payload, updated_at=excluded.updated_at`,
      [JSON.stringify(data)],
    );
  }

  async ensureBootstrapAdmin(input: { email: string; passwordHash: string }) {
    await this.pool.query(
      `insert into app_users(id,email,password_hash,name,role)
       values('u-system',$1,$2,'系统管理员','system_admin')
       on conflict(id) do update set email=excluded.email, password_hash=excluded.password_hash, active=true`,
      [input.email, input.passwordHash],
    );
  }

  async migrate() {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "migrations",
    );
    const files = (await fs.readdir(root))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    await this.pool.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    for (const name of files) {
      const exists = await this.pool.query(
        "select 1 from schema_migrations where name=$1",
        [name],
      );
      if (exists.rowCount) continue;
      const sql = await fs.readFile(path.join(root, name), "utf8");
      const client = await this.pool.connect();
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into schema_migrations(name) values($1)", [
          name,
        ]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByEmail(
    email: string,
  ): Promise<{ user: User; passwordHash: string } | null> {
    const result = await this.pool.query(
      `select u.id, u.name, u.role, u.password_hash,
              coalesce(array_agg(pm.project_id) filter (where pm.project_id is not null), '{}') project_ids
         from app_users u
         left join project_members pm on pm.user_id = u.id
        where lower(u.email)=lower($1) and u.active=true
        group by u.id`,
      [email],
    );
    if (!result.rowCount) return null;
    const row = result.rows[0];
    return {
      user: {
        id: row.id,
        name: row.name,
        role: row.role,
        projectIds: row.project_ids,
      },
      passwordHash: row.password_hash,
    };
  }

  async upsertEvidenceIndex(row: IndexedEvidenceRow) {
    await this.pool.query(
      `insert into evidence_index
        (evidence_id, company_id, document_id, file_name, content, visibility, owner_id, project_id, embedding)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector)
       on conflict (evidence_id) do update set
         company_id=excluded.company_id, document_id=excluded.document_id,
         file_name=excluded.file_name, content=excluded.content,
         visibility=excluded.visibility, owner_id=excluded.owner_id,
         project_id=excluded.project_id, embedding=excluded.embedding, updated_at=now()`,
      [
        row.evidenceId,
        row.companyId,
        row.documentId,
        row.fileName,
        row.text,
        row.visibility,
        row.ownerId || null,
        row.projectId || null,
        `[${row.embedding.join(",")}]`,
      ],
    );
  }

  async hybridSearch(input: {
    query: string;
    embedding: number[];
    user: User;
    companyId?: string;
    limit: number;
  }) {
    const result = await this.pool.query(
      `with ranked as (
         select evidence_id, company_id, document_id, file_name, content, visibility,
                ts_rank_cd(search_vector, plainto_tsquery('simple', $1)) keyword_score,
                1 - (embedding <=> $2::vector) vector_score
           from evidence_index
          where ($3::text is null or company_id=$3)
            and (
              visibility='organization'
              or (visibility='private' and owner_id=$4)
              or (visibility='project' and project_id=any($5::text[]))
            )
       )
       select *, (keyword_score * 0.45 + vector_score * 0.55) score
         from ranked
        where $3::text is not null or keyword_score > 0 or vector_score > 0.2
        order by score desc
        limit $6`,
      [
        input.query,
        `[${input.embedding.join(",")}]`,
        input.companyId || null,
        input.user.id,
        input.user.projectIds,
        input.limit,
      ],
    );
    return result.rows;
  }

  async createDocument(input: {
    id: string;
    fileName: string;
    fileType: string;
    fileHash: string;
    size: number;
    objectKey: string;
    visibility: Visibility;
    uploadedBy: string;
    ownerId?: string;
    projectId?: string;
  }) {
    await this.pool.query(
      `insert into documents(id,file_name,file_type,file_hash,size_bytes,object_key,visibility,owner_id,project_id,uploaded_by,parse_status)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'待解析')
       on conflict(file_hash) do nothing`,
      [
        input.id,
        input.fileName,
        input.fileType,
        input.fileHash,
        input.size,
        input.objectKey,
        input.visibility,
        input.ownerId || null,
        input.projectId || null,
        input.uploadedBy,
      ],
    );
  }

  async updateDocumentStatus(
    id: string,
    status: string,
    failureReason?: string,
  ) {
    await this.pool.query(
      "update documents set parse_status=$2, failure_reason=$3, updated_at=now() where id=$1",
      [id, status, failureReason || null],
    );
  }

  async recordRetrieval(input: {
    taskId: string;
    userId: string;
    query: string;
    hitCount: number;
    latencyMs: number;
  }) {
    await this.pool.query(
      "insert into retrieval_events(task_id,user_id,query,hit_count,latency_ms) values($1,$2,$3,$4,$5)",
      [
        input.taskId,
        input.userId,
        input.query,
        input.hitCount,
        input.latencyMs,
      ],
    );
  }

  async recordModelCall(input: {
    taskId: string;
    userId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    success: boolean;
  }) {
    await this.pool.query(
      `insert into model_call_events(task_id,user_id,provider,model,input_tokens,output_tokens,latency_ms,success)
       values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.taskId,
        input.userId,
        input.provider,
        input.model,
        input.inputTokens,
        input.outputTokens,
        input.latencyMs,
        input.success,
      ],
    );
  }

  async recordCitationQuality(input: {
    taskId: string;
    valid: number;
    total: number;
  }) {
    await this.pool.query(
      "insert into citation_quality_events(task_id,valid_count,total_count) values($1,$2,$3)",
      [input.taskId, input.valid, input.total],
    );
  }

  async close() {
    await this.pool.end();
  }
}
