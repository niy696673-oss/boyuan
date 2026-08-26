---
name: diagnose-bp
description: "Diagnose an existing business plan, pitch deck, company profile, or financing narrative for a China private-market raise. Use when a founder or FA needs evidence-linked gaps, scoring, investor-objection hypotheses, and a remediation plan without rewriting the source or making an investment decision."
---

# Diagnose BP

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

## Purpose

Assess supplied financing materials against the transaction context and return a
traceable diagnostic. Preserve the source, expose missing evidence, and separate
communication defects from underlying business risks.

Do not rewrite the BP, build another artifact, or decide whether anyone should
invest. Route those requests to the appropriate downstream skill.

## Start With Scope

1. Confirm the company, financing stage, transaction side, target investor,
   requested depth, confidentiality, and as-of date.
2. Obtain `input_scope_approval` before processing restricted materials or
   applying an institution-specific scorecard.
3. Inventory the supplied files and probe available OCR, spreadsheet, web, and
   document-reading capabilities. State any extraction limitations.
4. Read [workflow.md](references/workflow.md) before analyzing. Read
   [china-private-markets.md](references/china-private-markets.md) when the raise,
   audience, accounting, regulation, or hard-tech context is Chinese.

## Control Evidence

Tag each substantive claim as `source-confirmed`, `user-provided`, `calculated`,
`inferred`, `assumption`, `unknown`, or `conflicting`. Maintain an as-of date,
source register, calculation lineage, and conflict log.

Apply source precedence in this order: signed or official original; audited or
regulatory record; user working file; reproducible calculation; inference.
Preserve conflicts instead of silently selecting the most convenient figure.
Never convert an unknown into zero, an industry average, or an unlabeled estimate.
Give every derived total, ratio, range, or reconciliation its own calculation ID,
formula, inputs, units, source IDs, and explicit `evidence_state: calculated`.

## Run the Diagnostic

1. Build a fact ledger for company identity, round, product, technology, market,
   competition, customers, business model, operations, team, financials,
   capitalization, milestones, proceeds, risks, and transaction terms.
2. Map every important slide or section to the fact ledger and its evidence.
3. Evaluate five layers separately:
   - completeness and internal consistency;
   - evidence quality and source recency;
   - narrative logic and investor readability;
   - stage, sector, and audience fit;
   - likely objections and financing-process readiness.
4. Distinguish `material_issue`, `communication_issue`, `missing_evidence`, and
   `presentation_issue`. Do not hide a business weakness behind editorial advice.
5. Score only against disclosed criteria. Mark an uncalibrated criterion as
   `not_scored`; never invent house weights or passing thresholds.
6. Rank remediation by financing impact, evidence dependency, owner, and effort.
7. Perform the checks in [output-contract.md](references/output-contract.md).

## Return the Result

Default to Simplified Chinese for narrative sections. Keep schema names, evidence
states, source IDs, and handoff fields in English. Return:

- an executive diagnosis;
- a criterion-level scorecard with rationale and evidence IDs;
- issue cards with severity, location, consequence, and remediation;
- missing-information and conflict registers;
- investor-objection hypotheses labeled as hypotheses;
- a sequenced remediation plan;
- a typed downstream handoff proposal, if requested.

Do not edit the source unless the user separately invokes a rewrite workflow.

## Human Gates and Stop Conditions

- Require the founder or FA owner to approve house scoring anchors and final
  severity labels.
- Require `method_assumption_approval` before using a non-user scorecard,
  benchmark, or material inferred assumption.
- Stop and report the gap when company identity, round, audience, or usable source
  content cannot be established.
- Do not release the diagnostic externally without `external_release_approval`.
- Treat personal, relationship, GP key-person, and meeting data as restricted; do
  not include them in public examples or tests.

## Resources

- [Output contract](references/output-contract.md)
- [Detailed workflow](references/workflow.md)
- [China private-market context](references/china-private-markets.md)
