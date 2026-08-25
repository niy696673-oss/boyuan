---
name: monitoring-router
description: Route FA, VC, and PE signal work between released-earnings analysis, source-backed catalyst monitoring, and single-mode comps read-throughs, then connect the evidence to a private-company thesis, financing process, valuation, portfolio action, or exit plan. Use for earnings read-throughs, event scans, watchlists, ledger updates, or monitoring specifications. Do not use for stock recommendations, private-company diligence, or unsupported continuous monitoring.
---

# Route Private-Market Monitoring

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Select one lead artifact owner for current-signal work and prevent static analysis from being represented as an active monitor.

Default all user-facing narrative and labels to Simplified Chinese unless the user requests another language. Preserve canonical keys, event IDs, formulas, query syntax, citations, and source quotations in English or their source language.

## Read progressively

- Read [workflow.md](references/workflow.md) before choosing the lead Skill and operating mode.
- Read [output-contract.md](references/output-contract.md) before creating a ledger, handoff, alert draft, or delivery.
- Read [china-private-markets.md](references/china-private-markets.md) for Chinese policy, exchange, fundraising, IPO, customer, procurement, regulatory, data-security, or cross-border signals.

## Establish the decision context

Confirm the target company, portfolio company, transaction, fund, public comp, customer, supplier, competitor, or sector universe; decision horizon; thesis pillars; financing stage; valuation or exit question; jurisdictions; as-of time; confidentiality; approved sources; owner; cadence; and action boundaries. Confirm whether the relevant earnings event has already been released and whether a prior event ledger, thesis record, model, or watchlist exists.

Probe current-source retrieval, filing/document/transcript access, private-source connectors, scheduler/automation, persistent storage, messaging, calendar, and CRM/thesis/model mutation capabilities before use.

## Choose exactly one lead artifact owner

| Primary request | Lead atomic Skill | Primary result |
| --- | --- | --- |
| Deep analysis of an already released earnings result, filing, call, or guidance update | `analyze-earnings` | Earnings signal note and private-market read-through |
| Future earnings date, pre-event question, broad event scan, or catalyst watchlist | `monitor-catalysts` | Dated event ledger or watchlist |
| Reconcile new evidence to a prior ledger | `monitor-catalysts` in `ledger_update` | Versioned ledger delta |
| Define future sources, queries, cadence, owners, or checks | `monitor-catalysts` in `monitoring_spec` | Monitoring specification, not an active service |
| Run recurrence with verified scheduler and sources | `monitor-catalysts` in `scheduled_monitor` | Verified active/failed status and ledger |
| Relative public/transaction/round valuation read-through | `analyze-comps` | One explicit relative-valuation mode and peer rationale |

Treat released results requiring variance, drivers, quality, Q&A, or a private-market bridge as `analyze-earnings`. Treat expected dates and pre-earnings watch items as `monitor-catalysts`. Route valuation only to `analyze-comps`; do not create a hidden valuation inside an earnings note or catalyst ledger.

If a broad scan finds a released earnings event, retain `monitor-catalysts` as lead and issue an `earnings_analysis_request` handoff. If results require relative valuation, issue an `comps_analysis_request` handoff. Do not perform those deep analyses inside the ledger.

## Run the minimum justified sequence

- Released-earnings deep dive: `analyze-earnings` → optional `catalyst_watch_handoff` → `monitor-catalysts` only when a watchlist or recurrence is also requested.
- Catalyst scan with a material released result: `monitor-catalysts` → `earnings_analysis_request` → `analyze-earnings` only when deeper analysis is in scope.
- Signal with a relative-value question: lead signal output → `comps_analysis_request` → `analyze-comps` in one explicit mode.
- Ledger update: prior ledger → `monitor-catalysts`; preserve event IDs, history, changed facts, and conflicts.
- Scheduled monitoring: approved monitoring specification → verified scheduler setup → test run → persisted status.

Only the lead owns the primary human-facing artifact. Support Skills return typed handoffs or explicitly requested appendices. Do not silently change models, thesis records, CRM, calendars, messages, or external artifacts.

## Preserve evidence and thesis discipline

Use exactly these evidence states: `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`.

Record source, publication date, event/release timestamp, last-checked time, period, units, currency, accounting basis, location, calculation lineage, and conflict log. Apply source precedence: signed or official originals, then audited/regulatory sources, then user-provided working files, calculated outputs, and inference. Preserve conflicts rather than silently selecting one.

Separate direct evidence from inference. Do not treat a public-company result, market-price reaction, historical cadence, or sector signal as proof of a private target’s outcome. Never fabricate consensus, transcript coverage, a confirmed date, or a target-company linkage.

Map only supported signals to revenue, price, volume, customer concentration, collections, unit economics, margins, cash conversion, runway, financing, competitor activity, regulation, valuation inputs, investor objections, diligence requests, portfolio milestones, and exit windows.

## Enforce the four human gates

Require all applicable events, with no silent approval:

- `input_scope_approval` for universe, thesis pillars, sources, confidential data, cadence, owners, and audience.
- `method_assumption_approval` for normalization, consensus use, inferred dates, scoring, probability, impact, and thesis interpretation.
- `external_release_approval` before sharing a report or alert outside the approved team.
- `external_state_mutation_approval` before scheduling, persisting a ledger, changing model/thesis/CRM data, messaging, or changing a calendar.

The analyst approves interpretation and target linkage; the owner approves materiality and external action. Emit proposed downstream updates with evidence, rationale, owner, approval state, and mutation status `not_executed` until an authorized action succeeds.

Do not provide a stock rating, trade, target price, position size, personal investment recommendation, or final investment-committee decision.

## Enforce monitoring truthfulness and capability fallbacks

Record each capability as `available`, `unavailable`, `unauthorized`, `failed`, or `not_checked`. An active monitor requires approved universe/sources/queries/cadence/owner/escalation, verified source access, an actual scheduler identifier and next-run time, a successful test, a persistent destination or stated stateless design, and disclosed failure/retry behavior.

If any condition is absent, return `monitoring_spec`, `unavailable`, or `failed` as appropriate. If current retrieval is unavailable, provide a source/query plan and mark events `unknown` or `needs_check`. If persistence is unavailable, return a user-accessible ledger and say that no durable ledger was updated. Do not say “I will keep monitoring” unless recurrence was created and verified.

## Validate before delivery

Require `$analyze-earnings` to run its local earnings-manifest validator and
`$monitor-catalysts` to run its local catalyst-ledger validator, then inspect their
returned validation status. Do not assume a sibling Skill's physical path. Treat
missing source dates, fabricated consensus, unlabeled inference, duplicate event
IDs, missing next-check dates, unsupported scheduler claims, or a claimed action
without a successful mutation as blockers.

For a comps handoff, require `analyze-comps` to retain exactly one mode, dated sources, peer rationale, currency/period alignment, and its own validation result. Do not merge public, precedent, and private-round statistics.

## Deliver

Return the lead artifact with a concise Chinese conclusion, as-of time, source coverage, direct/inferred separation, private-market implications, route and support-handoff status, human-gate status, unknowns/conflicts, next evidence checks, and capability limitations. For catalyst work, always report scheduler status: `active`, `not_configured`, `unavailable`, or `failed`.
