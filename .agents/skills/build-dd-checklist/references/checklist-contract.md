# Checklist contract

## Artifact envelope

Record `artifact_type: dd_request_universe`, `deal_id`, `side`, `stage`, `as_of_date`, `confidentiality`, `source_register`, `calculation_lineage`, `conflict_log`, and `gate_status`. Use the exact evidence states `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`. Record `input_scope_approval`, `method_assumption_approval`, `external_release_approval`, and `external_state_mutation_approval` as `approved`, `pending`, or `not_required`.

Use one row per independently satisfiable request.

## Required fields

| Field | Rule |
|---|---|
| `request_id` | Stable within a deal; never recycle after deletion |
| `workstream` | `business`, `technical`, `financial`, `tax`, `legal`, `governance`, `compliance`, `data_security`, `esg_ehs`, or `transaction` |
| `request_title_zh` | Concise Simplified-Chinese request |
| `entity` | Exact legal entity or `unknown` |
| `period` | Date/range or `unknown`; never use “recent” without definition |
| `requested_form` | Original, signed copy, ledger export, schedule, evidence sample, or other explicit form |
| `rationale` | Question or hypothesis the request supports; not a conclusion |
| `acceptance_criteria` | Entity, period, version, signature, fields, and readability required |
| `priority` | `blocking`, `high`, `normal`, `conditional` with rationale |
| `owner` | Investment, company, counsel, accountant, tax, technical, or named role |
| `confidentiality` | `standard`, `restricted`, `highly_restricted`, or `personal_information` |
| `request_status` | Use the lifecycle below |
| `evidence_state` | Shared evidence state |
| `source_refs` | Source IDs supporting why the request exists |

## Request lifecycle

`draft -> scope-approved -> requested -> provided-unverified -> coverage-verified`

Alternative terminal states: `not-applicable-approved`, `withdrawn-approved`, `superseded`. Keep the approving person and timestamp for all approved transitions.

Do not use `complete`, `clean`, or `no-risk` as request statuses. Coverage verification belongs to VDR review; substantive risk belongs to risk extraction.

## Output checks

- Every blocking/high item has a rationale and owner.
- Every request has entity, period, form, and acceptance criteria or an explicit `unknown`.
- No request embeds a risk conclusion.
- No professional workstream is attributed to the AI.
- Any CSV/XLSX export preserves raw values and neutralizes formula-like display values without changing the source record.
