---
name: meetings-router
description: "Route FA, VC, PE, LP, diligence, term, board, portfolio, and internal-debrief meeting workflows across preparation, role-specific DD questions, minutes, and controlled update proposals. Use when meeting type or phase is ambiguous or multiple meeting skills must coordinate; never mutate institutional memory or auto-finalize governance records."
---

# Private-Markets Meetings Router

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

## Purpose

Classify a private-market meeting and coordinate the minimum pre-meeting or post-
meeting workflow. Adapt preparation and capture to the formal gate, transaction
side, participant authority, relationship context, and confidentiality.

Keep pre-meeting briefing, DD question design, and post-meeting capture as separate
atomic responsibilities. Emit typed handoffs and update proposals; do not perform
external writes.

## Build the Meeting Context

Confirm:

- transaction and meeting ID;
- meeting phase: `pre_meeting`, `post_meeting`, or `mixed_request`;
- meeting type and formal process gate;
- side: company, FA, GP, LP, advisor, or mixed;
- participants, formal roles, process roles, and meeting owner;
- objective, expected decision or next step, date, duration, and channel;
- confidentiality, consent, recording status, and permitted source set;
- authorized relationship and prior-meeting context.

Obtain `input_scope_approval` for restricted participant, relationship, GP key-
person, transcript, or recording data. If phase, type, owner, or consent is unclear,
return a clarification plan rather than selecting a generic meeting workflow.

## Apply Shared Controls

Require `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`,
`unknown`, and `conflicting` evidence states. Preserve as-of date, source register,
calculation lineage, conflict log, speaker provenance, and access class.

Probe transcription, diarization, OCR, web, calendar, CRM, VDR, and memory
capabilities only as relevant. Unavailable capability yields a Chinese brief,
schema, partial minutes, or update proposal with visible gaps. Never claim to have
heard, scheduled, sent, stored, or updated anything that did not occur.

Read [workflow.md](references/workflow.md) for recipes,
[output-contract.md](references/output-contract.md) for typed handoffs, and
[china-private-markets.md](references/china-private-markets.md) for meeting-type
adaptation.

## Select the Route

- Pre-meeting brief and agenda: `prepare-investment-meeting` owns the artifact.
- Detailed role-specific DD question tree: `draft-dd-interview-questions` owns the
  question bank; preparation provides context and objectives.
- Post-meeting minutes and update proposals: `capture-investment-meeting` owns the
  record.
- A digital-persona context pack is a deterministic assembly of approved source
  records and validated meeting updates; it is not a new persona Skill and does
  not authorize autonomous representation.
- A request spanning before and after the meeting becomes two phases with an
  explicit handoff; never merge planned statements into actual minutes.
- A request to update CRM or memory stops at a proposal until separately approved.

## Execute the Recipe

1. Classify meeting type, phase, formal gate, side, and ownership.
2. Select one lead atomic skill for the current phase.
3. Add `draft-dd-interview-questions` only when a genuine role-specific diligence
   question tree is required.
4. Pass a typed context or capture-plan handoff.
5. Apply meeting-specific human gates and stop conditions.
6. Return the next-phase handoff or update proposal without performing external
   state mutation.

When the user requests a GP-key-person or institutional digital-persona context,
use the controlled recipe in [workflow.md](references/workflow.md). Keep identity,
side, accessible projects, approved preferences, restricted fields, unknowns,
sources, version, reviewer, and expiry explicit. Do not simulate a real person to
make commitments, investment statements, legal interpretations, or disclosures.

## Return the Route Result

Default human-facing output to Simplified Chinese. Keep schemas and control values
in English. Return:

- meeting classification and rationale;
- selected phase recipe and lead owner;
- ordered component plan;
- typed handoffs, source restrictions, and capability fallbacks;
- formal-record requirements;
- human gates, stop conditions, and unresolved items;
- update proposals with `mutation_status: not_performed`.

## Human Gates and Stop Conditions

- Require the relationship owner to approve participant-specific strategy and
  sensitive context.
- Require the meeting owner to validate post-meeting speakers, decisions,
  commitments, action owners, and changed facts.
- Require secretary or chair, and counsel when appropriate, for board, IC, or other
  formal governance records; never auto-finalize or supplement the official record.
- Require `external_release_approval` for external sharing and
  `external_state_mutation_approval` for calendar, CRM, VDR, memory, task, or
  repository writes.
- Stop when consent, participant identity, formal owner, or source authenticity is
  materially uncertain.

## Resources

- [Router output and handoff contract](references/output-contract.md)
- [Meeting recipes](references/workflow.md)
- [China private-market meeting map](references/china-private-markets.md)
