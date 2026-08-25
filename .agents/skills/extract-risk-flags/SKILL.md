---
name: extract-risk-flags
description: Extract and structure substantive, evidence-backed risk flags from supplied private-market materials, validated interview records, models, contracts, or diligence outputs for China-focused financing, VC, PE, or FA work. Use only when the user explicitly requests a risk register, red-flag extraction, diligence issue list, contradiction assessment, or risk update. Do not use to build a request list, treat VDR absence as proof, issue legal/accounting conclusions, silently downgrade an existing severity, or make an investment or IC decision.
---

# Extract Risk Flags

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Operate at the final stage of the one-way diligence chain:

`Checklist request universe -> VDR coverage/gaps/conflicts -> substantive risk flags`

A missing document is a coverage gap. It becomes a substantive risk flag only when evidence establishes a relevant obligation, expected record, repeated non-production, contradictory representation, control failure, or decision impact. Preserve both records separately.

## Establish inputs and authority

1. Capture deal side, stage, audience, confidentiality, `as_of_date`, `source_register`, `calculation_lineage`, `conflict_log`, prior risk register, and approved severity framework.
2. Require source locations for substantive flags. Use `unknown` or `needs evidence` when the record is insufficient.
3. Identify professional ownership. Counsel owns legal conclusions; accountants own FDD/accounting conclusions; technical specialists own technical conclusions; the investment owner approves overall severity.
4. Treat company statements and third-party statements as assertions until corroborated.

Obtain `input_scope_approval` for the source set. Tag each claim as `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, or `conflicting`; keep claim type separate from evidence state.

Apply source precedence: signed or official originals; audited or regulatory sources; authorized user working files; reproducible calculations; inference. Preserve contrary evidence and conflicts regardless of source rank.

Use [risk-register-contract.md](references/risk-register-contract.md) for fields and [severity-governance.md](references/severity-governance.md) for severity floors and downgrade rules.

## Extract candidate flags

For each potentially material issue:

1. Quote or precisely paraphrase the evidence and record source ID, location, date, entity, period, and evidence state.
2. Classify the issue as `commercial`, `technical`, `financial`, `tax`, `legal`, `governance`, `compliance`, `data_security`, `esg_ehs`, `team`, or `transaction_structure`.
3. State the observed condition separately from its potential impact.
4. Record supporting evidence, contradictory evidence, missing evidence, affected thesis, and whether the issue is isolated or systemic.
5. Assign a candidate severity only using the approved framework; explain impact, likelihood basis, time horizon, reversibility, and remediation dependency.
6. Define validation questions, mitigation, owner, deadline if supplied, and decision relevance.

Do not infer fraud, illegality, intent, or legal breach from inconsistency alone. Do not call an issue remediated merely because management proposes an action.

## Enforce the severity floor

- Carry forward the highest approved severity for the same underlying issue across Skills and versions.
- Do not lower, merge away, relabel into a less severe category, or omit an approved flag without an explicit reviewer, rationale, new evidence references, and timestamp.
- When a new output conflicts with an approved severity, show both and set `severity_status: needs-review`.
- Allow automatic escalation when new evidence satisfies a higher approved threshold, but still label it `candidate` until the investment owner approves it.
- Preserve closed/remediated issues in history with residual risk; never delete them from lineage.

## Produce the Chinese deliverable

Default to Simplified Chinese and include:

1. executive risk summary with candidate versus approved status;
2. typed risk register with evidence, contradictions, impact, and severity basis;
3. coverage gaps kept separate from substantive flags;
4. mitigation/validation plan, owner, dependencies, and residual risk;
5. severity-change log and unresolved professional-review items;
6. `source_register`, `calculation_lineage`, `conflict_log`, `as_of_date`, confidentiality, and explicit limitations.

Use English schema keys and retain source-language quotations. Keep legal/compliance assertions attributed and labeled `counsel-review-required` unless an authorized professional conclusion is supplied.

For quantified impact, record CNY unit, accounting basis, valuation date, conversion method, FX date, and calculation lineage. Label unofficial translations and unsupported “领先”, “唯一”, “国产替代”, or “卡脖子” language as assertions.

## Apply human gates

- Require `method_assumption_approval` before applying a non-user severity, materiality, likelihood, or loss method.
- Require the investment owner to approve severity and the relevant professional to approve professional conclusions.
- Require `external_release_approval` before sharing allegations or risk registers outside the approved team.
- Keep `external_state_mutation_approval` pending or `not_required`; this Skill does not write to a VDR, CRM, IC system, or institutional memory.

## Stop conditions

Stop and seek human review when source authenticity is doubtful, source locations are unavailable for a material allegation, professional conclusions conflict, severity would be downgraded, or sensitive allegations could cause material harm.

Do not:

- convert `not_present`, `unknown`, or `unreadable` into proof of misconduct;
- issue legal, audit, tax, export-control, national-security, or regulatory advice;
- conceal contradictory evidence;
- assign false numeric precision to likelihood or loss;
- release a formal IC recommendation, vote, pass/fail decision, or external allegation.
