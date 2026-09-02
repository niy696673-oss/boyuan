import type { EvidenceRecord } from '../contracts.js';

export type CompanyRelationshipCategory =
  | 'upstream'
  | 'downstream'
  | 'customer'
  | 'competitor';

export type CompanyRelationshipSourceKind =
  | 'bp_self_report'
  | 'project_library'
  | 'external';

export type CompanyRelationshipVerificationStatus =
  | 'unverified'
  | 'candidate'
  | 'confirmed'
  | 'conflicted';

/** A single provenance-preserving relationship observation for the panorama. */
export interface CompanyRelationshipPanoramaRecord {
  relationshipId: string;
  targetName: string;
  targetCompanyId?: string;
  category: CompanyRelationshipCategory;
  relationType: string;
  description: string;
  sourceKind: CompanyRelationshipSourceKind;
  sourceLabel: string;
  verificationStatus: CompanyRelationshipVerificationStatus;
  evidence: EvidenceRecord[];
  updatedAt: string;
}

export interface RelationshipInsightDraft {
  targetName: string;
  category: CompanyRelationshipCategory;
  relationType: string;
  description: string;
  evidenceIds: string[];
}

export interface ReplaceRelationshipInsightsInput {
  companyId: string;
  sourceKind: Exclude<CompanyRelationshipSourceKind, 'project_library'>;
  sourceTaskId: string;
  sourceDocumentId: string;
  sourceLabel: string;
  relations: RelationshipInsightDraft[];
  now: string;
}

export interface UpsertProjectLibraryRelationshipInput {
  fromCompanyId: string;
  toCompanyId: string;
  relationType: string;
  fromCategory: CompanyRelationshipCategory;
  toCategory: CompanyRelationshipCategory;
  status: Exclude<CompanyRelationshipVerificationStatus, 'unverified'>;
  sourceCandidateId?: string;
  evidenceId?: string;
  now: string;
}
