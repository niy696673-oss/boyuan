# Project-Memory Contract

## Accessible context is explicit

Use only context that is actually visible or materialized in the current run:

1. direct instructions and approvals visible in the current conversation;
2. user-supplied files and notes;
3. an authorized project-memory export or connected context tool;
4. real execution traces, corrections, and evaluation artifacts supplied or
   accessible within the approved scope;
5. approved external standards and source material.

Do not claim that conversation history, hidden state, another workspace, private
repository, email, CRM, VDR, or meeting archive was read unless a capability was
available, authorized, and actually used.

## Context register

Each entry records:

- `context_id`;
- `source_type`;
- `source_id` or stable locator;
- `access_basis` explaining how the source became available in this run;
- `as_of_date` and, when relevant, observed event date;
- `evidence_state`;
- confidentiality and permission scope;
- direct observation or concise claim;
- target behaviors affected;
- conflicts, limitations, and expiry or staleness risk.

Allowed `source_type` values are:

- `visible_conversation`;
- `user_supplied_file`;
- `authorized_memory_export`;
- `run_trace`;
- `user_feedback`;
- `evaluation_artifact`;
- `approved_external_source`;
- `analyst_inference`.

Use only the evidence states in the global contract. A memory summary is not a
primary source for exact wording, numeric facts, legal terms, or user approval.

## Conflicts and retention

Preserve contradictory instructions with timestamps and scope. Apply the newest
explicit instruction only when it clearly supersedes the older one; otherwise ask
for resolution. Do not embed confidential project facts into generic examples or
tests. Prefer synthetic fixtures and minimize retained personal or relationship
data.

When required context is unavailable, identify the exact missing source and offer
a materialization request. Continue only with a clearly labeled limited-scope
proposal when doing so cannot change the user's intended outcome.
