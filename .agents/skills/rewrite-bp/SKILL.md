---
name: rewrite-bp
description: "Rewrite an existing business plan or financing narrative for a specified China private-market audience while preserving a fact ledger and change log. Use after claims, scope, positioning, and disclosure limits are approved; do not use to create a pitch deck, teaser, CIM, or investment recommendation."
---

# Rewrite BP

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

## Purpose

Transform approved source content into a coherent financing narrative without
changing the underlying facts. Preserve traceability between original language,
new language, evidence, and human-approved positioning.

This skill owns editorial transformation. It does not own slide design, one-page
teaser disclosure, long-form CIM assembly, or investor screening.

## Establish the Rewrite Brief

1. Confirm company, round, side, audience, objective, format, language,
   confidentiality, as-of date, and approved source set.
2. Obtain `input_scope_approval` and identify the person who can approve factual
   claims and positioning.
3. Read [workflow.md](references/workflow.md). Read
   [china-private-markets.md](references/china-private-markets.md) for China-stage,
   hard-tech, policy, accounting, and investor-language considerations.
4. If no reliable source content exists, stop and request it. Do not invent the
   company story from generic sector knowledge.

## Control Claims and Changes

Create a fact ledger before drafting. Tag each claim as `source-confirmed`,
`user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, or
`conflicting`. Preserve as-of date, source register, calculation lineage, and
conflict log.

Create two distinct registers:

- `editorial_change_log`: structure, clarity, compression, translation, and tone;
- `strategy_advice_log`: proposed positioning or content changes requiring human
  approval before entering the clean draft.

Never promote strategy advice, an inference, or an unsupported superlative into a
fact. Never resolve a source conflict by rewriting around it.

## Rewrite the Material

1. Map the current narrative to the approved audience and next process gate.
2. Define the claim sequence: company purpose, problem, solution, proof, market,
   competition, business model, commercialization, team, financial trajectory,
   financing ask, proceeds, milestones, and risks.
3. Draft a content architecture before rewriting paragraphs or slides.
4. Rewrite only approved claims. Keep important qualifications adjacent to the
   claim they limit.
5. Produce audience or stage variants only when requested; label each variant and
   its disclosure tier.
6. Reconcile all repeated figures, periods, units, and terminology.
7. Apply the contract in [output-contract.md](references/output-contract.md).

## Return the Result

Default narrative output to Simplified Chinese. Keep schema names, source IDs,
change types, and evidence states in English. Return:

- rewrite brief and content architecture;
- clean rewritten copy in the requested structure;
- fact ledger and unresolved claim list;
- editorial change log;
- separate strategy advice log;
- audience/stage variants, if approved;
- downstream handoff for deck, teaser, or CIM production, if requested.

If native document editing is unavailable, return copy-ready Chinese text plus a
placement specification. Do not claim to have generated or edited a file.

## Human Gates and Stop Conditions

- Require founder or FA approval for positioning, claims, forecasts, milestones,
  fundraising ask, use of proceeds, and risk wording.
- Require `method_assumption_approval` before introducing an inferred bridge,
  benchmark, or translation that changes meaning.
- Require `external_release_approval` for investor-facing copy.
- Stop when the requested rewrite would conceal a known conflict, omit a material
  qualification, or imply certainty unsupported by the approved evidence.

## Resources

- [Output contract](references/output-contract.md)
- [Detailed workflow](references/workflow.md)
- [China private-market context](references/china-private-markets.md)
