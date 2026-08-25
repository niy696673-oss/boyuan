# Output Contract

## Required Envelope

| Field | Requirement |
|---|---|
| `artifact_type` | `financing_teaser` or `financing_teaser_spec` |
| `variant` | `blind` or `named` |
| `company_id` | Restricted stable ID or `unknown` |
| `transaction_stage` | Declared stage |
| `recipient_segment` | Role and mandate, not an unverified personal profile |
| `as_of_date` | Evidence cut date |
| `disclosure_tier` | `public`, `pre_nda_blind`, `pre_nda_named`, `post_nda` |
| `source_register` | Source IDs and access classes |
| `calculation_lineage` | Derived values and ranges |
| `conflict_log` | Unresolved claims |
| `teaser_copy` | Chinese release candidate |
| `disclosure_matrix` | Claim-level permission and variant treatment |
| `anonymization_log` | Direct and indirect identifier treatment |
| `leakage_assessment` | Re-identification and sensitivity findings |
| `cta` | Approved next step |
| `approval_status` | Human-gate state |

## Disclosure Record

```yaml
claim_id: "CLAIM-001"
claim_summary: "normalized claim"
evidence_state: "source-confirmed | user-provided | calculated | inferred | assumption | unknown | conflicting"
source_ids: ["SRC-001"]
sensitivity: "low | medium | high | prohibited"
blind_treatment: "omit | generalize | range | include"
named_treatment: "omit | generalize | range | include"
reidentification_vector: "customer, geography, technology, founder, metric, term, or none"
approval_status: "approved | pending | rejected"
```

## Content Requirements

Keep the teaser concise and ordered around: category description, problem,
solution, differentiated proof, selected commercial evidence, market relevance,
financing context if approved, and CTA. Do not include detailed DD, full forecasts,
legal conclusions, or an implied guarantee of financing.

## Leakage Checks

- Test direct identifiers and combinations of quasi-identifiers.
- Test whether ranges remain unique within the relevant sector and geography.
- Check metadata, file properties, speaker notes, links, image labels, and comments.
- Check customer and investor logos, screenshots, facility images, and certification
  numbers.
- Confirm contact and distribution information is explicitly approved.

## Final QA

- Reconcile every number and time period.
- Confirm all included claims are permitted at the selected tier.
- Verify CTA, contact route, and recipient segment.
- Ensure the blind version cannot be trivially reversed from included clues.
- Record `external_release_approval` separately from content approval.
