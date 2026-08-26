---
name: source-deals
description: "Build a provenance- and permission-aware private-market sourcing pipeline in exactly one mode per run: investor-side project sourcing or company/FA-side capital-source and GP key-person sourcing. Use only when the user explicitly requests target discovery, origination, a project pipeline, investor/GP targeting, capital-source mapping, or a permissioned relationship route. Do not use to score or decide a deal, merge both sourcing modes, infer real influence from job title, scrape restricted personal data, contact anyone, or send outreach."
---

# Source Deals

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Run exactly one mutually exclusive mode:

1. `project-sourcing`: an investor/GP searches for companies or opportunities.
2. `capital-source-sourcing`: a company or FA searches for GPs, capital sources, and permissioned key-person routes.

If the request contains both, separate it into two runs with distinct inputs and outputs. Never merge the schemas or rank a company and a GP in the same score.

## Establish the sourcing mandate

1. Record mode, side, owner, mandate, stage, sector, geography, ticket or financing ask, transaction type, time horizon, exclusions, conflicts, confidentiality, and as-of date.
2. Obtain `input_scope_approval` and permission to use private project, relationship, CRM, meeting, or key-person data. Apply the most restrictive source permission downstream.
3. Probe available search, database, CRM, and memory capabilities. Do not imply access that is unavailable.
4. Define success as a traceable candidate universe, not outreach, interest, or funding.

Read only the selected mode in [sourcing-mode-contracts.md](references/sourcing-mode-contracts.md). Apply [permission-and-contact-controls.md](references/permission-and-contact-controls.md) to every candidate and relationship edge.

## Build the candidate universe

1. Search only permitted sources and record source ID, access basis, retrieval date, and query/selection logic.
2. Normalize entity identity without discarding aliases or legal-name uncertainty.
3. Deduplicate while preserving all provenance and relationship paths.
4. Tag every substantive item as `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, or `conflicting`. Record assertion type separately from evidence state.
5. Record fit rationale by explicit mandate fields. Do not use opaque affinity scores or private knowledge not authorized for this run. Require `method_assumption_approval` for non-user ranking weights, thresholds, or inferred fit methods.
6. Identify conflicts, portfolio overlap, restricted sectors, no-contact states, and data freshness before prioritization.

Apply source precedence: signed or official originals; audited or regulatory sources; authorized user working files; reproducible calculations; inference. Preserve all material conflicts even when one source has higher authority.

## Apply mode-specific controls

### Project sourcing

- Capture company, stage, sector, geography, financing/transaction signal, source, warm-introduction path, and preliminary mandate fit.
- Treat news, databases, intermediaries, experts, founders, LP/GP feedback, and private networks as different source classes.
- Do not turn the pipeline into `advance`, `hold`, or `decline` options; route selected candidates to `$screen-deal`.

### Capital-source sourcing

- Capture GP/fund strategy, active fund status as known, stage, sector, geography, ticket, ownership preference, portfolio conflicts, process expectations, and evidence date.
- Record key-person role, source-supported relevance, introduction path, relationship owner, permission, and freshness.
- A title, seniority, fund size, or organizational chart does not prove decision power, trust, willingness, or ability to sponsor the deal. Keep those attributes `unknown` unless supported by permissioned evidence.
- Do not expose private relationship judgments in a general investor-facing output.

## Enforce permission and no-contact

- `no-contact`, legal restriction, conflict restriction, or explicit opt-out overrides prioritization and warm-path availability.
- Unknown permission is not permission. Mark `permission_state: unknown` and require approval before outreach preparation.
- Never contact, invite, message, email, call, schedule, or update an external system from this Skill.
- Draft an outreach angle only when explicitly requested and only after the relationship owner confirms recipient, permission, disclosed facts, and side. Actual sending requires a separate `external_state_mutation_approval`.

## Produce the Chinese deliverable

Default to Simplified Chinese and include:

1. selected mode, mandate, scope, source/capability limits, and as-of date;
2. deduplicated candidate pipeline with provenance and fit rationale;
3. conflicts, permission/no-contact state, confidentiality, and freshness;
4. relationship/introduction route where authorized;
5. evidence gaps and proposed next research action;
6. owner-approved shortlist status, without an investment decision or external contact;
7. `source_register`, `calculation_lineage` (empty when no calculation is used), and `conflict_log`.

Keep schema keys in English and names in source language. Use `unknown` instead of invented fund, person, relationship, or influence data.

When comparing financing asks, tickets, fund sizes, or valuations, state currency and unit; record conversion method and FX date. Preserve original-language names and mark unofficial translations. Treat company claims such as “领先”, “唯一”, “国产替代”, or “卡脖子” as assertions unless independently supported.

## Apply human gates

- Require `external_release_approval` before sharing a pipeline or relationship route outside the approved team.
- Require `external_state_mutation_approval` before sending, scheduling, uploading, or changing CRM/pipeline state; this Skill does not perform those actions.
- Record all four gate events as `approved`, `pending`, or `not_required` in the artifact: `input_scope_approval`, `method_assumption_approval`, `external_release_approval`, and `external_state_mutation_approval`.

## Stop conditions

Stop when mode, side, permission, source rights, recipient identity, or confidentiality scope is ambiguous. Do not scrape authentication-protected sources without authority, collect excessive personal data, infer sensitive traits, expose private relationship notes, auto-send outreach, or make an IC decision.
