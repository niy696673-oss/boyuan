# Recipes and Deterministic Assembly

## Routing Rule

Choose one primary artifact. Add a support skill only when its typed output is
necessary. Do not run every related skill. Stop at each human gate before the next
component consumes unapproved claims or methods.

## Recipe: BP Remediation to Deck

1. `diagnose-bp` owns the diagnostic and remediation priorities.
2. Human approves facts, positioning, and selected remediation.
3. `rewrite-bp` owns approved rewritten copy and change ledger.
4. Human approves clean claims and story.
5. `build-pitch-deck` owns storyboard, slide artifact/specification, and deck QA.
6. Founder/FA grants external-release approval.

Stop on unresolved material claim conflict, absent audience, or unapproved
positioning.

## Recipe: Controlled Outreach Teaser

1. Use approved company facts or `diagnose-bp` only if claim quality is uncertain.
2. `build-teaser` owns blind/named content, disclosure matrix, and leakage test.
3. Transaction owner approves disclosure tier and named-recipient information.
4. External-release gate remains separate from content approval.

## Recipe: Financing CIM

1. Establish approved sources, claim owners, disclosure tier, and workstream review.
2. Use `rewrite-bp` only when source narrative needs approved editorial repair.
3. `build-cim` is the sole CIM artifact owner.
4. Management/FA, finance/accounting, counsel, and technical/commercial owners
   approve their sections.
5. External release follows distribution approval.

Never use this recipe to generate QR, initiation, or IC documents.

## Deterministic QR Assembly

Lead: `qr_assembler`, not `build-cim`.

Required or explicitly waived inputs:

- `diagnose-bp`: evidence quality, gaps, and remediation state;
- `screen-deal`: institution-approved screen result and score anchors;
- `analyze-comps`: peer or valuation context when relevant and method-approved;
- source, calculation, conflict, and gate registers.

The assembler fills fixed template slots, preserves component attribution, ties
repeated figures, and lists missing evidence. It does not generate a new score,
recommendation, or thesis. A designated FA or investment professional approves the
QR.

Run the router-local assembler with `--mode qr` only after input approval. The
script owns structural composition, not investment judgment.

## Deterministic Initiation Assembly

Lead: `initiation_assembler`, not `build-cim`.

Inputs:

- `screen-deal`: scoped screening result;
- `extract-risk-flags`: typed commercial and legal risk flags;
- `prepare-investment-meeting`: decision agenda and unresolved questions;
- approved transaction facts and the institution's initiation template.

The assembler maps component fields into fixed sections, exposes conflicts and
conditions, and leaves institution-only judgments blank for the authorized human.
It may not declare formal initiation approval.

Run the router-local assembler with `--mode initiation` only after input approval.

## Deterministic IC Assembly

Lead: `ic_assembler`, not `build-cim`.

Inputs:

- `review-vdr-table`: evidence and exception register;
- `extract-risk-flags`: separate legal and commercial risk fields;
- selected, method-approved modeling atoms such as `build-dcf-model`,
  `build-lbo-model`, `build-three-statement-model`, or `analyze-comps`;
- approved diligence findings, transaction terms, conflicts, and the institution's
  IC template.

The assembler may normalize, order, cross-reference, and tie out. It may not create
new diligence findings, choose valuation methods, set risk appetite, write an
autonomous recommendation, infer a vote, or mark approval. Authorized investment
professionals own conclusion, conditions, dissent, and decision language.

Run the router-local assembler with `--mode ic` only after input approval.

## Assembly Failure Conditions

Block the assembly when the house template is absent or unapproved, a required
component lacks an as-of date, material conflicts are unresolved but hidden by the
template, model lineage is missing, or a human-only judgment slot would otherwise
be auto-filled. Return a gap register and route plan.
