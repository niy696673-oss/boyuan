---
name: monitor-catalysts
description: Build, update, or triage a source-backed catalyst watchlist for FA, VC, and PE work across financing, customer, competitor, product, regulatory, litigation, supply-chain, capital-market, and exit events. Use for one-time event scans, monitoring plans, alert triage, or thesis milestone updates. Run continuous monitoring only when a scheduler and required data sources are available. Route released earnings events to analyze-earnings.
---

# Monitor Catalysts

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Create an auditable event ledger and monitoring plan. Never pretend that a recurring monitor exists when the runtime cannot schedule or retrieve future data.

Default user-facing narrative to Simplified Chinese unless another language is requested. Keep canonical field names, event IDs, query syntax, citations, and quotations in English or their source language.

## Read references progressively

- Read [workflow.md](references/workflow.md) before defining the universe or scanning events.
- Read [financial-methods.md](references/financial-methods.md) before assigning probability, impact, thesis delta, or valuation/financing implications.
- Read [china-private-markets.md](references/china-private-markets.md) for Chinese policy, disclosure, exchange, fundraising, IPO, customer, procurement, or regulatory events.
- Read [output-contract.md](references/output-contract.md) before delivery or scheduler setup.

## Enforce boundaries

- Own event discovery, deduplication, verification status, prioritization, watch items, and next-check instructions.
- Route a released earnings package requiring deep analysis to `analyze-earnings`.
- Do not perform the full earnings analysis inside this Skill.
- Do not update a model, thesis store, CRM, calendar, send messages, or take an external action without explicit authority and a supported capability.
- Do not equate a catalyst with a guaranteed positive or negative outcome.

## Select the operating mode

Use one of:

1. `one_time_scan` — inspect current sources and produce a dated watchlist.
2. `ledger_update` — reconcile new evidence against a supplied prior ledger.
3. `monitoring_spec` — define sources, queries, cadence, ownership, escalation, and next-check dates without claiming execution.
4. `scheduled_monitor` — create or run recurring checks only when the user requests it and an actual scheduler plus data capability is available.

If no scheduler exists, return `monitoring_spec`. State plainly that monitoring is not active.

## Probe capabilities

Check current web/news/filing retrieval, connected private sources, scheduler/automation, messaging/calendar, and persistent storage.

- Record which sources were actually queried and which were unavailable.
- Do not infer future monitoring from a static prompt.
- Do not claim an alert was sent, calendar entry created, or ledger persisted unless the corresponding action succeeded.
- If current retrieval is unavailable, produce a query plan and source checklist with `verification_status: unknown` and an explicit `needs_check` next action; do not invent an unsupported status value.

## Preserve evidence

Use:

`source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`.

Each event must include:

- `event_id`, company/project, event type and subtype;
- expected/actual date and time zone;
- verification status: `confirmed`, `expected`, `inferred`, `unknown`, `changed`, `completed`, or `cancelled`;
- primary source, publication date, last-checked time, source location, and evidence state;
- probability, impact, direction, confidence, affected thesis pillar, owner, action gate, and next-check date;
- related events and deduplication key.

Do not mark a date `confirmed` based only on historical cadence, news aggregation, or model memory.

## Cover the private-market event universe

Consider only relevant categories:

- financing milestones, investor meetings, term sheets, exclusivity, approvals, closing, runway, and refinancing;
- customer wins/losses, renewals, procurement, tenders, channel inventory, collections, and concentration;
- competitor financing, pricing, products, capacity, hiring, M&A, litigation, and distress;
- product releases, certifications, clinical/regulatory milestones, production ramp, quality, and supply-chain events;
- law, policy, licensing, export control, data/security, antitrust, tax, subsidy, and industry rules;
- public-comps earnings, valuation, issuance, IPO, lock-up, and exit-window signals;
- fund-life, LP, portfolio, governance, founder, key-person, and management events.

Do not use a fixed stock-price-move threshold to define importance.

## Run the workflow

1. Confirm universe, purpose, decision horizon, jurisdictions, thesis pillars, confidentiality, owners, and action boundaries.
2. Load the prior ledger when supplied and preserve its IDs and history.
3. Query current authorized sources and record coverage.
4. Normalize events into the output contract.
5. Deduplicate by entity, event, date window, and source relationship without discarding conflicting reports.
6. Verify dates and distinguish scheduled, expected, inferred, and unknown events.
7. Score probability, impact, confidence, and urgency separately.
8. Map each event to a thesis pillar, financing step, valuation input, diligence request, exit window, or operating decision.
9. Define next evidence, next-check date, owner, and human gate.
10. Archive completed/cancelled events while preserving outcome and thesis delta.

## Apply human gates

Require owner approval for materiality, thesis impact, escalation, and any external action.

- `input_scope_approval`: universe, confidential sources, cadence, and owners.
- `method_assumption_approval`: scoring, inferred dates, probability, and impact.
- `external_release_approval`: any alert or report shared outside the approved team.
- `external_state_mutation_approval`: scheduler, calendar, CRM, messaging, or persistent-ledger changes.

An event may recommend an action but may not execute it by default.

Run `scripts/validate_catalyst_ledger.py` on a produced ledger. Treat missing source status, next-check date, or duplicate IDs as blockers.

## Deliver

Provide:

- Chinese catalyst summary and top priorities;
- event ledger with verification and evidence status;
- thesis/financing/valuation/exit implications;
- required action, owner, human gate, and next-check date;
- source coverage and unavailable-source statement;
- changed, completed, cancelled, conflicting, and unknown events;
- scheduler status: `active`, `not_configured`, `unavailable`, or `failed`;
- monitoring specification when continuous monitoring is not active.

Never say “I will keep monitoring” unless a supported scheduled monitor has actually been created and verified.
