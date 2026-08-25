---
name: build-teaser
description: "Create a concise blind or named teaser for a China private-company financing with explicit disclosure tiers, anonymization, leakage checks, and call to action. Use for pre-NDA or controlled outreach; do not use for a full pitch deck, CIM, or investment recommendation."
---

# Build Teaser

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

## Purpose

Create a short outreach artifact that earns an appropriate next step while
revealing only approved information. Support blind and named versions from one
controlled fact base.

This skill owns teaser content and release checks. It does not own the full deck,
detailed memorandum, investor targeting, or distribution action.

## Confirm Disclosure Before Drafting

1. Confirm company, financing stage, target recipient segment, blind or named
   mode, pre- or post-NDA status, channel, CTA, as-of date, and format.
2. Obtain `input_scope_approval` for the source set and disclosure tier.
3. Identify direct and indirect identifiers, including rare technical details,
   customer combinations, geography, founder history, financing terms, and
   operating metrics.
4. Read [workflow.md](references/workflow.md) and the China-specific disclosure
   guidance in [china-private-markets.md](references/china-private-markets.md).

## Control Evidence

Tag each claim as `source-confirmed`, `user-provided`, `calculated`, `inferred`,
`assumption`, `unknown`, or `conflicting`. Maintain as-of date, source register,
calculation lineage, conflict log, and disclosure matrix.

Do not turn a range, anonymous description, or generalized metric into false
precision. Do not claim anonymization is safe merely because the company name and
logo were removed.

## Build the Teaser

1. Define the recipient's legitimate reason to continue and the approved CTA.
2. Select only claims necessary for company profile, problem, solution, proof,
   market relevance, traction, financing context, and next step.
3. Create separate `blind` and `named` variants when both are requested. Derive
   both from one fact ledger and record every disclosure difference.
4. Apply anonymization by direct identifier removal, quasi-identifier review,
   aggregation, range selection, and re-identification testing.
5. Write concise Simplified Chinese copy with evidence-linked qualifications.
6. Run leakage, numeric, claim, recipient, and CTA checks in
   [output-contract.md](references/output-contract.md).

## Return the Result

Return a Chinese one-page or equivalent concise specification containing:

- release brief and selected disclosure tier;
- blind or named teaser copy;
- disclosure matrix and anonymization log;
- source register, calculation lineage, and conflicts;
- leakage-risk assessment;
- recipient-safe CTA and approval status.

Use any strip-profile or external layout only as a high-level formatting reference;
do not copy proprietary language, branding, or templates without applicable rights.
Generate DOCX, PPTX, or PDF only when the format can be created and validated;
otherwise return a placement-ready specification.

## Human Gates and Stop Conditions

- Require transaction-owner approval for every disclosure tier.
- Require named-recipient approval before using customer, investor, founder, or
  counterparty names.
- Require `external_release_approval` before distribution; never send the teaser.
- Stop if anonymization leaves a material re-identification risk that cannot be
  reduced without destroying the teaser's meaning.

## Resources

- [Output contract](references/output-contract.md)
- [Detailed workflow](references/workflow.md)
- [China private-market context](references/china-private-markets.md)
