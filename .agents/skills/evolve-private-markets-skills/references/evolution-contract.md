# Evolution Contract

This contract separates learning from authority. Evidence may justify a proposed
change; it never authorizes mutation by itself.

## Required inputs

Record:

- `target_skill` and `baseline_version`;
- `requested_outcome` and explicit non-goals;
- `context_scope` and its confidentiality boundary;
- `observed_failures` or opportunities with evidence IDs;
- `approved_sources` and excluded sources;
- `compatibility_targets`;
- `release_scope`, owner, and approvers.

Verify `owner`, `editable`, and target path safety. A third-party or system target
must remain unchanged unless its governing terms and the user explicitly permit a
fork or overlay. Never overwrite the original third-party target.

## Required gates

Use `not_required`, `pending`, `approved`, or `rejected` for every gate:

- `target_scope_approval`;
- `context_scope_approval`;
- `change_proposal_approval`;
- `apply_change_approval`;
- `release_approval`;
- `external_state_mutation_approval`.

Do not combine gates. Approval to inspect is not approval to edit. Approval to
edit is not approval to release. Release approval is not authority to publish or
sync to an external destination.

## Snapshot contract

`target_snapshot` must include the target name, baseline version, snapshot ID,
owner, editability, file inventory, hashes, unresolved links, dependencies, and
`complete_read` status. Set
`complete_read` to false if any operational dependency cannot be read. No patch
may be proposed as ready when `complete_read` is false.

## Patch contract

Each `proposed_change` and `applied_change` records:

- file and affected behavior;
- evidence IDs and diagnosed problem IDs;
- change type and minimal rationale;
- expected positive effect;
- possible regression and affected downstream Skills;
- protected invariants touched;
- before/after hashes after application.

Never edit the only baseline copy. Preserve a reproducible patch or an equivalent
rollback artifact.

## Release blockers

Block release when:

- target or context scope is unapproved;
- target reading is incomplete;
- target ownership or editability is not established;
- required source provenance or permission is unknown;
- a critical invariant changes without specific approval;
- a required test fails or a critical control regresses;
- candidate and baseline cannot be distinguished on the claimed behavior;
- rollback is missing or untested;
- license or attribution integrity fails;
- publication or synchronization lacks destination-specific authorization.
