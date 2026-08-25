---
name: materials-router
description: "Route multi-step FA and private-market materials work across BP diagnosis, rewriting, pitch decks, teasers, CIMs, and deterministic QR, initiation, or IC assemblies. Use when the requested artifact or workflow spans multiple material skills or is ambiguous; preserve artifact boundaries, typed handoffs, and human gates."
---

# Private-Markets Materials Router

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

## Purpose

Select and coordinate the smallest valid workflow for a private-company financing
material. Keep one atomic skill responsible for each atomic artifact, and use a
deterministic assembler for QR, initiation, or IC packages.

Do not turn `build-cim` into a generic report generator. A CIM remains a company-
side financing memorandum; QR, initiation, and IC outputs are router-level
assemblies from explicit upstream records.

## Build the Route Context

Confirm before routing:

- company and transaction ID;
- side: company, FA, GP, LP, or mixed;
- financing and investor-process stage;
- requested artifact and legitimate reader decision;
- audience, recipient role, and confidentiality;
- as-of date and approved source set;
- required native format and available capabilities;
- applicable house template, scoring method, and human approvers.

Obtain `input_scope_approval` when restricted content is involved. If the artifact
is ambiguous, return the two most plausible routes and ask the user to choose; do
not select based only on a filename such as "report" or "memo".

## Apply Shared Controls

Require each component to preserve `source-confirmed`, `user-provided`,
`calculated`, `inferred`, `assumption`, `unknown`, and `conflicting` states, plus
as-of date, source register, calculation lineage, and conflict log.

Probe web, OCR, transcription, spreadsheet recalculation, PPTX/DOCX, VDR, CRM or
memory, and scheduler capabilities only as relevant. If a required capability is
unavailable, route to a Simplified-Chinese draft, schema, specification, or route
plan; never claim a file, calculation, review, or external action occurred.

Read [workflow.md](references/workflow.md) for recipes and deterministic assembly.
Read [output-contract.md](references/output-contract.md) before passing work between
skills. Use [china-private-markets.md](references/china-private-markets.md) to
calibrate stage, audience, and artifact boundaries.

## Select the Atomic Route

Use exactly one lead artifact owner unless a deterministic assembler is the lead:

- BP gaps and remediation: `diagnose-bp`.
- Approved editorial transformation: `rewrite-bp`.
- Presentation artifact: `build-pitch-deck`.
- Blind or named one-page outreach: `build-teaser`.
- Detailed company-side financing memorandum: `build-cim`.
- Investment screening decision: `screen-deal`, not a BP or CIM skill.
- Valuation or model work: route to the relevant modeling atom, not a materials
  writer.

Pass only typed, approved outputs downstream. Do not allow a downstream writer to
silently upgrade evidence or resolve a conflict.

## Run Composite Recipes

Use the deterministic recipes in [workflow.md](references/workflow.md) for:

- BP remediation-to-deck;
- controlled outreach teaser;
- financing CIM production;
- QR assembly;
- initiation assembly;
- IC assembly.

For QR, initiation, or IC assembly, use the router-local deterministic assembler
only after its JSON inputs and house-template mapping are approved:

```bash
python scripts/assemble_internal_memo.py --mode qr --input INPUT.json --output OUTPUT.md
```

Replace `qr` with `initiation` or `ic` as required. If the platform cannot execute
the script or write the requested artifact, return the validated input contract
and a Simplified-Chinese assembly specification; do not claim the memo exists.

For every recipe, declare lead owner or assembler, component order, required
handoffs, stop conditions, human gates, and final artifact owner. An assembler may
normalize, order, cross-reference, tie out, and expose gaps. It may not create new
analysis, investment judgment, or unsupported wording.

## Return the Route Result

Default human-facing output to Simplified Chinese. Keep technical fields in
English. Return:

- route context and ambiguity resolution;
- selected recipe and lead owner;
- ordered component plan;
- typed handoffs and evidence dependencies;
- capability fallbacks;
- stop conditions and human gates;
- final assembly status and unresolved items.

## Human Gates and Stop Conditions

- Require `method_assumption_approval` for scorecards, valuation methods,
  benchmarks, or house templates not already approved.
- Require `external_release_approval` for any investor-facing artifact.
- Require `external_state_mutation_approval` for distribution, upload, CRM, VDR,
  scheduler, or other external writes; this router does not perform them by default.
- Stop a route when identity, side, stage, artifact, audience, confidentiality, or
  evidence cut cannot be established.
- Never auto-approve QR, initiation, IC, legal, accounting, or investment content.

## Resources

- [Router output and handoff contract](references/output-contract.md)
- [Recipes and deterministic assembly](references/workflow.md)
- [China private-market artifact map](references/china-private-markets.md)
- [Deterministic memo assembler](scripts/assemble_internal_memo.py)
