# VDR review contract

## Artifact envelope

Record `artifact_type: vdr_coverage_review`, `deal_id`, VDR snapshot, `side`, `stage`, `as_of_date`, `confidentiality`, `source_register`, `calculation_lineage`, `conflict_log`, population boundary, and `gate_status`. Use the exact evidence states `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`; keep these separate from coverage states. Record all four shared gate events as `approved`, `pending`, or `not_required`.

## Document inventory fields

`document_id`, `original_path`, `original_name`, `file_type`, `file_hash`, `entity`, `document_type`, `period_start`, `period_end`, `document_date`, `effective_date`, `version`, `signature_state`, `seal_state`, `amendment_parent_id`, `language`, `readability`, `ocr_state`, `confidentiality`, `source_location`.

Use `unknown` instead of blank values when a field was reviewed but cannot be established.

## Request mapping fields

`request_id`, `document_id`, `mapping_basis`, `acceptance_criteria_checked`, `coverage_state`, `coverage_explanation`, `reviewer`, `reviewed_at`, `exception_ids`.

## Exception types

- `missing_scope_item`
- `partial_period_or_entity`
- `stale_version`
- `unsigned_or_unsealed`
- `unreadable_or_corrupt`
- `duplicate_or_superseded`
- `source_conflict`
- `mapping_unclear`
- `specialist_review_required`

Every exception must link source/request IDs, describe what was observed, and avoid a substantive legal or investment conclusion.

## Coverage statement

Report counts for:

- `visible_population`
- `in_scope_population`
- `processed_population`
- `sampled_population`
- `spot_checked_population`
- `unreadable_population`
- `inaccessible_population`
- `out_of_scope_population`

Calculate ratios only when the denominator is defined. Disclose duplicate treatment and whether pages, files, folders, or requests are the unit of count. Do not equate file-count coverage with substantive diligence coverage.

## One-way handoff

Send two distinct arrays downstream:

1. `coverage_gaps[]` with request and population context;
2. `substantive_evidence_candidates[]` with exact source spans and contradictions.

Risk extraction may analyze the second array. The first remains gaps unless additional evidence supports a risk.
