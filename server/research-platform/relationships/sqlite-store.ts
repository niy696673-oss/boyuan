import type { DatabaseSync } from 'node:sqlite';
import type { EvidenceRecord } from '../contracts.js';
import type {
  CompanyRelationshipCategory,
  CompanyRelationshipPanoramaRecord,
  CompanyRelationshipSourceKind,
  CompanyRelationshipVerificationStatus,
  ReplaceRelationshipInsightsInput,
  UpsertProjectLibraryRelationshipInput,
} from './contracts.js';

type EvidenceResolver = (evidenceId: string) => EvidenceRecord;

/**
 * Replaces one task's observations atomically with the caller's surrounding
 * transaction. Both material and external analysis persist their other result
 * records in that same transaction.
 */
export function replaceRelationshipInsights(
  database: DatabaseSync,
  nextId: () => string,
  input: ReplaceRelationshipInsightsInput,
): void {
  database.prepare('DELETE FROM company_relation_insights WHERE source_task_id = ?')
    .run(input.sourceTaskId);
  const unique = new Map<string, ReplaceRelationshipInsightsInput['relations'][number]>();
  for (const relation of input.relations) {
    const key = relationshipIdentity(
      relation.category,
      relation.targetName,
      relation.relationType,
    );
    const current = unique.get(key);
    unique.set(key, current
      ? { ...relation, evidenceIds: uniqueStrings([...current.evidenceIds, ...relation.evidenceIds]) }
      : { ...relation, evidenceIds: uniqueStrings(relation.evidenceIds) });
  }

  const insertInsight = database.prepare(`
    INSERT INTO company_relation_insights (
      insight_id, company_id, target_name, category, relation_type, description,
      source_task_id, source_document_id, source_label, source_kind, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEvidence = database.prepare(`
    INSERT OR IGNORE INTO company_relation_insight_evidence (insight_id, evidence_id)
    VALUES (?, ?)
  `);
  for (const relation of unique.values()) {
    const insightId = nextId();
    insertInsight.run(
      insightId,
      input.companyId,
      relation.targetName,
      relation.category,
      relation.relationType,
      relation.description,
      input.sourceTaskId,
      input.sourceDocumentId,
      input.sourceLabel,
      input.sourceKind,
      input.now,
      input.now,
    );
    for (const evidenceId of relation.evidenceIds) {
      insertEvidence.run(insightId, evidenceId);
    }
  }
}

export function upsertProjectLibraryRelationship(
  database: DatabaseSync,
  nextId: () => string,
  input: UpsertProjectLibraryRelationshipInput,
): void {
  database.prepare(`
    INSERT INTO company_relations (
      relation_id, from_company_id, to_company_id, relation_type, status,
      from_category, to_category, created_at, source_candidate_id, evidence_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(from_company_id, to_company_id, relation_type) DO UPDATE SET
      status = excluded.status,
      from_category = excluded.from_category,
      to_category = excluded.to_category,
      source_candidate_id = COALESCE(excluded.source_candidate_id, company_relations.source_candidate_id),
      evidence_id = COALESCE(excluded.evidence_id, company_relations.evidence_id),
      updated_at = excluded.updated_at
  `).run(
    nextId(),
    input.fromCompanyId,
    input.toCompanyId,
    input.relationType,
    input.status,
    input.fromCategory,
    input.toCategory,
    input.now,
    input.sourceCandidateId ?? null,
    input.evidenceId ?? null,
    input.now,
  );
}

export function listCompanyRelationshipPanorama(
  database: DatabaseSync,
  companyId: string,
  evidenceById: EvidenceResolver,
): CompanyRelationshipPanoramaRecord[] {
  const observations = [
    ...materialAndExternalObservations(database, companyId, evidenceById),
    ...projectLibraryObservations(database, companyId, evidenceById),
  ];
  return deduplicateSameSource(observations).sort(compareRelationships);
}

function materialAndExternalObservations(
  database: DatabaseSync,
  companyId: string,
  evidenceById: EvidenceResolver,
): CompanyRelationshipPanoramaRecord[] {
  const rows = database.prepare(`
    SELECT insight_id, target_name, category, relation_type, description,
      source_kind, source_label, updated_at
    FROM company_relation_insights
    WHERE company_id = ?
    ORDER BY updated_at DESC, insight_id DESC
  `).all(companyId) as unknown as Array<{
    insight_id: string;
    target_name: string;
    category: CompanyRelationshipCategory;
    relation_type: string;
    description: string;
    source_kind: CompanyRelationshipSourceKind;
    source_label: string;
    updated_at: string;
  }>;
  const evidenceStatement = database.prepare(`
    SELECT evidence_id FROM company_relation_insight_evidence
    WHERE insight_id = ? ORDER BY evidence_id
  `);
  return rows.map((row) => ({
    relationshipId: row.insight_id,
    targetName: row.target_name,
    category: row.category,
    relationType: row.relation_type,
    description: row.description,
    sourceKind: row.source_kind,
    sourceLabel: row.source_label,
    verificationStatus: 'unverified',
    evidence: evidenceIds(evidenceStatement, row.insight_id).map(evidenceById),
    updatedAt: row.updated_at,
  }));
}

function projectLibraryObservations(
  database: DatabaseSync,
  companyId: string,
  evidenceById: EvidenceResolver,
): CompanyRelationshipPanoramaRecord[] {
  const rows = database.prepare(`
    SELECT relation.relation_id, relation.from_company_id, relation.to_company_id,
      relation.relation_type, relation.status, relation.from_category,
      relation.to_category, relation.source_candidate_id, relation.evidence_id,
      relation.created_at, relation.updated_at,
      target.company_id AS target_company_id, target.canonical_name AS target_name
    FROM company_relations relation
    JOIN companies target ON target.company_id = CASE
      WHEN relation.from_company_id = ? THEN relation.to_company_id
      ELSE relation.from_company_id
    END
    WHERE relation.from_company_id = ? OR relation.to_company_id = ?
    ORDER BY COALESCE(relation.updated_at, relation.created_at) DESC, relation.relation_id DESC
  `).all(companyId, companyId, companyId) as unknown as Array<{
    relation_id: string;
    from_company_id: string;
    to_company_id: string;
    relation_type: string;
    status: string;
    from_category: CompanyRelationshipCategory | null;
    to_category: CompanyRelationshipCategory | null;
    source_candidate_id: string | null;
    evidence_id: string | null;
    created_at: string;
    updated_at: string | null;
    target_company_id: string;
    target_name: string;
  }>;
  return rows.map((row) => {
    const outgoing = row.from_company_id === companyId;
    const category = (outgoing ? row.from_category : row.to_category)
      ?? legacyProjectLibraryCategory(row.relation_type, outgoing);
    const ids = projectLibraryEvidenceIds(
      database,
      row.source_candidate_id,
      row.evidence_id,
    );
    const evidence = ids.map(evidenceById);
    return {
      relationshipId: row.relation_id,
      targetName: row.target_name,
      targetCompanyId: row.target_company_id,
      category,
      relationType: row.relation_type,
      description: projectLibraryDescription(
        database,
        row.source_candidate_id,
        evidence,
        `${row.target_name}与当前主体存在${row.relation_type}关系。`,
      ),
      sourceKind: 'project_library',
      sourceLabel: '企业项目库',
      verificationStatus: relationshipStatus(row.status),
      evidence,
      updatedAt: row.updated_at ?? row.created_at,
    };
  });
}

function projectLibraryEvidenceIds(
  database: DatabaseSync,
  sourceCandidateId: string | null,
  directEvidenceId: string | null,
): string[] {
  const ids = directEvidenceId ? [directEvidenceId] : [];
  if (!sourceCandidateId) return ids;
  const rows = database.prepare(`
    SELECT evidence_id FROM candidate_evidence
    WHERE candidate_id = ? AND status = 'supporting'
    UNION
    SELECT knowledge_evidence.evidence_id
    FROM knowledge_evidence
    JOIN knowledge ON knowledge.knowledge_id = knowledge_evidence.knowledge_id
    WHERE knowledge.source_candidate_id = ?
    ORDER BY evidence_id
  `).all(sourceCandidateId, sourceCandidateId) as unknown as Array<{ evidence_id: string }>;
  return uniqueStrings([...ids, ...rows.map((row) => row.evidence_id)]);
}

function projectLibraryDescription(
  database: DatabaseSync,
  sourceCandidateId: string | null,
  evidence: EvidenceRecord[],
  fallback: string,
): string {
  const knowledge = sourceCandidateId
    ? database.prepare(`
        SELECT statement FROM knowledge WHERE source_candidate_id = ?
        ORDER BY created_at DESC, knowledge_id DESC LIMIT 1
      `).get(sourceCandidateId) as { statement: string } | undefined
    : undefined;
  return knowledge?.statement ?? evidence[0]?.quote ?? fallback;
}

function deduplicateSameSource(
  observations: CompanyRelationshipPanoramaRecord[],
): CompanyRelationshipPanoramaRecord[] {
  const unique = new Map<string, CompanyRelationshipPanoramaRecord>();
  for (const observation of observations) {
    const targetKey = observation.targetCompanyId
      ? `company:${observation.targetCompanyId}`
      : `name:${normalizeRelationshipLabel(observation.targetName)}`;
    const key = [
      observation.sourceKind,
      observation.category,
      targetKey,
      normalizeRelationshipLabel(observation.relationType),
    ].join('\u0000');
    const current = unique.get(key);
    if (!current) {
      unique.set(key, observation);
      continue;
    }
    const preferred = preferObservation(current, observation);
    unique.set(key, {
      ...preferred,
      evidence: uniqueEvidence([...current.evidence, ...observation.evidence]),
    });
  }
  return [...unique.values()];
}

function preferObservation(
  left: CompanyRelationshipPanoramaRecord,
  right: CompanyRelationshipPanoramaRecord,
): CompanyRelationshipPanoramaRecord {
  const statusDifference = statusPriority(left.verificationStatus)
    - statusPriority(right.verificationStatus);
  if (statusDifference !== 0) return statusDifference < 0 ? left : right;
  return right.updatedAt > left.updatedAt ? right : left;
}

function compareRelationships(
  left: CompanyRelationshipPanoramaRecord,
  right: CompanyRelationshipPanoramaRecord,
): number {
  return displayPriority(left) - displayPriority(right)
    || right.updatedAt.localeCompare(left.updatedAt)
    || left.targetName.localeCompare(right.targetName, 'zh-CN')
    || left.relationType.localeCompare(right.relationType, 'zh-CN')
    || left.relationshipId.localeCompare(right.relationshipId);
}

function displayPriority(item: CompanyRelationshipPanoramaRecord): number {
  if (item.sourceKind === 'project_library') {
    if (item.verificationStatus === 'confirmed') return 0;
    if (item.verificationStatus === 'conflicted') return 1;
    return 2;
  }
  return item.sourceKind === 'external' ? 3 : 4;
}

function statusPriority(status: CompanyRelationshipVerificationStatus): number {
  if (status === 'confirmed') return 0;
  if (status === 'conflicted') return 1;
  if (status === 'candidate') return 2;
  return 3;
}

function relationshipStatus(value: string): CompanyRelationshipVerificationStatus {
  if (value === 'confirmed' || value === 'active') return 'confirmed';
  if (value === 'conflicted' || value === 'disputed') return 'conflicted';
  return 'candidate';
}

function legacyProjectLibraryCategory(
  relationType: string,
  outgoing: boolean,
): CompanyRelationshipCategory {
  if (/(?:竞争|竞品|替代|同层)/u.test(relationType)) return 'competitor';
  if (/(?:客户|采购|订单)/u.test(relationType)) return 'customer';
  if (/(?:供应|上游|原料|设备|技术提供)/u.test(relationType)) return 'upstream';
  if (/(?:下游|渠道|经销|交付|合作伙伴)/u.test(relationType)) return 'downstream';
  return outgoing ? 'downstream' : 'upstream';
}

function relationshipIdentity(
  category: CompanyRelationshipCategory,
  targetName: string,
  relationType: string,
): string {
  return [
    category,
    normalizeRelationshipLabel(targetName),
    normalizeRelationshipLabel(relationType),
  ].join('\u0000');
}

function normalizeRelationshipLabel(value: string): string {
  return value.normalize('NFKC').replace(/[\s\u3000]+/gu, '').toLocaleLowerCase('zh-CN');
}

function evidenceIds(statement: ReturnType<DatabaseSync['prepare']>, id: string): string[] {
  return (statement.all(id) as unknown as Array<{ evidence_id: string }>)
    .map((row) => row.evidence_id);
}

function uniqueEvidence(evidence: EvidenceRecord[]): EvidenceRecord[] {
  return [...new Map(evidence.map((item) => [item.evidenceId, item])).values()];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
