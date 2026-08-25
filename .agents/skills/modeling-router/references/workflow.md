# Modeling router workflow

## Classify before building

Identify the economic decision first, then select one lead and apply its suitability gate. Add a support Skill only when the lead consumes its typed output.

| Signal | Route | Do not route when |
| --- | --- | --- |
| Revenue/cost drivers, working capital, liquidity, integrated statements | `build-three-statement-model` | A specialized financial-institution model is required |
| Forecastable UFCF, WACC, terminal value, equity bridge | `build-dcf-model` | Cash flows are binary, irreconcilable, or cannot be bounded |
| Purchase price, sources and uses, leverage, sponsor IRR/MOIC | `build-lbo-model` | The deal is an ordinary minority round without control economics |
| Peer selection and relative valuation multiples | `analyze-comps` | The primary question is intrinsic value or sponsor returns |

Resolve “valuation model” into intrinsic, relative, or control-return purpose. Treat “comparable companies and rounds” as distinct comps modes; run separate analyses or obtain a one-mode priority. Apply ordering: forecast support → approved assumptions → atomic calculations → validation → reconciliation → release.

## Typed handoffs

Every handoff includes `handoff_type`, `producer`, `consumer`, `as_of`, `entity_id`, `perimeter`, `currency`, `unit_scale`, `accounting_basis`, `source_manifest`, `evidence_status`, `human_approval_ids`, `unknowns`, and `conflicts`.

`forecast_handoff` additionally includes historical/forecast periods, scenario IDs, statement outputs, UFCF or cash-available-for-debt-service schedule, lineage, tie-outs, and approval status. `valuation_result_handoff` includes method, suitability, valuation date, enterprise/equity basis, capitalization bridge, range, scenarios, sensitivities, validation status, and limitations.
