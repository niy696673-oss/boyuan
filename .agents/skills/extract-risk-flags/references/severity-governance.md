# Severity governance

Use the institution's approved framework when supplied. Otherwise use qualitative categories and mark every severity `candidate`; do not invent quantitative cutoffs.

## Default qualitative dimensions

- **Impact:** effect on thesis, valuation, cash, operations, legality, closing, reputation, or safety.
- **Likelihood basis:** observed, repeated, contractually triggered, plausible with evidence, or unknown.
- **Time horizon:** immediate, pre-closing, near-term, long-term, or unknown.
- **Reversibility:** readily remediable, costly/delayed, structurally difficult, or unknown.
- **Dependency:** company action, third party, regulator, financing counterparty, or professional conclusion.

## Severity floor algorithm

1. Match by `risk_id`; if IDs differ, compare entity, issue, obligation, evidence, and affected thesis.
2. Find the highest previously `approved` severity for the underlying issue.
3. Set that value as `severity_floor`.
4. If the new candidate is lower, retain the floor and set `severity_status: needs-review`.
5. Permit a downgrade only with `approved_by`, `approved_at`, `downgrade_rationale`, `new_evidence_refs`, and `residual_risk`.
6. Keep the prior record and change event in lineage.

## Boundary examples

- Missing signed customer contract: coverage gap. It may support a substantive flag only if the company represented that a signed contract exists, a version conflict exists, or repeated failure materially affects the thesis.
- Expired permit shown in an official record: substantive compliance flag; legal effect remains counsel-owned.
- Management promises to hire a control owner: mitigation proposed, not remediated.
- A downstream memo omits an approved high flag: do not infer downgrade; restore the flag and mark the omission for review.
