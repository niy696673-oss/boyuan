# Screen card contract

## Header

`screen_id`, `version`, `mode`, `side`, `entity`, `stage`, `sector`, `geography`, `round_or_transaction`, `financing_ask_or_ticket`, `currency`, `as_of_date`, `mandate_id`, `owner`, `confidentiality`, `source_register`, `calculation_lineage`, `conflict_log`, `gate_status`.

Use only `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting` as evidence states. Record management or third-party assertion type separately. `gate_status` records `input_scope_approval`, `method_assumption_approval`, `external_release_approval`, and `external_state_mutation_approval` as `approved`, `pending`, or `not_required`.

## Evidence and fit

- `opportunity_snapshot`
- `mandate_fit_dimensions[]`: dimension, requirement, observed state, evidence state, source refs, fit state, unknowns
- `thesis_hypotheses[]`
- `counter_thesis_hypotheses[]`
- `critical_unknowns[]`
- `contradictions[]`
- `kill_criteria[]`: criterion, state, evidence, owner
- `risk_flags_carried[]`: risk ID, approved severity, severity floor, source register version

## Decision support

- `score_or_band`: optional
- `scoring_method`: required when a score/band is used
- `uncertainty`: evidence coverage and missing-data sensitivity
- `decision_options[]`: `advance`, `hold`, `request-evidence`, `decline`, each with rationale and consequences
- `owner_decision`: blank until supplied by an authorized human
- `next_diligence_actions[]`

## Versioning

For re-screening, retain `prior_screen_id`, prior owner decision if supplied, changed evidence, changed interpretation, unchanged unknowns, and a field-level change log. Never overwrite the prior screen.

## Output boundary

Label the result `DRAFT SCREEN — NOT AN IC OR INVESTMENT DECISION`. Do not populate `owner_decision` on the model's behalf.

When consuming `$diagnose-bp`, preserve its source IDs, issue IDs, evidence states, calculation lineage, conflicts, and diagnostic scope. Treat diagnostic scores and severity as communication/material evidence, not as an investment decision or automatic screen score.
