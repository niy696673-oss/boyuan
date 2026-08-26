# DCF output contract

## Primary artifact

Return a Simplified Chinese valuation package containing:

1. Suitability and readiness status.
2. Answer-first valuation range and valuation date.
3. Historical and forecast UFCF schedule.
4. WACC calculation and current sources.
5. Terminal-value calculation and cross-check.
6. Enterprise-to-equity bridge and diluted share count.
7. Bear/base/bull cases and two-dimensional sensitivities.
8. Key assumptions, evidence, conflicts, unknowns, and limitations.
9. Tie-out and validation status.

## Workbook status

Use exactly one:

- `validated_workbook`
- `recalculation_required`
- `specification_only`
- `not_suitable`

Never label a workbook validated when formulas were not recalculated and inspected.

## Manifest minimum

```json
{
  "artifact_type": "dcf_model",
  "status": "validated_workbook",
  "suitability": "suitable",
  "valuation_date": "2026-07-17",
  "currency": "CNY",
  "accounting_basis": "PRC_GAAP",
  "forecast_periods": ["FY2027"],
  "scenarios": ["bear", "base", "bull"],
  "terminal_methods": ["perpetuity_growth"],
  "enterprise_value": 0.0,
  "equity_bridge_items": [
    {
      "item_type": "debt",
      "operation": "subtract",
      "amount": 0.0,
      "evidence_state": "source-confirmed"
    }
  ],
  "common_equity_value": 0.0,
  "fully_diluted_share_count": 1.0,
  "evidence_register": [
    {"source_id": "forecast-1", "evidence_state": "source-confirmed"}
  ],
  "assumption_register": [],
  "conflict_log": [],
  "unknowns": [],
  "tie_outs": {
    "fcf_to_forecast": true,
    "wacc": true,
    "discount_timing": true,
    "equity_bridge": true,
    "diluted_share_count": true,
    "sensitivity_base": true
  },
  "human_approvals": [
    {"gate": "method_assumption_approval", "status": "approved"}
  ]
}
```

For a modeled DCF, express every bridge adjustment as a non-negative magnitude and an
explicit `add` or `subtract` operation. The bridge must arithmetically reconcile enterprise
value to common equity. Each evidence-register row must carry one canonical `evidence_state`.
An approval row uses `gate` plus `status`, where status is `not_required`, `pending`,
`approved`, or `rejected`.

Keep paths and links relative or user-accessible. Do not expose confidential source
material in the summary when the audience is not authorized.
