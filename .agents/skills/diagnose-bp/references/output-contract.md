# Output Contract

## Required Envelope

Return a structured object or an equivalent human-readable artifact with these
fields:

| Field | Requirement |
|---|---|
| `artifact_type` | `bp_diagnostic` |
| `company_id` | Stable identifier or `unknown` |
| `transaction_stage` | Declared stage, not inferred silently |
| `side` | `company`, `fa`, `gp`, `lp`, or `unknown` |
| `audience` | Named role or investor segment |
| `as_of_date` | Date of the evidence cut |
| `confidentiality` | `public`, `internal`, `restricted`, or `strictly_restricted` |
| `scope` | Files, sections, and exclusions reviewed |
| `source_register` | Source ID, title, date, authority, access class |
| `calculation_lineage` | Formula, inputs, units, dates, and source IDs |
| `conflict_log` | Competing claims and required resolution owner |
| `overall_diagnosis` | Chinese answer-first summary |
| `criterion_results` | Criterion, score state, rationale, evidence IDs |
| `issue_cards` | Typed issues ordered by impact |
| `remediation_plan` | Action, owner, dependency, priority, due-date proposal |
| `handoff_proposals` | Optional typed downstream requests |

## Issue Card

Each issue card must contain:

```yaml
issue_id: "ISSUE-001"
issue_type: "material_issue | communication_issue | missing_evidence | presentation_issue"
severity: "critical | high | medium | low | uncalibrated"
location: "source file and slide/section"
observation: "what the material says or omits"
evidence_state: "source-confirmed | user-provided | calculated | inferred | assumption | unknown | conflicting"
evidence_ids: ["SRC-001"]
financing_consequence: "why the issue matters"
remediation: "specific corrective action"
owner: "founder | finance | legal | technical | fa | unknown"
human_validation_required: true
```

## Score Rules

- Show criterion definitions, scale, and weights beside any numeric result.
- Use `not_scored` when an anchor or evidence base is absent.
- Never collapse business quality, evidence quality, and presentation quality into
  one unexplained number.
- Never express the result as an investment recommendation or probability of
  funding.

## Typed Handoff

Use this shape for a downstream request:

```yaml
handoff_id: "HO-001"
from_skill: "diagnose-bp"
to_skill: "rewrite-bp"
transaction_id: "user-provided-or-unknown"
artifact_type: "bp_diagnostic"
requested_action: "rewrite approved sections"
evidence_refs: ["SRC-001", "ISSUE-001"]
gate_status:
  input_scope_approval: "approved | pending"
restrictions: ["do not add unsupported claims"]
unresolved: ["management must confirm 2026 capacity"]
```

## Final QA

- Reconcile repeated figures and dates.
- Verify every derived total, ratio, range, or reconciliation has a calculation ID,
  formula, inputs, units, source IDs, and `evidence_state: calculated`.
- Verify every high-impact statement has an evidence state.
- Preserve all unresolved conflicts.
- Verify Chinese conclusions do not overstate English or Chinese sources.
- Confirm the artifact contains no unauthorized external-release language.
