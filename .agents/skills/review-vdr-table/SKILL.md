---
name: review-vdr-table
description: Review a supplied VDR inventory, request-list mapping, or tabular document population for coverage, entity, period, version, signature, staleness, readability, duplication, and conflicts in private-market financing, VC, PE, or FA diligence. Use only when the user explicitly asks to review a data-room table, build a VDR index, map files to a DD checklist, identify missing or conflicting documents, or disclose sampling coverage. Do not use to create the request universe, extract substantive risks from absence alone, execute spreadsheet formulas or macros, decide legal effect, or claim unverified completeness.
---

# Review a VDR Table

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Own inventory, coverage, gaps, and conflicts. Preserve the one-way chain:

`Checklist request universe -> VDR coverage/gaps/conflicts -> substantive risk flags`

Never route a missing file directly to a substantive risk conclusion.

## Establish the population

1. Obtain the approved request universe or an explicit substitute population. If neither exists, stop and request one; do not invent completeness criteria.
2. Record VDR snapshot time, source system, access scope, entities, folders, total visible files, inaccessible areas, extraction method, and reviewer.
3. Probe available capabilities for VDR access, OCR, archive handling, spreadsheets, and recalculation. State unavailable capabilities and return a CSV-ready schema when necessary.
4. Open source files read-only. Do not enable macros, external links, embedded executables, or active content.

Obtain `input_scope_approval` for the reviewed population and access class. Tag substantive extracted items as `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, or `conflicting`. Preserve `as_of_date`, `source_register`, `calculation_lineage`, and `conflict_log` separately from coverage states.

Apply source precedence: signed or official originals; audited or regulatory sources; authorized user working files; reproducible calculations; inference. Use precedence to describe authority, not to delete lower-ranked conflicting versions.

Use [vdr-review-contract.md](references/vdr-review-contract.md) for row types and coverage calculations. Apply [tabular-safety.md](references/tabular-safety.md) before exporting any user-controlled text to CSV/XLSX.

## Normalize without losing lineage

1. Assign stable `document_id` and preserve original path/name in source-language form.
2. Record entity, document type, period, version/date, signature/seal state, source, file hash if available, readability, OCR status, and confidentiality.
3. Map each document to zero, one, or multiple `request_id` values with a mapping rationale.
4. Keep duplicates, superseded versions, amendments, and governing-document chains linked rather than silently deleting them.
5. Store extracted values separately from the raw source span. Never overwrite raw text with normalized text.

## Determine coverage states

Use these exact item states:

- `verified-covered`: acceptance criteria were checked and satisfied;
- `partially-covered`: some entities, periods, fields, versions, or signatures are missing;
- `not-present`: no responsive item was found within the disclosed population;
- `unclear`: possible responsive material exists but mapping or meaning is ambiguous;
- `unreadable`: file exists but could not be reliably reviewed;
- `needs-review`: human or specialist judgment is required;
- `not-applicable-approved`: an authorized scope owner approved non-applicability.

`not-present` means “not found in the reviewed population,” not “does not exist.” Do not infer zero, no liability, compliance, ownership, effectiveness, or absence of risk.

## Detect exceptions and contradictions

1. Compare entity, period, amount, party, effective date, version, signature, and amendment relationships.
2. Record both sides of every conflict with source locations.
3. Separate extraction uncertainty from a source conflict.
4. Route legal effect, accounting treatment, technical validity, and materiality to the responsible professional.
5. Pass only substantive source evidence and explicit contradictions to `$extract-risk-flags`; pass coverage gaps separately.

## Disclose coverage and sampling

Report total visible population, in-scope population, processed, unreadable, inaccessible, out-of-scope, sampled, and spot-checked counts. Identify the sampling method and unsampled strata.

Do not say `complete`, `fully diligenced`, or `no exceptions` unless all in-scope items and acceptance criteria were reviewed, inaccessible/unreadable counts are zero, exception resolution is documented, and the workstream owner approves that wording.

## Produce the Chinese deliverable

Default to Simplified Chinese and include:

1. VDR snapshot, access boundary, method, and limitations;
2. request-to-document coverage table;
3. normalized document/version/signature index;
4. gaps, unreadable items, duplicates, stale items, and conflicts;
5. coverage and sampling statement with counts and denominators;
6. specialist-review queue and one-way handoff package for risk extraction;
7. `source_register`, `calculation_lineage`, `conflict_log`, `as_of_date`, and confidentiality.

Keep schema keys in English. Preserve `unknown`, `conflicting`, and source-language quotations.

For extracted financial or valuation data, record CNY unit, accounting basis, valuation date, conversion method, and FX date as applicable. Preserve original text and mark unofficial translations.

## Apply human gates

- Require `method_assumption_approval` before applying a non-user mapping, sampling, spot-check, materiality, or completeness method.
- Require workstream leads to validate coverage and materiality wording.
- Require `external_release_approval` before distributing the index or exception tables outside the approved team.
- Require `external_state_mutation_approval` before uploading, renaming, moving, annotating, or changing VDR/workflow state; this Skill reviews read-only inputs.

## Stop conditions

Stop on encrypted/inaccessible files without authority, suspected malware or active content, corrupted archives, unclear population boundaries, or material OCR uncertainty. Do not bypass permissions, alter originals, execute formulas/macros, give legal conclusions, or make an investment decision.
