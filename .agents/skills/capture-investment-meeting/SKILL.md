---
name: capture-investment-meeting
description: "Turn authorized FA, VC, PE, LP, diligence, term, board, or portfolio meeting audio, transcript, and notes into evidence-linked Chinese minutes, action items, fact updates, and controlled update proposals. Use after a meeting; never auto-finalize formal IC or board records or mutate CRM, memory, VDR, or other systems."
---

# Capture Investment Meeting

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

## Purpose

Create an auditable record of what was said, decided, committed, questioned, and
assigned. Preserve speaker and source provenance, separate evidence classes, and
propose downstream updates without silently changing institutional memory.

This skill owns minutes and update proposals. It does not prepare the meeting,
decide an investment, create a diligence conclusion, or perform external writes.

## Confirm Authority and Source Quality

1. Confirm meeting type, transaction, date, participants, side, recording consent,
   confidentiality, minute owner, formal-record status, and permitted source set.
2. Obtain `input_scope_approval` before processing personal, relationship, GP key-
   person, or restricted meeting content.
3. Probe audio playback, transcription, diarization, OCR, and document capability.
   Record tool limits, transcript coverage, timestamp precision, speaker confidence,
   and inaudible segments.
4. Read [workflow.md](references/workflow.md) and formal-meeting controls in
   [china-private-markets.md](references/china-private-markets.md).

## Classify Every Material Statement

Use `fact`, `speaker_assertion`, `inference`, `decision`, `commitment`,
`action_item`, `open_question`, or `process_signal`. Separately tag its evidence
state as `source-confirmed`, `user-provided`, `calculated`, `inferred`,
`assumption`, `unknown`, or `conflicting`.

Attach source ID, timestamp or note location, speaker ID, transcription confidence,
and access class. A statement made in a meeting is normally a
`speaker_assertion`, not an independently confirmed fact.

## Capture the Meeting

1. Build the source and participant register; reconcile speaker labels.
2. Segment the record by agenda topic and material event.
3. Extract decisions, commitments, action items, questions, changed facts,
   conflicts, risks, objections, and process signals.
4. Link each item to exact provenance and distinguish verbatim substance from
   editorial summary.
5. Reconcile action owner, due date, dependency, recipient, and approval status.
6. Draft minutes tailored to meeting type without adding plausible-but-unspoken
   content.
7. Create typed fact, thesis, relationship, process, and task update proposals.
8. Apply [output-contract.md](references/output-contract.md).

## Return the Result

Default narrative output to Simplified Chinese. Keep record types, source IDs,
speaker IDs, evidence states, and update schemas in English. Return:

- meeting and source register;
- Chinese executive summary and structured minutes;
- decision, commitment, action, open-question, conflict, and risk registers;
- changed-fact proposals with before/after evidence;
- thesis, relationship, process, and task update proposals;
- validation queue and formal-record status.

If transcription is unavailable or incomplete, return a partial record with visible
coverage gaps. Do not reconstruct missing speech from context.

## Human Gates and Stop Conditions

- Require the meeting owner to validate speakers, decisions, commitments, action
  owners, dates, changed facts, and sensitive relationship signals.
- For board, IC, investment-committee, or other formal governance records, require
  the designated secretary or chair and counsel when appropriate; mark output
  `draft_unapproved` and never auto-finalize or supplement the official record.
- Require `external_release_approval` before sharing minutes outside the approved
  group.
- Require `external_state_mutation_approval` before any CRM, memory, VDR, scheduler,
  task system, or repository write. This skill emits proposals only.
- Stop when consent, source authenticity, meeting identity, or formal-record owner
  cannot be established.

## Resources

- [Output contract](references/output-contract.md)
- [Detailed workflow](references/workflow.md)
- [China private-market context](references/china-private-markets.md)
