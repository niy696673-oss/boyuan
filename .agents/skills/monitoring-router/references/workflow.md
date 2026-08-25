# Monitoring router workflow

## Route by event state and artifact

Determine whether an earnings event is released or future/uncertain, then choose one lead and operating mode. Add another atomic Skill only through a typed handoff.

| Signal | Route |
| --- | --- |
| Released earnings, filing, call, guidance, variance, drivers, quality, or Q&A | `analyze-earnings` |
| Future earnings date, expected release, pre-event questions, or watch item | `monitor-catalysts` |
| Financing, customer, competitor, product, regulatory, litigation, supply-chain, capital-market, or exit event | `monitor-catalysts` |
| Relative public, precedent, or financing-round valuation question | `analyze-comps` |
| Broad scan that discovers released earnings | Keep catalyst lead; request earnings analysis only when depth is needed |

Use `one_time_scan` for a dated snapshot, `ledger_update` for new evidence against a prior ledger, `monitoring_spec` for a future design without verified recurrence, and `scheduled_monitor` only after the scheduler and sources are verified.

## Typed handoffs

Every handoff includes `handoff_type`, `producer`, `consumer`, `as_of`, `entity_id`, `source_manifest`, `evidence_status`, `human_approval_ids`, `unknowns`, and `conflicts`.

`catalyst_watch_handoff` adds proposed event ID, event type, evidence state, expected window, trigger, thesis pillar, probability, impact, confidence, owner, gate, sources, and next-check instruction. `earnings_analysis_request` adds issuer, ticker/exchange, reporting period, release timestamp, target relationship, questions, thesis pillars, horizon, and limitations. `comps_analysis_request` adds target, selected mode, valuation date, currency, peer criteria, and the signal question.

Reject a handoff as `scope_mismatch`, `stale_source`, `missing_release`, `missing_target_link`, `unapproved_interpretation`, `unsupported_scheduler`, `missing_persistence`, or `conflicting_evidence`; preserve it and its reason.
