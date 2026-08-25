---
name: dealflow-router
description: Route China-focused FA/VC/PE dealflow requests between investor-side project sourcing, company/FA-side capital-source and GP key-person sourcing, one-minute or staged deal screening, re-screening, and GP-fit assessment. Use for broad or ambiguous origination, pipeline, investor-targeting, GP-matching, or screening requests that may require sourcing plus screening. Do not use for DD execution, BP/material creation, general meeting work, financial modeling, external outreach, CRM mutation, or formal initiation/IC decisions.
---

# Route Private-Market Dealflow

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Classify side and task before invoking an atom. Never merge project sourcing and capital-source sourcing in one run.

## Classify the route

Capture `side`, `owner`, `stage`, `sector`, `geography`, `round_or_transaction`, `financing_ask_or_ticket`, `mandate`, `audience`, `confidentiality`, `as_of_date`, relationship-data permission, and desired output.

Require every atomic output and handoff to preserve `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`, plus `source_register`, `calculation_lineage`, and `conflict_log`.

Choose the smallest sufficient route:

| Intent | Route |
|---|---|
| Investor/GP wants companies or projects | `$source-deals` in `project-sourcing` mode |
| Company/FA wants GPs, capital sources, or key-person routes | `$source-deals` in `capital-source-sourcing` mode |
| User supplies a company and requests first-pass assessment | `$screen-deal` in `one-minute` or `preliminary` mode |
| New evidence requires a revised screen | `$screen-deal` in `re-screen` mode |
| User supplies a company and identified GP/fund | `$screen-deal` in `gp-fit` mode |
| Broad origination-to-screening request | Run one recipe from [dealflow-recipes.md](references/dealflow-recipes.md) |

If an explicit atomic request has sufficient inputs, route directly. Do not source candidates merely because a screen contains unknowns.

## Enforce mutually exclusive sourcing modes

- `project-sourcing` ranks or organizes company opportunities against an investor mandate.
- `capital-source-sourcing` organizes GPs/funds and permissioned relationship routes against a company's financing case.
- If both sides are requested, create two separately versioned runs with separate permissions, schemas, and outputs.
- Never place companies and GPs in one score, one candidate ID space, or one contact list.

## Separate sourcing from screening

- `$source-deals` owns candidate identity, provenance, mandate dimensions, conflicts, permissions, no-contact state, and relationship route. It does not produce institutional decision options.
- `$screen-deal` owns evidence-aware fit, thesis/counter-thesis, kill criteria, risk carry-forward, uncertainty, and owner-only decision options. It does not discover contacts or send outreach.
- Pass only owner-selected candidates from sourcing to screening.
- Keep relationship/access evidence separate from investment-quality evidence.
- A GP-fit result does not establish interest, sponsorship, decision power, or willingness to invest.

Read [dealflow-handoffs.md](references/dealflow-handoffs.md) for payload boundaries.

## Enforce permission and human gates

1. Apply the most restrictive permission and `no-contact` state from source, candidate, relationship owner, organization, and deal.
2. Unknown permission is not permission.
3. Require `input_scope_approval` for private deal, relationship, meeting, CRM, or GP key-person data and `method_assumption_approval` for non-user ranking or scoring methods.
4. Require the partner/FA owner to prioritize outreach candidates and the relationship owner to approve recipient-specific preparation.
5. Require `external_release_approval` before sharing a pipeline, screen, or relationship route outside the approved team.
6. Do not contact, invite, email, message, call, schedule, update CRM, or mutate pipeline state. Any external action requires separate `external_state_mutation_approval` outside this Router.
7. Require the investment owner to make `advance`, `hold`, `request-evidence`, or `decline`; do not record the model's option as the institution's decision.

## Produce the routing response

Default to Simplified Chinese and include:

1. side, selected sourcing/screening mode, and why it applies;
2. ordered route, lead artifact owner, and typed handoffs;
3. mandate, evidence, permission, conflict, no-contact, and capability gaps;
4. human gates and stop conditions;
5. expected Chinese outputs and explicit exclusions.

Then execute the route when inputs and authority are sufficient. Use English schema keys and preserve source-language names.

## Refuse boundary violations

Do not infer key-person power from title, expose private relationship judgments, scrape restricted personal data, use confidential relationship data as public examples, auto-send outreach, promise financing, change external state, conduct DD, or issue an initiation/IC decision.
