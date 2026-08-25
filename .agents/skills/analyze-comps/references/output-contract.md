# Comparable-analysis output contract

## Primary artifact

Return a Simplified Chinese package with:

- `analysis_mode`, target, valuation date, currency, and purpose;
- primary/reference peer table;
- excluded peer log;
- source, period, unit, currency, and metric-basis fields;
- calculated metrics and statistics;
- outlier and premium/discount explanations;
- implied valuation range and bridge;
- evidence, assumptions, conflicts, unknowns, and approvals;
- limitations and comparability status.

## Manifest minimum

```json
{
  "artifact_type": "comps_analysis",
  "analysis_status": "complete",
  "analysis_mode": "public_trading_comps",
  "valuation_date": "2026-07-17",
  "currency": "CNY",
  "target": {"entity_id": "target-1"},
  "primary_peers": [
    {"peer_id": "peer-1", "analysis_mode": "public_trading_comps", "source_date": "2026-07-17", "currency": "CNY", "evidence_state": "source-confirmed"},
    {"peer_id": "peer-2", "analysis_mode": "public_trading_comps", "source_date": "2026-07-17", "currency": "CNY", "evidence_state": "source-confirmed"},
    {"peer_id": "peer-3", "analysis_mode": "public_trading_comps", "source_date": "2026-07-17", "currency": "CNY", "evidence_state": "source-confirmed"}
  ],
  "reference_peers": [],
  "excluded_peers": [],
  "metric_definitions": {"EV/Revenue": "EnterpriseValue / Revenue"},
  "statistics": {"EV/Revenue": {"median": 0.0}},
  "implied_range": {"low": 0.0, "high": 0.0},
  "evidence_register": [
    {"source_id": "market-data-1", "evidence_state": "source-confirmed"}
  ],
  "assumption_register": [],
  "conflict_log": [],
  "unknowns": [],
  "human_approvals": [
    {"gate": "method_assumption_approval", "status": "approved"}
  ]
}
```

Every included peer must state the same `analysis_mode` as the manifest, a stable ID or
name, currency, source/event date, and canonical `evidence_state`. A complete analysis needs
at least three defensible primary observations, non-empty metric definitions/statistics, a
non-empty implied range, an evidence register, and a recorded peer-set approval. Approval
rows use `gate` plus `status`, where status is `not_required`, `pending`, `approved`, or
`rejected`.

Use `analysis_status: "insufficient_comparability"` when a defensible peer set or
range cannot be produced. In that state, `primary_peers` and `implied_range` may be
empty; return the candidate/exclusion evidence and missing-data requirements instead
of forcing a range.
