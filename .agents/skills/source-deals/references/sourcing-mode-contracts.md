# Sourcing mode contracts

Select exactly one contract per run.

## Artifact envelope

Every mode records `artifact_type`, `run_id`, `mode`, `side`, `as_of_date`, `confidentiality`, `source_register`, `calculation_lineage`, `conflict_log`, and `gate_status`. Use the exact evidence states `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`. Keep source or relationship assertion type in a separate field.

## `project-sourcing`

Required fields:

- `candidate_id`, `company_name`, `legal_entity`, `aliases`
- `stage`, `sector`, `geography`, `transaction_signal`, `signal_date`
- `mandate_fit_dimensions`, `mandate_fit_evidence`, `fit_unknowns`
- `source_refs`, `retrieved_at`, `source_permission`
- `relationship_route`, `relationship_owner`, `permission_state`
- `conflicts`, `no_contact_state`, `confidentiality`
- `next_research_action`, `screening_handoff_status`

Do not include investment decision options.

## `capital-source-sourcing`

Required fields:

- `candidate_id`, `gp_name`, `fund_or_vehicle`, `strategy`
- `fund_status`, `stage_focus`, `sector_focus`, `geography`, `ticket_range`, `ownership_preference`
- `portfolio_conflicts`, `mandate_evidence_date`, `fit_unknowns`
- `key_person_name`, `public_role`, `relevance_evidence`, `decision_power_state`
- `introduction_path`, `relationship_owner`, `relationship_evidence`, `permission_state`
- `source_refs`, `retrieved_at`, `source_permission`
- `no_contact_state`, `confidentiality`, `next_research_action`

Use `decision_power_state: unknown` unless permissioned evidence supports a more specific statement. Keep private ratings in a restricted field, never in the general pipeline.

## Common provenance rules

- Preserve source, date, original language, and access basis.
- Do not silently merge conflicting identities or mandates.
- Label stale facts and set a next verification date.
- Separate observable fit from inferred fit.
- Do not call the candidate “interested” without a dated, attributable expression of interest.
- Record `input_scope_approval`, `method_assumption_approval`, `external_release_approval`, and `external_state_mutation_approval` as `approved`, `pending`, or `not_required`.
