import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const root = process.cwd();
const databasePath = path.join(
  root,
  "data",
  "research-platform",
  "database",
  "platform.sqlite",
);
const db = new DatabaseSync(databasePath);

const company = db.prepare(`
  SELECT company_id FROM companies
  WHERE canonical_name = ?
`).get("苏州兆鑫驰智能科技有限公司");
if (!company) throw new Error("demo company is missing");

const task = db.prepare(`
  SELECT at.task_id
  FROM analysis_tasks at
  JOIN conversations c ON c.conversation_id = at.conversation_id
  JOIN conversation_companies cc ON cc.conversation_id = c.conversation_id
  WHERE cc.company_id = ? AND at.status = 'completed'
  ORDER BY at.updated_at DESC
  LIMIT 1
`).get(company.company_id);
if (!task) throw new Error("completed GPT analysis task is missing");

const materialEvidence = db.prepare(`
  SELECT e.evidence_id
  FROM evidence e
  JOIN parsed_blocks pb ON pb.block_id = e.block_id
  JOIN conversation_documents cd ON cd.document_id = e.document_id
  JOIN analysis_tasks at ON at.conversation_id = cd.conversation_id
  WHERE at.task_id = ? AND pb.page = 15
  ORDER BY e.created_at DESC
  LIMIT 1
`).get(task.task_id);

const now = new Date().toISOString();
const seeds = [
  {
    key: "partner-baohan",
    knowledgeType: "relationship_partner",
    value: "宝涵租赁有限公司",
    statement:
      "宝涵租赁有限公司通过“昆育融+融资租赁+知识产权”方案为苏州兆鑫驰提供融资支持，构成已披露的服务合作关系。",
    title: "一季度融资租赁金额超17亿元！金融创新助力宝涵租赁再创新佳绩",
    site: "第一昆山",
    url: "https://www.ksrmtzx.com/wap/news/159468?overtime=null&type=null",
    quote:
      "创控集团下属宝涵租赁有限公司为江苏东玄基因科技有限公司、苏州兆鑫驰智能科技有限公司提供600万元“昆育融+融资租赁+知识产权”融资支持。",
    publishedAt: "2023-05-05",
  },
  {
    key: "customer-weishuo",
    knowledgeType: "relationship_customer",
    value: "昆山玮硕恒基智能科技股份有限公司",
    statement:
      "昆山玮硕恒基智能科技股份有限公司在2019年至2023年上半年持续向苏州兆鑫驰采购MIM固定架、连接件及模具，是已披露的下游客户。",
    title: "昆山玮硕恒基智能科技股份有限公司首次公开发行审核问询回复",
    site: "公开发行审核文件",
    url: "https://file.finance.sina.com.cn/211.154.219.97:9494/MRGG/CNSESZ_STOCK/2023/2023-9/2023-09-27/9547887.PDF",
    quote:
      "报告期内，苏州兆鑫驰为发行人及嘉华电子的共同供应商。发行人主要自苏州兆鑫驰采购笔记本电脑转轴的固定架、连接件等产品。",
    publishedAt: "2023-09-27",
  },
  {
    key: "upstream-exin",
    knowledgeType: "relationship_supplier",
    value: "苏州市毅鑫新材料科技有限公司",
    statement:
      "苏州市毅鑫新材料科技有限公司处于苏州兆鑫驰MIM业务的金属粉末与喂料上游环节；这是产业链位置推断，不代表双方存在已核实的直接采购关系。",
    title: "苏州市毅鑫新材料科技有限公司",
    site: "企业官网",
    url: "https://www.suz-exin.com/",
    quote:
      "公司业务涵盖金属粉末材料销售，同时可为客户提供新材料应用开发、生产工艺难题攻克等技术支撑与喂料整体解决方案。",
    publishedAt: undefined,
    includeMaterialEvidence: true,
  },
];

const id = (kind, key) =>
  `${kind}-${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;

db.exec("BEGIN IMMEDIATE");
try {
  for (const seed of seeds) {
    const evidenceId = id("web", seed.key);
    const candidateId = id("candidate", seed.key);
    db.prepare(`
      INSERT OR IGNORE INTO evidence (
        evidence_id, source_type, quote, title, site, url,
        published_at, retrieved_at, created_at
      ) VALUES (?, 'web', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evidenceId,
      seed.quote,
      seed.title,
      seed.site,
      seed.url,
      seed.publishedAt ?? null,
      now,
      now,
    );
    db.prepare(`
      INSERT OR IGNORE INTO knowledge_candidates (
        candidate_id, task_id, company_id, section_key, knowledge_type,
        statement, value, status, version, high_impact, sensitive,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'industry_chain_position', ?, ?, ?, 'pending', 1, 1, 0, ?, ?)
    `).run(
      candidateId,
      task.task_id,
      company.company_id,
      seed.knowledgeType,
      seed.statement,
      seed.value,
      now,
      now,
    );
    db.prepare(`
      INSERT OR IGNORE INTO candidate_evidence (
        candidate_id, evidence_id, status, updated_at
      ) VALUES (?, ?, 'supporting', ?)
    `).run(candidateId, evidenceId, now);
    if (seed.includeMaterialEvidence && materialEvidence) {
      db.prepare(`
        INSERT OR IGNORE INTO candidate_evidence (
          candidate_id, evidence_id, status, updated_at
        ) VALUES (?, ?, 'supporting', ?)
      `).run(candidateId, materialEvidence.evidence_id, now);
    }
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}

console.log(JSON.stringify({
  companyId: company.company_id,
  taskId: task.task_id,
  candidates: seeds.map((seed) => ({
    candidateId: id("candidate", seed.key),
    knowledgeType: seed.knowledgeType,
    value: seed.value,
  })),
}, null, 2));
