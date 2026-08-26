---
name: screen-deal
description: Prepare an evidence-aware private-market screen card in one-minute, preliminary, re-screen, or GP-fit mode for China-focused financing, VC, PE, or FA work. Use only when the user explicitly requests deal screening, mandate-fit assessment, a first-pass investment snapshot, kill-criteria review, re-screening after new evidence, or GP-fit assessment. Do not use to source candidates, rewrite a BP, create a formal initiation or IC memo, decide an investment, vote, promise funding, or present advance/hold/decline as an authorized institutional decision.
---

# Screen a Deal

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Provide decision support, not a decision. The investment owner alone chooses `advance`, `hold`, `request-evidence`, or `decline`.

## Select one mode

- `one-minute`: use a small, decision-relevant fact set to determine what must be verified next.
- `preliminary`: assess mandate fit, thesis, evidence, red flags, and next diligence action from available materials.
- `re-screen`: compare new evidence with a prior screen without erasing prior unknowns, risks, or decision history.
- `gp-fit`: assess a company against one GP/fund mandate; do not source the GP or infer key-person influence.

Do not mix modes in one score. If the user requests multiple modes, produce separately versioned screens.

Read [screen-card-contract.md](references/screen-card-contract.md) for fields and [screening-method.md](references/screening-method.md) for scoring and mode controls.

## Establish the mandate and evidence boundary

1. Capture side, mode, stage, sector, geography, round/transaction type, financing ask or ticket, ownership preference, mandate, exclusions, confidentiality, as-of date, and owner.
2. Tag each claim as `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, or `conflicting`. Record company or third-party assertion as a separate claim type.
3. Reconcile units, currency, dates, entities, and accounting basis before comparison.
4. Use institution-specific scoring anchors only when supplied and approved. Label generic dimensions as a provisional framework, never Felix/source-firm Know-how.

Apply source precedence: signed or official originals; audited or regulatory sources; user-provided working files; reproducible calculations; inference. Preserve rather than suppress conflicts.

## Build the screen

1. Summarize the opportunity and financing/transaction ask without rewriting the source narrative.
2. Assess mandate fit by explicit dimensions and evidence.
3. State the preliminary thesis and counter-thesis as hypotheses.
4. Evaluate team, technology/product, market, commercialization, business model, financial/runway, governance, transaction, and exit dimensions only where relevant.
5. Record kill criteria as `met`, `not-met`, `unknown`, or `conflicting`; do not treat missing information as `met` or `not-met`.
6. Import approved risk flags at or above their severity floor. Do not silently downgrade or omit them.
7. Identify the smallest next diligence actions that could change the decision.
8. Present decision options with evidence and consequences, clearly labeled `AI-prepared options; owner decision required`.

## Control scoring and uncertainty

- Prefer qualitative bands and evidence grades over false decimal precision.
- Do not assign a score where the denominator, weight, benchmark, or evidence is unknown.
- Show missing-data sensitivity separately; never replace an unknown with an industry average.
- Keep fit and quality distinct: a strong company may not fit a mandate, and a mandate fit does not establish quality.
- Keep GP fit and key-person relationship distinct. A GP-fit screen does not establish access, interest, sponsorship, or decision power.
- Preserve prior versions and explain every change in a re-screen.

## Produce the Chinese deliverable

Default to Simplified Chinese and include:

1. mode, mandate, scope, as-of date, evidence coverage, and limitations;
2. one-paragraph opportunity/ask snapshot;
3. mandate-fit table and explicit exclusions;
4. thesis, counter-thesis, evidence map, and critical unknowns;
5. kill-criteria state, approved risk carry-forward, and contradictions;
6. optional score/band with method and uncertainty;
7. owner-only decision options and next diligence actions;
8. `source_register`, `calculation_lineage`, `conflict_log`, version/change log, confidentiality, and human-gate status.

Keep schema keys in English. Preserve source-language terms and label management claims such as “领先”, “唯一”, “国产替代”, or “卡脖子” as assertions unless independently supported.

State CNY units and conversions, accounting basis, valuation date, FX date, and forecast status wherever relevant. Label unofficial translations and retain the original defined term.

## Apply human gates

- Require `input_scope_approval` before using restricted deal, relationship, meeting, or GP key-person evidence.
- Require `method_assumption_approval` before applying any score, weight, benchmark, or kill criterion not already approved by the institution.
- Require `external_release_approval` before sharing the screen outside the approved decision team.
- Keep `external_state_mutation_approval` pending or `not_required`; this Skill never changes CRM, pipeline, or institutional memory.

## Stop conditions

Stop when the mandate, mode, transaction, entity, or decision owner is materially ambiguous. Do not:

- source candidates or contact anyone;
- rewrite the BP or produce investor-facing marketing material;
- treat absent evidence as a negative fact;
- make legal, accounting, technical-certification, or regulatory conclusions;
- output a formal initiation/IC recommendation, vote, approval, or rejection;
- auto-update CRM, pipeline status, or institutional memory.
