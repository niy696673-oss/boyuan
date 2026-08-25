# Output Contract

## Required Envelope

| Field | Requirement |
|---|---|
| `artifact_type` | `investment_meeting_brief` |
| `transaction_id` | Stable ID or `unknown` |
| `meeting_type` | Controlled meeting classification |
| `transaction_stage` | Current process stage |
| `side` | `company`, `fa`, `gp`, `lp`, `advisor`, or `mixed` |
| `as_of_date` | Evidence cut date |
| `confidentiality` | Access tier |
| `meeting_objectives` | Primary, secondary, non-objectives, next step |
| `participant_map` | Identity, role, authority, relationship, confidence |
| `source_register` | Source and access record |
| `calculation_lineage` | Any derived figures used in the brief |
| `conflict_log` | Unresolved factual conflicts |
| `status_brief` | Current facts, changes, commitments, open items |
| `hypothesis_register` | Testable, evidence-linked hypotheses |
| `agenda` | Timed topics, owner, outcome, fallback |
| `question_plan` | Top-level questions and proof references |
| `landmines` | Risk, restriction, handling, escalation |
| `capture_plan` | Decisions, commitments, actions, and note owner |
| `approval_status` | Human-gate state |

## Participant Record

```yaml
participant_id: "P-001"
name: "verified name or unknown"
organization: "verified organization or unknown"
formal_title: "source-supported title"
process_role: "decision_maker | vote_holder | sponsor | evaluator | executor | advisor | unknown"
authority_basis: "source or user statement"
authority_confidence: "confirmed | probable | unknown | conflicting"
relationship_owner: "internal owner or unknown"
relationship_context: "restricted summary or omitted"
source_ids: ["SRC-001"]
```

## Hypothesis Record

```yaml
hypothesis_id: "H-001"
hypothesis_zh: "可检验假设"
evidence_for: ["SRC-001"]
evidence_against: []
confidence: "low | medium | high"
test_question_zh: "non-leading question"
proof_package: ["approved evidence item"]
owner: "meeting team member"
```

## Final QA

- Confirm the meeting classification drives the agenda.
- Verify every participant-specific statement has a source and access basis.
- Separate facts, hypotheses, objectives, and desired outcomes.
- Check the agenda fits the available time and participant authority.
- Confirm restricted topics and external-send status with the relationship owner.
