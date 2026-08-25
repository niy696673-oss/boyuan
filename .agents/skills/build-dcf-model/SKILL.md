---
name: build-dcf-model
description: Build or review an evidence-linked discounted cash flow model for a sufficiently mature company, including forecast cash flows, WACC, terminal value, scenarios, sensitivity analysis, enterprise-to-equity bridge, and tie-outs. Use for intrinsic valuation, financing analysis, or private-market decision support when cash flows are forecastable. Do not use for pre-revenue or highly binary businesses, bank-style balance sheets, LBO returns, or relative valuation.
---

# Build DCF Model

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Build an auditable DCF package only after the company and available evidence pass a suitability gate.

Default user-facing narrative and labels to Simplified Chinese unless the user requests another language. Keep schema keys, formulas, code, identifiers, and source quotations in English or their source language.

## Read references progressively

- Read [workflow.md](references/workflow.md) before running the model.
- Read [financial-methods.md](references/financial-methods.md) before calculating WACC, cash flows, terminal value, or sensitivities.
- Read [china-private-markets.md](references/china-private-markets.md) for a PRC company, CNY valuation, Chinese accounting records, or China-market inputs.
- Read [output-contract.md](references/output-contract.md) before creating the final artifact or fallback package.

## Enforce boundaries

- Consume an approved forecast from `build-three-statement-model` when one exists. Do not silently rewrite that workbook.
- Build a scoped DCF forecast only when a full integrated model is unnecessary and label the scope.
- Route relative valuation to `analyze-comps`.
- Route buyout leverage and sponsor returns to `build-lbo-model`.
- Do not present a DCF as suitable merely because the user requested one.
- Do not provide an investment, legal, tax, fairness, or accounting opinion.

## Apply the suitability gate

Classify the result as `suitable`, `conditionally_suitable`, or `not_suitable` before modeling.

Require all of the following for `suitable`:

1. A business model whose operating drivers and cash conversion can be forecast with defensible evidence.
2. Reliable historical financials or an approved operating forecast with periods, units, accounting basis, and entity scope.
3. A credible path to positive unlevered free cash flow within the explicit forecast period.
4. Sufficient capital-structure data to bridge enterprise value to common equity.
5. A valuation date and currency.

Use `conditionally_suitable` when the method is useful only as a scenario or cross-check. State the limiting assumptions and widen sensitivities.

Return `not_suitable` rather than forcing a valuation for cases such as:

- pre-revenue or highly binary milestone businesses;
- financial institutions whose economics require a different valuation framework;
- businesses with irreconcilable historical data or no credible forecast drivers;
- situations where terminal value would be nearly the entire result and cannot be bounded;
- missing ownership, debt, cash, dilution, or currency information that prevents an equity bridge.

For `not_suitable`, produce a concise Chinese suitability memo, list the missing evidence, and recommend a more appropriate method without fabricating a value.

## Probe capabilities

Check for spreadsheet creation and recalculation, web/current-market retrieval, document reading, and charting before use.

- If spreadsheet creation and recalculation are available, create or populate an auditable workbook and preserve any user template.
- If formulas can be written but not recalculated, deliver the workbook only with an explicit `recalculation_required` status and an independent calculation trace.
- If no spreadsheet capability exists, return a structured Chinese model specification, formula schedule, scenario table, source register, and machine-readable manifest. Do not claim an XLSX exists.
- If current market data is unavailable, request it or leave the field `unknown`; never substitute a static market rate without labeling an approved assumption.

## Preserve evidence

Classify every material input as one of:

`source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, or `conflicting`.

Record:

- entity, metric, period, unit, currency, accounting basis, source location, and as-of date;
- calculation lineage for derived values;
- unresolved conflicts without silently selecting a preferred number;
- whether an input is historical, management case, analyst case, or market input.

Never replace `unknown` with zero, an industry average, or a copied market convention.

## Build in controlled stages

1. Confirm entity, valuation date, currency, audience, purpose, forecast horizon, and ownership scope.
2. Normalize historicals and approved forecast data without changing source files.
3. Build revenue and operating-driver logic or consume the approved forecast.
4. Calculate EBIT, cash taxes, NOPAT, D&A, CapEx, and change in operating working capital.
5. Calculate unlevered free cash flow and reconcile it to the approved statements.
6. Research or derive WACC inputs with current sources and consistent currency.
7. Calculate terminal value using at least one defensible method and cross-check it.
8. Discount cash flows and bridge enterprise value to fully diluted common equity.
9. Run bear, base, and bull scenarios plus two-dimensional sensitivities.
10. Run tie-outs and plausibility checks before presenting any valuation range.

## Require method and assumption approval

Pause for `method_assumption_approval` before finalizing valuation when any of these are material:

- revenue, margin, tax, CapEx, or working-capital forecast drivers;
- beta, risk-free rate, equity risk premium, debt cost, or target capital structure;
- terminal growth, exit multiple, terminal margin, or terminal-year normalization;
- debt, cash, non-controlling interest, investments, options, preferred securities, or dilution adjustments.

Show the proposed assumption, evidence status, rationale, sensitivity, and owner. Do not treat silence as approval.

## Tie out and challenge the result

Require:

- historical and forecast units to be consistent;
- FCF to reconcile to the forecast statements;
- WACC weights and component calculations to sum correctly;
- discount factors to match timing convention;
- enterprise-to-equity bridge to reconcile to the capitalization table;
- fully diluted share count to reflect approved dilution treatment;
- sensitivity base cell to equal the base-case valuation;
- terminal value concentration and implied terminal multiples to be disclosed;
- extreme outcomes to be challenged rather than normalized to the current price.

Run `scripts/validate_dcf_manifest.py` when a model manifest is produced. Treat validation failures as blockers.

## Deliver

Lead with the conclusion and suitability status. Provide:

- Chinese valuation summary and range;
- key drivers and what must be true;
- scenario and sensitivity results;
- enterprise-to-equity bridge;
- evidence, assumption, conflict, and unknown registers;
- tie-out status and unresolved blockers;
- workbook link when a validated workbook was actually created, otherwise the fallback package defined in the output contract.

Require a finance owner to approve applicability and material assumptions before the result is used in financing, negotiation, board, or investment-committee materials.
