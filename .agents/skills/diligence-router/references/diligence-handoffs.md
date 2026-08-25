# Diligence handoffs

## Common envelope

Every handoff includes:

`handoff_id`, `from_component`, `to_component`, `transaction_id`, `deal_id`, `side`, `stage`, `entity`, `as_of_date`, `confidentiality`, `source_register_ref`, `calculation_lineage_ref`, `conflict_log_ref`, `artifact_type`, `artifact_version`, `created_by`, `review_status`, `approved_by`, `evidence_states`, `requested_action`, `restrictions`, `unresolved`, `gate_status`.

Use one stable identifier: map the diligence `deal_id` to the cross-domain `transaction_id` and never create a second transaction identity.

Use only `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting` as evidence states. `gate_status` preserves `input_scope_approval`, `method_assumption_approval`, `external_release_approval`, and `external_state_mutation_approval`.

## Checklist to VDR

`request_universe[]`, scope exclusions, acceptance criteria, entities, periods, access classes, workstream owners, scope approval.

## VDR to interview

Validated gaps, contradictions, unclear mappings, source references, hypotheses affected, restricted topics. Do not include an inferred substantive risk as fact.

For a full interview package, hand meeting context to canonical `$prepare-investment-meeting` and the approved question objective payload to `$draft-dd-interview-questions`. Include `transaction_id`, `meeting_id` when known, meeting type, side, participant and authority evidence, hypotheses, source/conflict refs, restricted topics, and gate status. The meeting Skill owns participant authority, agenda, roles, and landmines; the question Skill owns only the role-specific question tree.

## VDR to risk

Send separately:

- `coverage_gaps[]`
- `substantive_evidence_candidates[]`
- `contradictions[]`
- `specialist_review_items[]`

## Interview evidence to risk

Only human-validated `$capture-investment-meeting` records: `record_status`, `speaker_id` and role, consent boundary, `source_id`, exact span/timestamp, answer/event type, evidence state, contradiction links, promised evidence, reviewer, access class, and conflict-log reference. Never pass planned questions or unvalidated transcript text as findings.

## Risk to downstream assembler

Risk ID, issue/evidence, approved severity and severity floor, contradictions, mitigation status, residual risk, owner, decision relevance, and professional attribution.

Never strip `unknown`, conflict, confidentiality, review status, source refs, or severity-floor lineage during a handoff.
