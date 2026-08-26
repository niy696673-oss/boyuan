# Catalyst-monitor output contract

## Primary artifact

Return a Simplified Chinese package with:

- operating mode and scheduler status;
- source coverage and last-checked times;
- prioritized event ledger;
- changed, conflicting, unknown, completed, and cancelled events;
- thesis/financing/valuation/exit linkage;
- owner, required action, human gate, and next-check date;
- monitoring specification when recurrence is not active.

## Ledger minimum

```json
{
  "artifact_type": "catalyst_ledger",
  "mode": "one_time_scan",
  "as_of": "2026-07-17T12:00:00+08:00",
  "scheduler_status": "not_configured",
  "scheduler": {},
  "source_coverage": [],
  "events": [
    {
      "event_id": "stable-id",
      "entity_id": "entity-id",
      "event_type": "financing",
      "event_subtype": "term_sheet",
      "expected_at": "2026-07-31T18:00:00+08:00",
      "actual_at": null,
      "time_zone": "Asia/Shanghai",
      "verification_status": "expected",
      "evidence_state": "source-confirmed",
      "probability": "medium",
      "impact": "high",
      "confidence": "medium",
      "urgency": "high",
      "direction": "mixed",
      "thesis_pillar": "financing",
      "thesis_delta": "mixed",
      "owner": "role-or-name",
      "human_gate": "external_state_mutation_approval",
      "next_check_at": "2026-07-24T09:00:00+08:00",
      "next_evidence": "signed term sheet",
      "deduplication_key": "entity:term-sheet:date-window",
      "related_event_ids": [],
      "primary_source": {
        "source_id": "source-1",
        "publication_date": "YYYY-MM-DD",
        "last_checked_at": "2026-07-17T12:00:00+08:00",
        "location": "document/page/url"
      },
      "source_refs": ["source-1"]
    }
  ],
  "human_approvals": [
    {"gate": "external_state_mutation_approval", "status": "pending"}
  ]
}
```

Scheduler status must be one of `active`, `not_configured`, `unavailable`, or `failed`.
When status is `active`, `scheduler` must identify the created automation, cadence, and last
verification time, and `human_approvals` must show an approved
`external_state_mutation_approval`. A static plan may not use `active`. Event probability and
confidence use `low`, `medium`, `high`, or `unknown`; only impact and urgency may also use
`critical`. Approval rows use `gate` plus `status`, where status is `not_required`, `pending`,
`approved`, or `rejected`.
