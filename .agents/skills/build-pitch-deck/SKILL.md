---
name: build-pitch-deck
description: "Build or revise an investor-facing pitch deck for a China private-company financing using approved claims, source-linked slide logic, and deck QA. Use when the requested primary artifact is a presentation; do not use for a one-page teaser, CIM, BP-only rewrite, or investment decision."
---

# Build Pitch Deck

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

## Purpose

Build a presentation that explains the company, proof, financing need, and value-
creation milestones to a defined private-market audience. Own the storyboard,
slide specification, deck artifact when supported, and presentation QA.

Do not treat design polish as evidence. Do not hide risks, invent customer proof,
or convert management forecasts into verified outcomes.

## Confirm the Assignment

1. Confirm company, round, side, target investor, meeting context, expected length,
   brand constraints, confidentiality, as-of date, and delivery format.
2. Obtain `input_scope_approval` for the approved claim set and source materials.
3. Probe presentation-generation, charting, image, font, and rendering capability.
   If native PPTX creation and visual verification are unavailable, return a
   Chinese slide-by-slide specification instead of claiming a file.
4. Read [workflow.md](references/workflow.md). Read
   [china-private-markets.md](references/china-private-markets.md) for stage and
   audience calibration.

## Control Claims and Sources

Tag substantive claims as `source-confirmed`, `user-provided`, `calculated`,
`inferred`, `assumption`, `unknown`, or `conflicting`. Maintain as-of date, source
register, calculation lineage, conflict log, and disclosure tier.

Apply source precedence: signed or official original; audited or regulatory
record; user working file; reproducible calculation; inference. Preserve source
conflicts and keep forecasts labeled. Never invent a logo, customer relationship,
market share, certification, valuation, or operating milestone.

## Build the Deck

1. Define the reader decision and the single sentence the deck must establish.
2. Create an evidence map and identify blocked claims before storyboarding.
3. Design a claim-led storyboard appropriate to stage and audience. Avoid a fixed
   universal slide order when the transaction logic requires another sequence.
4. For every slide, specify purpose, headline, proof, visual form, source IDs,
   qualification, speaker note, and open question.
5. Show the link from financing proceeds to operational milestones, de-risking,
   and the next value inflection.
6. Generate charts only from traceable data; label periods, units, basis, and
   forecast status.
7. Run content, visual, numerical, and disclosure QA under
   [output-contract.md](references/output-contract.md).

## Return the Result

Default to Simplified Chinese for slide text and narrative. Keep schema fields,
source IDs, and evidence states in English. Return:

- audience and story brief;
- storyboard and slide inventory;
- slide-by-slide content and visual specification;
- source notes, calculation lineage, and conflict log;
- investor-objection appendix or speaker preparation, when requested;
- native PPTX only when it can be rendered and visually validated;
- final QA and approval status.

Keep detailed diligence exhibits in an appendix or data room; do not overload the
core story. Use `build-teaser` for a one-page outreach artifact and `build-cim` for
a detailed financing memorandum.

## Human Gates and Stop Conditions

- Require founder or FA approval for storyline, claims, financial figures,
  forecasts, financing ask, use of proceeds, and risk wording.
- Require `method_assumption_approval` before derived market, valuation, or
  forecast analysis enters the deck.
- Require `external_release_approval` before investor distribution.
- Stop when key claims cannot be tied to approved sources or when rendering cannot
  be validated for the requested file format.

## Resources

- [Output contract](references/output-contract.md)
- [Detailed workflow](references/workflow.md)
- [China private-market context](references/china-private-markets.md)
