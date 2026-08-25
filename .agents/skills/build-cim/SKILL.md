---
name: build-cim
description: "Build a detailed financing information memorandum for a China private-company capital raise from approved management and FA materials, with source-linked claims, disclosure control, and review gates. Use for the company-side financing memorandum only; never use it as a generic QR, initiation, diligence, or IC memo builder."
---

# Build CIM

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

## Purpose

Build a comprehensive company-side financing information memorandum that supports
informed investor review after an appropriate disclosure decision. Separate
management representations, FA analysis, third-party evidence, calculations, and
unresolved diligence items.

The artifact is a financing CIM. QR, initiation reports, and IC memoranda are
distinct router-level deterministic assemblies and are never CIM modes.

## Confirm Scope and Workstream Ownership

1. Confirm company, financing entity, round, audience, process stage, disclosure
   tier, section scope, as-of date, target format, and review owners.
2. Obtain `input_scope_approval` for all management, financial, legal, technical,
   and transaction sources.
3. Assign claim owners and reviewers across management, FA, finance/accounting,
   counsel, and technical or commercial workstreams.
4. Probe DOCX/PPTX, spreadsheet, OCR, rendering, and citation capability. If a
   native artifact cannot be generated and validated, return a Chinese long-form
   specification and copy-ready draft.
5. Read [workflow.md](references/workflow.md) and
   [china-private-markets.md](references/china-private-markets.md).

## Control Evidence and Voice

Tag each claim as `source-confirmed`, `user-provided`, `calculated`, `inferred`,
`assumption`, `unknown`, or `conflicting`. Maintain as-of date, source register,
calculation lineage, conflict log, defined terms, and disclosure tier.

Attribute content by voice:

- `management_representation`: supplied or approved by management;
- `fa_analysis`: analysis owned by the FA team;
- `third_party_source`: externally sourced and cited;
- `calculation`: reproducible transformation with lineage;
- `open_diligence_item`: unresolved and not suitable for definitive wording.

Do not use drafting to convert one voice into another.

## Build the Memorandum

1. Create the source and claim matrix before drafting sections.
2. Approve a section architecture covering the transaction, company, industry,
   product and technology, commercialization, operations, team and governance,
   financials, capitalization, financing plan, risks, and supporting appendices as
   relevant.
3. Draft each section from approved claims, with qualifications near the claim.
4. Reconcile the narrative with financial tables, capitalization, milestones,
   contracts, and defined terms.
5. Maintain an open-item register instead of filling gaps with market averages or
   unlabeled assumptions.
6. Run workstream and external-release checks under
   [output-contract.md](references/output-contract.md).

## Return the Result

Default narrative output to Simplified Chinese. Keep source IDs, evidence states,
voice types, and schema fields in English. Return:

- scope, disclosure, and review-owner register;
- Chinese CIM draft or validated native artifact;
- section-level source and voice map;
- financial and calculation lineage;
- conflict and open-diligence registers;
- risk and qualification schedule;
- approval and version record.

Do not provide legal, accounting, tax, or investment advice. Do not state that the
memorandum has been verified by a professional workstream unless that workstream
has actually signed off.

## Human Gates and Stop Conditions

- Require management and FA approval for positioning and management claims.
- Require finance/accounting review for financial statements and forecasts, and
  counsel review for legal structure, transaction terms, material legal risks,
  disclaimers, and distribution constraints.
- Require technical or commercial owner review for specialized claims.
- Require `method_assumption_approval` for derived analysis and
  `external_release_approval` for investor distribution.
- Stop when material sections rely on unresolved conflicting sources or when the
  requested use attempts to turn the CIM into a QR, initiation, or IC artifact.

## Resources

- [Output contract](references/output-contract.md)
- [Detailed workflow](references/workflow.md)
- [China private-market context](references/china-private-markets.md)
