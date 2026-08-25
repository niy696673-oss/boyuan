---
name: build-dd-checklist
description: Build a scoped, stage-aware due-diligence request universe for China-focused private-market financing, VC, PE, or FA work. Use when the user explicitly asks for a DD checklist, request list, data-room request, workstream scope, or missing-material request plan. Do not use to review an existing VDR inventory, extract substantive risk flags, draft interview questions, perform legal or accounting diligence, or make an investment decision.
---

# Build a DD Checklist

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Create the request universe at the start of the one-way diligence chain:

`Checklist request universe -> VDR coverage/gaps/conflicts -> substantive risk flags`

Do not infer risk from missing materials. Record the missing item as a request or coverage gap for downstream review.

## Establish the mandate

1. Capture `side`, `stage`, `deal_type`, `sector`, `jurisdiction`, `target_round`, `audience`, `confidentiality`, `as_of_date`, and available materials.
2. Obtain `input_scope_approval` before issuing a final request list. If approval is unavailable, label the result `DRAFT FOR SCOPE APPROVAL`.
3. Separate the workstreams owned by the investment team, technical specialists, accountants, counsel, tax advisers, and other experts.
4. State capability limits. If VDR access, OCR, or spreadsheet generation is unavailable, return a structured Simplified-Chinese table or CSV-ready schema instead of claiming that files were inspected or created.

Tag substantive inputs as `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, or `conflicting`. Preserve an artifact-level `as_of_date`, `source_register`, `calculation_lineage`, and `conflict_log`; an empty calculation lineage is still explicit.

Apply source precedence: signed or official originals; audited or regulatory sources; authorized user working files; reproducible calculations; inference. Preserve rather than resolve source conflicts in the request artifact.

## Build the request universe

1. Create a stable `request_id` for every requested item.
2. Apply the baseline and only the relevant overlays from [workstream-overlays.md](references/workstream-overlays.md).
3. Define the requested entity, period, document form, freshness, rationale, owner, priority, confidentiality, and acceptance criteria.
4. Link each request to a diligence question or thesis hypothesis without stating a conclusion.
5. Deduplicate requests while preserving all workstream owners and rationales.
6. Mark existing materials as `provided-unverified`; do not mark them satisfied until coverage review validates entity, period, version, signatures, and readability.

Use the row contract and status vocabulary in [checklist-contract.md](references/checklist-contract.md). Preserve the shared evidence states exactly: `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, `conflicting`.

When exporting CSV/XLSX, preserve the raw value separately and neutralize user-controlled display values whose first non-whitespace character is `=`, `+`, `-`, or `@`, as well as leading control characters. Never create a formula from source text.

## Apply China private-market controls

- Cover corporate history, actual controller, cap table, nominee holdings, prior financings, ESOP, related parties, IP ownership chain, permits, labor and social insurance, tax, data/security, and transaction approvals when relevant.
- For hard technology, advanced manufacturing, military-adjacent activities, export controls, data localization, cybersecurity, or sector licensing, create verification requests and questions only. Do not state a legal conclusion without current primary authority and the responsible professional.
- Keep business DD, technical DD, FDD, LDD, tax, and specialist scopes distinguishable. Attribute professional conclusions to their owner.
- Request personal or sensitive information only when necessary, permissioned, proportionate, and assigned an access class.

## Produce the Chinese deliverable

Default to Simplified Chinese and include:

1. scope, stage, assumptions, exclusions, and approval status;
2. request list grouped by workstream with stable IDs;
3. responsibility matrix and requested delivery sequence;
4. already-provided but unverified materials;
5. open scope questions and professional-review dependencies;
6. `source_register`, `calculation_lineage`, `conflict_log`, `as_of_date`, and confidentiality notes.

Use English schema keys and preserve source-language titles in a separate field. Never replace `unknown` with zero, an industry average, or an unlabeled estimate.

For financial or valuation requests, specify CNY unit, accounting basis, valuation date, conversion method, and FX date as applicable. Preserve the original title and label unofficial translations.

## Apply human gates

- Require `method_assumption_approval` before applying a non-user priority, materiality, or sampling method.
- Require workstream-owner approval for counsel, accountant, tax, technical, security, or EHS scopes.
- Require `external_release_approval` before sending a request list outside the approved team.
- Require `external_state_mutation_approval` before uploading, sending, or changing VDR/task-system state; this Skill produces the request artifact only.

## Stop conditions

Stop and request direction when the deal side, target entity, transaction type, or scope owner is materially ambiguous. Do not:

- claim completeness before scope approval;
- review VDR contents within this Skill;
- convert absence into a risk finding;
- issue legal, accounting, tax, export-control, or regulatory conclusions;
- silently expand access to sensitive files;
- make an advance, hold, decline, initiation, or IC decision.

Hand the approved request universe to `$review-vdr-table`. Hand interview objectives to `$draft-dd-interview-questions` only after scope approval.
