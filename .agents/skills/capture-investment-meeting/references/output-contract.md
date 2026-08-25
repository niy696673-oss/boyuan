# Output Contract

## Required Envelope

| Field | Requirement |
|---|---|
| `artifact_type` | `investment_meeting_minutes` |
| `record_status` | `draft_unapproved`, `validated_internal`, or human-supplied formal status |
| `transaction_id` | Stable ID or `unknown` |
| `meeting_type` | Controlled classification |
| `meeting_datetime` | Date, time, and timezone if known |
| `side` | Meeting-side classification |
| `as_of_date` | Evidence cut date |
| `confidentiality` | Access tier |
| `consent_basis` | User-confirmed recording/transcript authority |
| `source_register` | Audio, transcript, notes, agenda, and related sources |
| `participant_register` | Speaker identity and confidence |
| `coverage_report` | Source coverage, timestamp quality, gaps |
| `minutes` | Chinese summary and topic record |
| `event_registers` | Decisions, commitments, actions, questions, conflicts, risks |
| `update_proposals` | Typed proposals; no mutation performed |
| `validation_queue` | Items and required human validator |
| `approval_status` | Human-gate state |

## Event Record

```yaml
event_id: "EVT-001"
event_type: "fact | speaker_assertion | inference | decision | commitment | action_item | open_question | process_signal"
summary_zh: "faithful Chinese summary"
speaker_id: "P-001 | multiple | unknown"
source_id: "SRC-001"
timestamp: "00:12:31-00:13:10 | note location | unavailable"
transcription_confidence: "high | medium | low | unavailable"
evidence_state: "source-confirmed | user-provided | calculated | inferred | assumption | unknown | conflicting"
access_class: "internal | restricted | strictly_restricted"
human_validation_required: true
```

## Update Proposal

```yaml
proposal_id: "UPD-001"
proposal_type: "fact | thesis | relationship | process | task"
target_system: "institutional_memory | crm | deal_tracker | task_system | none"
target_record: "record ID or unresolved"
proposed_change_zh: "specific change"
before_state: "known prior state or unknown"
evidence_refs: ["EVT-001"]
conflict_refs: []
access_class: "restricted"
validator_role: "meeting_owner"
mutation_status: "not_performed"
gate_status:
  external_state_mutation_approval: "pending"
```

## Final QA

- Verify speaker, source, and timestamp for every material event.
- Separate what was said from what the recorder infers.
- Confirm action owners and dates were stated or clearly marked proposed.
- Preserve objections, dissent, conflicts, and open questions.
- Confirm no external system or institutional memory was changed.
- Confirm formal records remain `draft_unapproved` until designated human approval.
