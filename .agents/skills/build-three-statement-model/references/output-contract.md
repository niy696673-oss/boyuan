# Three-statement output contract

## Primary artifact

Return a Simplified Chinese model package containing:

- scope, entity perimeter, accounting basis, currency, units, and periods;
- historical mapping and adjustment log;
- driver and supporting-schedule inventory;
- integrated income statement, balance sheet, and cash flow statement;
- base/downside/upside cases where approved;
- liquidity, debt, and cash view;
- evidence, assumptions, conflicts, unknowns, and approvals;
- checks, formula errors, stale links, and unresolved blockers.

## Status

Use `validated_workbook`, `recalculation_required`, `specification_only`,
`repair_review`, or `not_suitable`.

## Manifest minimum

```json
{
  "artifact_type": "three_statement_model",
  "status": "validated_workbook",
  "scope": "full_model",
  "entity_perimeter": {"entity": "target-1"},
  "accounting_basis": "PRC_GAAP",
  "currency": "CNY",
  "unit_scale": "CNY_10000",
  "historical_periods": ["FY2025"],
  "forecast_periods": ["FY2026"],
  "schedules": ["revenue", "working_capital", "fixed_assets", "debt"],
  "evidence_register": [
    {"source_id": "historicals-1", "evidence_state": "source-confirmed"}
  ],
  "adjustment_log": [],
  "assumption_register": [],
  "conflict_log": [],
  "unknowns": [],
  "tie_outs": {
    "balance_sheet": true,
    "cash_flow": true,
    "ending_cash": true,
    "retained_earnings": true,
    "fixed_assets": true,
    "debt": true
  },
  "human_approvals": [
    {"gate": "input_scope_approval", "status": "approved"},
    {"gate": "method_assumption_approval", "status": "approved"}
  ]
}
```

Each evidence-register row must carry a canonical `evidence_state`. Approval rows use
`gate` and `status`; allowed statuses are `not_required`, `pending`, `approved`, and
`rejected`. A `repair_review` may omit forecast periods when the task is limited to reviewing
an existing workbook rather than producing a modeled forecast.
