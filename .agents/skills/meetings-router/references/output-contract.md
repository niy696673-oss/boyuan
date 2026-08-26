# Router Output Contract

## Route Plan

```yaml
route_id: "MEET-ROUTE-001"
domain: "fa_meetings"
transaction_id: "stable ID or unknown"
meeting_id: "stable ID or proposed ID"
meeting_phase: "pre_meeting | post_meeting | mixed_request"
meeting_type: "controlled classification"
formal_gate: "process gate or none"
side: "company | fa | gp | lp | advisor | mixed"
meeting_owner: "verified owner or unknown"
confidentiality: "internal | restricted | strictly_restricted"
as_of_date: "YYYY-MM-DD"
lead_owner: "atomic skill"
component_sequence: []
consent_status: "confirmed | not_applicable | unresolved"
human_gates: []
stop_conditions: []
unresolved: []
```

## Pre-Meeting Handoff

```yaml
handoff_id: "HO-PRE-001"
from_component: "meetings-router"
to_component: "prepare-investment-meeting"
meeting_context_ref: "context record"
participant_refs: ["P-001"]
objective: "bounded preparation objective"
source_register_ref: "source register"
conflict_log_ref: "conflict log"
access_restrictions: []
gate_status:
  input_scope_approval: "approved | pending"
unresolved: []
```

## DD-Question Handoff

```yaml
handoff_id: "HO-DDQ-001"
from_component: "prepare-investment-meeting"
to_component: "draft-dd-interview-questions"
meeting_type: "management_dd | customer_dd | expert_dd | other"
interviewee_role: "verified role"
hypothesis_refs: ["H-001"]
evidence_gap_refs: ["GAP-001"]
restricted_topics: []
requested_action: "build role-specific question tree"
```

## Post-Meeting Handoff

```yaml
handoff_id: "HO-POST-001"
from_component: "prepare-investment-meeting | meetings-router"
to_component: "capture-investment-meeting"
meeting_context_ref: "context record"
capture_plan_ref: "approved capture plan or none"
source_manifest: []
consent_status: "confirmed | unresolved"
formal_record_owner: "secretary, chair, meeting owner, or unknown"
gate_status:
  input_scope_approval: "approved | pending"
```

## Update-Proposal Handoff

Any downstream CRM, memory, VDR, deal-tracker, or task request must include target
record, proposed change, before state, evidence refs, conflict refs, access class,
human validator, and `mutation_status: not_performed`. Reject mutation when
`external_state_mutation_approval` is not explicitly approved.

## Router QA

- Confirm planned content never enters minutes as actual speech.
- Confirm the question-bank skill does not own the meeting brief.
- Confirm speaker and source provenance survive post-meeting handoffs.
- Confirm formal-record status and validator are explicit.
- Confirm no system, calendar, memory, or task mutation occurred.

## Digital-Persona Context Pack

When the controlled context-pack recipe is selected, add:

```yaml
context_pack_id: "CTX-001"
represented_role: "verified role, not inferred persona"
authorized_side: "company | fa | gp | lp | advisor"
accessible_projects: ["permissioned project IDs"]
identity_effective_date: "YYYY-MM-DD"
approved_preferences: []
public_fields: []
confidential_fields: []
prohibited_fields: []
refusal_and_escalation_rules: []
source_refs: []
version: "1.0"
reviewer: "authorized person or institutional owner"
expires_at: "ISO-8601"
mutation_status: "not_performed"
```

Never infer personal intent, create an autonomous investment view, or use the pack
to represent a real person without live authorization and recipient-level access.
