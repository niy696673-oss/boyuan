# Output Contract

## Required Envelope

| Field | Requirement |
|---|---|
| `artifact_type` | `bp_rewrite` |
| `company_id` | Stable identifier or `unknown` |
| `transaction_stage` | Declared stage |
| `side` | `company`, `fa`, or other declared side |
| `audience` | Named investor role or segment |
| `as_of_date` | Evidence cut date |
| `confidentiality` | Disclosure tier |
| `source_register` | Authoritative and working sources |
| `fact_ledger` | Claim, value, period, evidence state, source IDs |
| `conflict_log` | Unresolved competing claims |
| `content_architecture` | Ordered sections and communication objective |
| `clean_copy` | Approved rewritten narrative |
| `editorial_change_log` | Meaning-preserving edits |
| `strategy_advice_log` | Proposed, unapproved strategic changes |
| `variant_register` | Audience, stage, and disclosure differences |
| `handoff_proposals` | Optional typed artifact-building requests |

## Change Record

```yaml
change_id: "CHG-001"
change_type: "structure | clarity | compression | tone | translation | strategy_advice"
source_location: "file and slide/section"
original_text: "source excerpt or normalized summary"
proposed_text: "rewritten copy"
meaning_changed: false
evidence_ids: ["SRC-001"]
approval_status: "approved | pending | rejected | not_required"
approver_role: "founder | fa | finance | legal | technical"
notes: "material qualification or unresolved question"
```

## Clean-Copy Rules

- Include only claims whose status permits publication at the selected disclosure
  tier.
- Place `unknown` and `conflicting` items in a visible resolution list; do not
  polish them into certainty.
- Keep forecasts labeled as forecasts and identify management ownership.
- Preserve units, periods, accounting basis, valuation date, and FX date.
- Do not insert investment conclusions or language attributed to unnamed
  investors.

## Typed Handoff

```yaml
handoff_id: "HO-001"
from_skill: "rewrite-bp"
to_skill: "build-pitch-deck"
transaction_id: "user-provided-or-unknown"
artifact_type: "bp_rewrite"
requested_action: "build approved deck narrative"
evidence_refs: ["SRC-001", "CHG-001"]
approved_claim_set: ["CLAIM-001"]
disclosure_tier: "internal | nda | named-recipient | public"
gate_status:
  external_release_approval: "pending"
restrictions: ["retain forecast qualification"]
unresolved: ["confirm customer reference permission"]
```

## Final QA

- Tie every changed number to the fact ledger.
- Compare original and rewritten meaning.
- Recheck names, dates, units, legal entities, and round terms.
- Confirm strategy advice has not entered clean copy without approval.
- Confirm each variant has a distinct audience and disclosure rationale.
