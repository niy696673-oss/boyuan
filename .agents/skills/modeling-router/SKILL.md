---
name: modeling-router
description: Route FA, VC, and PE financial-modeling requests to a suitable three-statement, DCF, LBO, or single-mode comps workflow, with controlled handoffs and shared QA. Use when the requested model is ambiguous, needs suitability testing, or combines operating forecasts and valuation. Do not use for earnings monitoring, investment decisions, legal opinions, or generic spreadsheet work.
---

# Route Private-Market Modeling

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Select one lead artifact owner, test method suitability before work starts, and coordinate only the support work required for an auditable private-market modeling result.

Default all user-facing narrative and labels to Simplified Chinese unless the user requests another language. Preserve canonical keys, formulas, code, model IDs, citations, and source quotations in English or their source language.

## Read progressively

- Read [workflow.md](references/workflow.md) before classifying the request or choosing a lead.
- Read [output-contract.md](references/output-contract.md) before creating a handoff, validating an output, or delivering it.
- Read [china-private-markets.md](references/china-private-markets.md) when PRC entities, CNY, onshore/offshore structures, PRC GAAP, China tax, private rounds, or Chinese-market evidence affect the work.

## Establish the request contract

Confirm the economic decision, audience, entity and consolidation perimeter, transaction perimeter, valuation/as-of date, currency, unit scale, accounting basis, historicals, forecast status, requested artifact, and deadline. Probe spreadsheet creation and recalculation, document/table extraction, current-market retrieval, and charting before promising an artifact.

Classify the request as `operating_forecast`, `intrinsic_valuation`, `control_returns`, `relative_valuation`, `multi_method_valuation`, `model_review_or_repair`, or `insufficient_scope`.

Do not choose a method merely because a workbook filename or user label contains “model” or “valuation.” Do not route banks, insurers, funds, or other financial institutions to the ordinary three-statement or UFCF DCF workflow without an approved specialized methodology.

## Choose exactly one lead artifact owner

| Decision need | Lead atomic Skill | Suitability gate |
| --- | --- | --- |
| Integrated operating forecast, liquidity planning, or statement repair | `build-three-statement-model` | Entity, opening balances, accounting basis, driver sufficiency |
| Intrinsic enterprise/equity value | `build-dcf-model` | Forecastability, credible UFCF path, capital structure, terminal-value support |
| Sponsor returns for a control or debt-capable acquisition | `build-lbo-model` | Control economics, acquisition perimeter, debt service, financing terms, exit case |
| Relative valuation | `analyze-comps` | One explicit mode: public trading, precedent transactions, or private financing rounds |

For `multi_method_valuation`, make the deterministic `valuation_package` assembler the sole lead artifact owner. Keep every atomic result separate and reconcile ranges narratively; never average DCF and comps without an explained method.

For review or repair, route to the atomic Skill that owns the model. Do not create a separate audit workstream. If no route passes its suitability gate, return `not_suitable` with the missing evidence, a recommended route, and no implied value.

## Run the minimum justified sequence

- Approved forecast plus DCF: `build-dcf-model`.
- Unapproved or missing forecast plus DCF: `build-three-statement-model` → `forecast_handoff` → `build-dcf-model`.
- Approved operating case plus LBO: `build-lbo-model`.
- Missing operating case plus LBO: `build-three-statement-model` → `forecast_handoff` → `build-lbo-model`.
- Relative valuation: `analyze-comps` in one mode only.
- Multi-method valuation: applicable atomic outputs → validated `valuation_result_handoff` records → `valuation_package`.

Only the lead owns the primary human-facing artifact. Support Skills may return a typed handoff, validation result, or explicitly requested appendix; they do not rewrite the lead’s approved workbook or own its conclusion.

Reject a handoff for `scope_mismatch`, `stale_version`, `unit_mismatch`, `unapproved_assumption`, `failed_tie_out`, `missing_evidence`, or `capability_limitation`. Preserve the rejected payload and reason instead of repairing it with invented data.

## Preserve evidence, scope, and ownership

Use exactly these evidence states: `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`.

Record source register, as-of date, entity/perimeter, currency, units, accounting basis, calculation lineage, assumptions, and conflict log. Apply source precedence: signed or official originals, then audited/regulatory sources, then user-provided working files, calculated outputs, and inference. Preserve conflicts; never silently select one.

Never turn `unknown` into zero, an industry average, or an unlabeled estimate. Preserve supplied formulas, styles, named ranges, hidden sheets, and existing checks unless a replacement is approved.

Keep ownership clear:

- `build-three-statement-model` owns forecast statements and approved UFCF inputs.
- `build-dcf-model` owns intrinsic valuation and the enterprise-to-equity bridge.
- `build-lbo-model` owns transaction financing, debt schedules, and sponsor returns.
- `analyze-comps` owns its single selected relative-valuation mode and peer set.
- This router owns route selection, sequencing, handoff acceptance, and cross-method reconciliation only.

## Enforce the four human gates

Require all applicable events, with no silent approval:

- `input_scope_approval` for entity, perimeter, periods, units, source mapping, template policy, and comps mode.
- `method_assumption_approval` for material forecast, valuation, financing, peer, normalization, and exit assumptions.
- `external_release_approval` before sharing a model or valuation package outside the approved team.
- `external_state_mutation_approval` before writing to an external system or replacing an existing artifact.

Finance, deal, and investment owners retain method and decision accountability. Counsel, tax, accounting, and financing professionals retain their workstream conclusions. Do not issue an investment decision, fairness opinion, solvency opinion, financing commitment, or legal/accounting/tax conclusion.

## Apply the shared QA harness

Require the lead owner’s manifest validator when its artifact produces one. Verify scope, evidence states, source/as-of dates, currency, units, accounting basis, calculation lineage, and gate status. Then require method-appropriate tie-outs:

- Three-statement: balance sheet, cash flow, debt, equity, and schedule roll-forwards.
- DCF: UFCF, WACC, terminal value, and enterprise-to-equity bridge.
- LBO: sources and uses, debt, interest, cash sweep, taxes, dated sponsor cash flows, MOIC, IRR, and exit bridge.
- Comps: one mode, peer uniqueness, dated data, period/currency alignment, correct denominators, and `NM` treatment.

Challenge terminal-value concentration, leverage/refinancing dependence, unexplained plugs, extreme multiples, outlier deletion, and unsupported premiums or discounts. Classify QA as `passed`, `passed_with_limitations`, or `blocked`; never promote `recalculation_required` or `specification_only` to a validated workbook.

## Stop or fall back truthfully

Stop the affected method when applicability fails, source scope is irreconcilable, a material assumption lacks approval, or a required tie-out fails. If a capability is unavailable, return a structured Chinese specification, tables, formulas, evidence registers, and typed handoff schema. Do not claim an XLSX, recalculated model, current market input, or connected-system update exists unless it was successfully verified.

If ambiguity remains after reviewing available evidence, ask for the smallest consequential choice: operating forecast, intrinsic value, control returns, relative value, or multi-method package.

## Deliver

Return the validated lead artifact or deterministic package, followed by a concise Chinese suitability statement, route and support-handoff status, QA classification, gate status, unresolved blockers, evidence/conflict summary, and capability limitations.
