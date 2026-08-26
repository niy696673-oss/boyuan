# Output Contract

## Required Envelope

| Field | Requirement |
|---|---|
| `artifact_type` | `financing_cim` or `financing_cim_spec` |
| `company_id` | Stable identifier or `unknown` |
| `financing_entity` | Exact legal entity or unresolved item |
| `transaction_stage` | Current process stage |
| `audience` | Permitted investor segment |
| `as_of_date` | Evidence cut date |
| `confidentiality` | Distribution and disclosure tier |
| `review_owners` | Management, FA, finance, counsel, technical/commercial |
| `source_register` | Source authority, date, location, access class |
| `calculation_lineage` | Formula, inputs, units, dates, source IDs |
| `conflict_log` | Competing claims and resolution owner |
| `section_register` | Section status, voice, evidence, approver |
| `cim_content` | Chinese memorandum content |
| `open_diligence_items` | Unresolved items and consequence |
| `risk_qualification_schedule` | Risk, wording, evidence, reviewer |
| `approval_status` | Workstream and release gates |

## Section Record

```yaml
section_id: "CIM-03"
title_zh: "产品与技术"
purpose: "explain product, differentiation, and proof"
voice_types: ["management_representation", "third_party_source"]
claim_ids: ["CLAIM-001"]
source_ids: ["SRC-001"]
calculation_ids: []
disclosure_tier: "post_nda"
open_items: ["confirm patent ownership schedule"]
review_owner: "technical"
approval_status: "pending"
```

## Boundary Rules

- Do not label a CIM as a QR, initiation report, or IC memo.
- Do not embed an investment recommendation or investment-committee vote request.
- Do not present FA analysis as independent assurance.
- Keep forecasts labeled, identify their owner, and disclose their basis and
  limitations.
- Preserve material risks and open items; do not bury them in disclaimers.

## Native Artifact Rule

Set `artifact_type: financing_cim` only after native generation, file-open check,
render inspection, pagination and cross-reference review, table and chart review,
and version-control verification. Otherwise return `financing_cim_spec`.

## Final QA

- Tie financial tables to their basis and source.
- Reconcile entity names, capitalization, round terms, dates, and defined terms.
- Verify every section has a voice type and review owner.
- Confirm all unresolved items remain visible.
- Confirm distribution matches NDA, recipient, and counsel restrictions.
