---
name: draft-dd-interview-questions
description: Draft role-specific, non-leading due-diligence interview questions and follow-up trees for management, technical, customer, supplier, expert, employee, or reference interviews in private-market financing, VC, PE, or FA work. Use only when the user explicitly requests a DD interview guide, management question list, expert-call questions, customer-reference questions, or live follow-up plan. Do not use for a general meeting brief, meeting minutes, a DD request list, risk conclusions, or autonomous interviewing and recording.
---

# Draft DD Interview Questions

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Own the question tree only. Let `$prepare-investment-meeting` own the meeting brief and `$capture-investment-meeting` own the minutes.

## Establish the interview mandate

1. Identify the interview type, respondent role, decision purpose, hypotheses, known evidence, contradictions, missing evidence, consent status, confidentiality, and restricted topics.
2. Confirm who requested the interview and who approves sensitive questions.
3. Check conflicts, incentives, relationship to the target, and limits on reliance.
4. Obtain project/domain lead approval before using questions on legal exposure, personal information, national-security sensitivity, alleged misconduct, or third-party confidential information.

Obtain `input_scope_approval` for the source set and restricted respondent context. Tag every substantive premise as `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, or `conflicting`. Preserve `as_of_date`, `source_register`, `calculation_lineage` (including an explicit empty value), and `conflict_log`.

Apply source precedence: signed or official originals; audited or regulatory sources; authorized user working files; reproducible calculations; inference. Use higher-authority sources to frame contradiction tests but preserve both sides.

Read [role-playbooks.md](references/role-playbooks.md) only for the selected respondent type. Use [question-contract.md](references/question-contract.md) for the output schema and quality checks.

## Build the question tree

For each hypothesis or material gap:

1. State a neutral verification objective.
2. Ask an open primary question before testing a specific claim.
3. Add fact-pattern follow-ups: who, what, when, where, how often, compared with what, and how measured.
4. Request contemporaneous evidence, a reproducible example, or the responsible record owner.
5. Add contradiction tests that present the conflicting evidence without accusing the respondent.
6. Add a stop condition for privilege, confidentiality, personal safety, consent withdrawal, or topics outside the respondent's competence.
7. Record the expected downstream evidence state; never prescribe the answer.

Keep questions short enough to ask aloud. Separate must-ask questions from optional probes. Do not infer truth from confidence, hesitation, tone, body language, seniority, or cultural stereotypes.

## Protect interview integrity

- Use non-leading language. Avoid embedding the desired conclusion in the question.
- Distinguish first-hand knowledge, hearsay, estimate, opinion, and management assertion.
- Ask for metric definitions, periods, entities, samples, denominators, and exceptions.
- Do not ask a customer, supplier, expert, or former employee to disclose trade secrets, inside information, privileged material, personal data, or another party's confidential documents.
- Do not record, transcribe, contact, invite, or compensate a participant without the required consent and authority.
- Treat expert/customer/supplier views as third-party assertions until corroborated.

## Produce the Chinese deliverable

Default to Simplified Chinese and include:

1. interview purpose, respondent role, conflicts, reliance limits, and consent notes;
2. ranked objectives and must-ask questions;
3. role-specific follow-up trees and evidence requests;
4. contradiction tests with source references;
5. restricted topics, stop conditions, and escalation path;
6. an interviewer capture grid for answer, source span/timestamp, evidence state, follow-up, and owner.
7. human-gate status and unresolved conflicts or unknowns.

Preserve source-language names and technical terms. Label all hypotheses as `assumption` or `inferred`; do not restate them as facts.

When questions use financial, market, or valuation figures, state entity, period, CNY unit, accounting basis, valuation date, conversion method, and FX date as applicable. Label unofficial translations and management assertions.

## Apply human gates

- Require `method_assumption_approval` before using a non-user scoring, prioritization, credibility, or materiality method.
- Require `external_release_approval` before sharing the guide with a respondent or outside adviser.
- Require `external_state_mutation_approval` before contacting, inviting, recording, compensating, scheduling, or storing data in an external system; this Skill performs none of those actions.

## Stop and hand off

Stop when respondent identity, consent, scope, or a sensitive-topic approver is unresolved. Do not make a credibility score, risk severity, legal conclusion, or investment decision.

After the interview, send source-attributed answers and contradictions to `$capture-investment-meeting` for minutes and, only after human validation, to `$extract-risk-flags` for substantive risk analysis.
