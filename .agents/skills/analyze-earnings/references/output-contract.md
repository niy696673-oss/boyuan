# Earnings-analysis output contract

## Primary artifact

Return a Simplified Chinese note with:

- company, period, event timestamp, accounting basis, currency, and source coverage;
- answer-first earnings conclusion;
- actual/consensus/prior/guidance table;
- operating and financial drivers;
- earnings-quality and disclosure observations;
- direct vs inferred private-market read-throughs;
- thesis, valuation, financing, and exit implications;
- open questions, owner, and next-check items;
- evidence, conflicts, unknowns, calculations, and approval status.

## Manifest minimum

```json
{
  "artifact_type": "earnings_analysis",
  "company": {"entity_id": "public-company-1"},
  "reporting_period": "FY2026Q2",
  "event_timestamp": "2026-07-17T08:00:00+08:00",
  "accounting_basis": "PRC_GAAP",
  "currency": "CNY",
  "source_coverage": {
    "status": "complete",
    "sources": [{"source_id": "release-1", "publication_date": "2026-07-17"}]
  },
  "variance_rows": [],
  "drivers": [],
  "quality_flags": [],
  "direct_read_throughs": [],
  "inferred_read_throughs": [],
  "thesis_implications": [],
  "follow_up_events": [],
  "evidence_register": [
    {"source_id": "release-1", "evidence_state": "source-confirmed"}
  ],
  "conflict_log": [],
  "unknowns": [],
  "human_approvals": [
    {"gate": "method_assumption_approval", "status": "approved"}
  ]
}
```

Set `source_coverage.status` to `complete`, `partial_sources`, `conflicting_sources`, or
`insufficient_sources`. Every evidence-register and read-through row must carry a canonical
`evidence_state`; direct read-throughs cannot be labeled as inference, while inferred
read-throughs must be `inferred` or `assumption` and include a rationale. Record a
`method_assumption_approval` row whenever inferred read-throughs or thesis implications are
present. Approval status may be `not_required`, `pending`, `approved`, or `rejected`.
