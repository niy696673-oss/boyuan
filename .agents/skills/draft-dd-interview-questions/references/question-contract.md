# Interview question contract

Use stable `objective_id` and `question_id` values so answers can flow into minutes and evidence review.

## Artifact envelope

Record `artifact_type: dd_interview_question_tree`, `deal_id`, `meeting_id` when known, `interview_type`, `respondent_role`, `as_of_date`, `confidentiality`, `source_register`, `calculation_lineage`, `conflict_log`, and `gate_status`. Use the exact evidence states `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`. Record all four shared gate events as `approved`, `pending`, or `not_required`.

## Objective fields

- `objective_id`
- `hypothesis_or_gap`
- `evidence_state`
- `decision_relevance`
- `source_refs`
- `sensitivity`
- `approver`

## Question fields

- `question_id`, `objective_id`, `priority`
- `question_zh`
- `question_type`: `open`, `fact_pattern`, `metric_definition`, `evidence_request`, `contradiction_test`, or `closing`
- `knowledge_basis_sought`: `first_hand`, `record_based`, `estimate`, or `opinion`
- `follow_up_if_supported`
- `follow_up_if_not_supported`
- `follow_up_if_unclear`
- `requested_evidence`
- `restricted_topic`
- `stop_condition`

## Capture grid

For live use, add `answer_summary`, `speaker`, `timestamp_or_span`, `answer_type`, `evidence_state`, `contradiction`, `promised_material`, `owner`, and `next_question`.

After the interview, map `speaker` to the `speaker_id` used by `$capture-investment-meeting`, preserve `source_id` and exact timestamp/span, and keep answer fields unvalidated until the meeting owner approves the captured record.

Do not fill the answer fields before the interview. Do not use a numeric confidence score unless a user-provided method requires one and exposes its basis.

## Quality checks

- Each question maps to one objective.
- Each material objective has an evidence request or an explicit reason none is possible.
- Contradiction tests cite both sides of the conflict.
- No question asserts wrongdoing or a desired investment outcome.
- Restricted topics have an approver and stop condition.
