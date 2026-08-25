# Monitoring output and control contract

Use only these evidence states: `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`.

Every signal artifact records as-of time, source coverage, source register, event/release timestamp, last-checked time, period, units, currency, accounting basis, calculation lineage, conflict log, direct/inferred classification, and four gate states: `input_scope_approval`, `method_assumption_approval`, `external_release_approval`, and `external_state_mutation_approval`.

For a catalyst ledger, retain `event_id`, verification state, primary source, source date, evidence state, probability, impact, direction, confidence, thesis pillar, owner, action gate, next-check date, related events, and deduplication key. Use `confirmed`, `expected`, `inferred`, `unknown`, `changed`, `completed`, or `cancelled` for event truth states; historical cadence supports `inferred`, never `confirmed`.

Scheduler status must be `active`, `not_configured`, `unavailable`, or `failed`. A returned draft, alert, calendar design, or ledger is not an external action or persistence claim.
