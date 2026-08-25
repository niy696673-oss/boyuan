---
name: prepare-investment-meeting
description: "Prepare an evidence-backed brief and agenda for an FA, VC, PE, LP, founder, diligence, term, board, or portfolio meeting. Use for pre-meeting objectives, participant authority, hypotheses, landmines, and role planning; do not use as the full DD interview-question bank or as post-meeting minutes."
---

# Prepare Investment Meeting

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

## Purpose

Prepare the team to use a private-market meeting deliberately. Adapt the brief to
meeting type, process stage, transaction side, participant authority, relationship
context, evidence, and permitted disclosures.

This skill owns the pre-meeting brief and agenda. Route a detailed role-specific
DD question tree to `draft-dd-interview-questions`, and route transcripts or notes
to `capture-investment-meeting`.

## Classify Before Planning

1. Confirm transaction, meeting type, stage, side, objective, participants,
   meeting owner, duration, channel, confidentiality, as-of date, and source set.
2. Obtain `input_scope_approval`, especially for relationship, personal, GP key-
   person, or prior-meeting data.
3. Verify participant identities, titles, decision authority, and relationship
   history from supplied or authorized sources. Mark unverified items `unknown`.
4. Read [workflow.md](references/workflow.md) and the meeting adaptations in
   [china-private-markets.md](references/china-private-markets.md).

## Control Evidence and Hypotheses

Tag claims as `source-confirmed`, `user-provided`, `calculated`, `inferred`,
`assumption`, `unknown`, or `conflicting`. Maintain as-of date, source register,
calculation lineage, conflict log, and access restrictions.

Keep participant motivations, objections, political dynamics, and decision
preferences as labeled hypotheses unless directly supported. Do not infer a
person's authority from seniority alone. Do not reproduce sensitive relationship
notes outside the approved team.

## Prepare the Meeting

1. State the meeting's primary objective, acceptable next step, and non-objectives.
2. Map participants by formal role, likely process role, authority, relationship
   owner, and evidence confidence.
3. Summarize transaction status, previous commitments, open questions, and
   material changed facts.
4. Develop testable hypotheses and likely objections with evidence for and
   against each hypothesis.
5. Design an agenda with time, owner, intended outcome, and fallback path.
6. Prepare top-level questions, proof packages, anticipated answers, landmines,
   disclosure boundaries, and escalation points.
7. Assign speaking roles, note-taking, decision capture, and follow-up ownership.
8. Apply [output-contract.md](references/output-contract.md).

## Return the Result

Default narrative output to Simplified Chinese. Keep evidence states, source IDs,
participant IDs, and schema fields in English. Return:

- meeting classification and objective hierarchy;
- participant and authority map;
- transaction-status and evidence brief;
- hypotheses and objection map;
- timed agenda and role plan;
- top-level questions and proof references;
- landmines, restricted topics, and do-not-disclose list;
- decision, commitment, and follow-up capture plan.

Do not create fictional biographical or relationship detail. If authorized current
information is unavailable, provide a verification checklist rather than filling
the gap.

## Human Gates and Stop Conditions

- Require the relationship owner to approve meeting strategy, sensitive
  hypotheses, restricted topics, and participant-specific handling.
- Require `method_assumption_approval` for consequential inferred motivations or
  decision pathways.
- Require `external_release_approval` before sending the brief or agenda outside
  the approved team.
- Stop when meeting type, side, principal objective, or participant identity is too
  ambiguous to support a safe brief.
- Never schedule, invite, contact, or update external systems without separate
  authorization and `external_state_mutation_approval`.

## Resources

- [Output contract](references/output-contract.md)
- [Detailed workflow](references/workflow.md)
- [China private-market context](references/china-private-markets.md)
