# LBO output contract

## Primary artifact

Return a Simplified Chinese package with:

- suitability and financing-readiness status;
- sources and uses;
- operating case and cash conversion;
- debt schedule by tranche;
- minimum cash, revolver, cash sweep, and maturity profile;
- sponsor contribution/distribution chronology;
- IRR, MOIC, holding period, and exit bridge;
- base/downside/upside and key sensitivities;
- evidence, assumptions, conflicts, unknowns, and human approvals;
- tie-out and validation status.

## Workbook status

Use `validated_workbook`, `recalculation_required`, `specification_only`, or
`not_suitable`.

## Manifest minimum

```json
{
  "artifact_type": "lbo_model",
  "status": "validated_workbook",
  "suitability": "suitable",
  "valuation_date": "2026-07-17",
  "closing_date": "2026-12-31",
  "currency": "CNY",
  "transaction_perimeter": {"target": "target-1"},
  "sources": [
    {"item_id": "source-1", "amount": 1000.0, "evidence_state": "assumption"}
  ],
  "uses": [
    {"item_id": "use-1", "amount": 1000.0, "evidence_state": "assumption"}
  ],
  "debt_tranches": [
    {"tranche_id": "debt-1", "currency": "CNY"}
  ],
  "scenarios": ["downside", "base", "upside"],
  "sponsor_cash_flows": [
    {"date": "2026-12-31", "amount": -400.0},
    {"date": "2031-12-31", "amount": 1050.0}
  ],
  "exit_enterprise_value": 1500.0,
  "exit_bridge_items": [
    {
      "item_type": "closing_debt",
      "operation": "subtract",
      "amount": 450.0,
      "evidence_state": "calculated"
    }
  ],
  "exit_common_equity_value": 1050.0,
  "evidence_register": [
    {"source_id": "operating-case-1", "evidence_state": "source-confirmed"}
  ],
  "assumption_register": [],
  "conflict_log": [],
  "unknowns": [],
  "tie_outs": {
    "sources_uses": true,
    "debt": true,
    "cash": true,
    "interest": true,
    "returns": true,
    "exit_bridge": true,
    "ownership_waterfall": true
  },
  "human_approvals": [
    {"gate": "method_assumption_approval", "status": "approved"}
  ]
}
```

Use non-negative magnitudes for sources, uses, and exit-bridge items. Each bridge item must
state `add` or `subtract`, and the bridge must reconcile arithmetically. Every modeled debt
tranche needs a stable ID and currency. Each evidence-register row must carry a canonical
`evidence_state`. Approval rows use `gate` and `status`; allowed statuses are `not_required`,
`pending`, `approved`, and `rejected`.
