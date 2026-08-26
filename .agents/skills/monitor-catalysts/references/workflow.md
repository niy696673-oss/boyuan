# Catalyst-monitor workflow

## Intake

Confirm projects/companies, purpose, jurisdictions, decision horizon, thesis pillars,
confidential sources, source permissions, owners, cadence, recipients, and action limits.

## Sequence

1. Select `one_time_scan`, `ledger_update`, `monitoring_spec`, or `scheduled_monitor`.
2. Probe retrieval, scheduler, messaging/calendar, and storage capabilities.
3. Load and preserve prior event IDs and history when a ledger exists.
4. Query authorized sources and record source coverage and last-checked time.
5. Normalize, deduplicate, verify, and preserve conflicting events.
6. Score probability, impact, confidence, urgency, and decision linkage separately.
7. Set owner, next evidence, next-check date, and required human gate.
8. Route released earnings events to `analyze-earnings`.
9. Validate the ledger.
10. Report scheduler state truthfully.

## Stop conditions

- If current retrieval is unavailable, return a monitoring specification, not current events.
- If no scheduler exists, do not promise future checks.
- If source permissions are unclear, exclude the source and request authorization.
- If a date is inferred, do not label it confirmed.

## Deduplication

Use stable event IDs and a key based on entity, event subtype, expected date window, and
underlying occurrence. Preserve separate records when sources conflict materially.
