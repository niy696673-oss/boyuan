# Modeling output and QA contract

Use only these evidence states: `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`.

Every artifact records as-of date, source register, calculation lineage, assumptions, conflict log, entity/perimeter, currency, unit scale, accounting basis, artifact status, and the four gate states: `input_scope_approval`, `method_assumption_approval`, `external_release_approval`, and `external_state_mutation_approval`.

Reject a handoff with `scope_mismatch`, `stale_version`, `unit_mismatch`, `unapproved_assumption`, `failed_tie_out`, `missing_evidence`, or `capability_limitation`. Preserve it with its rejection reason.

QA is `passed` only when all required checks pass; it is `passed_with_limitations` when calculations pass with disclosed evidence or capability limits; otherwise it is `blocked`. A missing capability requires a Chinese structured specification, not a claimed workbook.
