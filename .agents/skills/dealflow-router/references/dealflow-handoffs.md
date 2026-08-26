# Dealflow handoffs

## Common envelope

`handoff_id`, `from_component`, `to_component`, `run_id`, `transaction_id`, `mode`, `side`, `owner`, `as_of_date`, `confidentiality`, `source_register_ref`, `calculation_lineage_ref`, `conflict_log_ref`, `evidence_states`, `permission_scope`, `no_contact_state`, `review_status`, `approved_by`, `requested_action`, `restrictions`, `unresolved`, `gate_status`.

Use only `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting` as evidence states. `gate_status` preserves `input_scope_approval`, `method_assumption_approval`, `external_release_approval`, and `external_state_mutation_approval`.

## BP diagnostic to screening

When `$screen-deal` consumes `$diagnose-bp`, set `from_component: diagnose-bp`, `to_component: screen-deal`, and pass `transaction_id`, diagnostic artifact type and version, source and issue IDs, evidence states, approved claims, calculation lineage, conflicts, scope limitations, and requested screening mode. Do not pass a BP diagnostic score as an investment score, and do not let screening rewrite the BP.

## Sourcing to screening

Pass only owner-selected candidates and only:

- canonical entity identity and aliases;
- explicit mandate fields and dated evidence;
- provenance and evidence states;
- conflicts and restrictions;
- approved company/project facts;
- relationship/access fields only when needed and authorized.

Do not pass private personality judgments, inferred influence, outreach drafts, or unrelated contacts.

## Capital sourcing to GP-fit

Pass documented fund/GP mandate, fund/vehicle, stage, sector, geography, ticket, ownership preference, portfolio conflicts, fund timing, evidence date, and unknowns. Keep key-person access separate from mandate fit.

## GP-fit to meeting preparation

After owner approval, pass GP/fund identity, fit evidence, relevant company facts, known objections, approved relationship route, restricted topics, desired next step, confidentiality, and source refs. Do not state that the GP is interested unless a dated attributable source says so.

Use the canonical recipient `$prepare-investment-meeting` and include `transaction_id`, meeting type `gp_introduction`, participant/authority evidence, relationship owner, `as_of_date`, source/conflict refs, permission and no-contact state, restricted topics, desired next step, and gate status. Meeting preparation must revalidate participant identity and authority.

## Screening output

Return thesis/counter-thesis, mandate fit, kill-criteria states, evidence gaps, risk carry-forward, uncertainty, and owner-only decision options. Keep `owner_decision` empty until supplied by an authorized human.

Never strip permission, no-contact, confidentiality, source, uncertainty, or review state from a handoff.
