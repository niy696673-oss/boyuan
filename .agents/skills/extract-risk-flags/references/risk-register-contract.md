# Risk register contract

## Artifact envelope

Record `artifact_type: risk_register`, `deal_id`, `side`, `stage`, `as_of_date`, `confidentiality`, `source_register`, `calculation_lineage`, `conflict_log`, prior register version, and `gate_status`. Use the exact evidence states `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`. Record `input_scope_approval`, `method_assumption_approval`, `external_release_approval`, and `external_state_mutation_approval` as `approved`, `pending`, or `not_required`.

## Required fields

| Field | Rule |
|---|---|
| `risk_id` | Stable across versions and downstream artifacts |
| `risk_category` | Use the typed category vocabulary from SKILL.md |
| `issue_statement` | Observed condition only; no unsupported intent or legal conclusion |
| `evidence_state` | Shared evidence state |
| `evidence_refs` | Source ID, location/span, date, entity, and period |
| `contrary_evidence_refs` | Preserve material counter-evidence or `unknown` |
| `coverage_gap_refs` | Link gaps without treating them as proof |
| `potential_impact` | Financial, operational, legal, strategic, timing, reputation, or transaction impact |
| `affected_thesis_ids` | Thesis links or `unknown` |
| `severity_candidate` | `critical`, `high`, `medium`, `low`, or `informational` |
| `severity_status` | `candidate`, `approved`, or `needs-review` |
| `severity_basis` | Impact, likelihood basis, horizon, reversibility, and framework reference |
| `professional_owner` | Investment, counsel, accountant, technical, tax, security, EHS, or other |
| `validation_needed` | Evidence or question required to resolve uncertainty |
| `mitigation` | Proposed, in-progress, verified, ineffective, or unknown |
| `residual_risk` | Explicit after verified mitigation; otherwise `unknown` |
| `decision_relevance` | What decision could change and why |
| `confidentiality` | Access class |
| `calculation_refs` | Lineage for quantified impact or `none` |

## Distinguish three records

1. `coverage_gap`: requested evidence was not verified.
2. `contradiction`: two or more sources disagree.
3. `substantive_flag`: evidence supports an observed condition with potential decision impact.

One record may link to another, but never collapse them into one unlabeled statement.

## Evidence checks

- Every high/critical candidate has direct evidence or an explicit urgent validation path.
- Every quoted statement has a contiguous location/span.
- Every inference states its premises.
- Every mitigation claim has completion evidence or remains proposed.
