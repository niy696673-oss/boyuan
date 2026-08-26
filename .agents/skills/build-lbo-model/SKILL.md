---
name: build-lbo-model
description: Build or review an evidence-linked leveraged buyout model for a control, take-private, acquisition, or debt-capable sponsor transaction, including sources and uses, operating case, debt schedule, cash sweep, returns, downside scenarios, and exit bridge. Use when sponsor IRR and MOIC depend on financing structure. Do not use for ordinary minority VC financing, DCF-only valuation, or generic debt capacity analysis.
---

# Build LBO Model

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Build an auditable LBO package only for a transaction that passes the control, financing, and data suitability gates.

Default user-facing narrative and labels to Simplified Chinese unless another language is requested. Keep formula syntax, schema keys, IDs, and source quotations in English or their source language.

## Read references progressively

- Read [workflow.md](references/workflow.md) before starting.
- Read [financial-methods.md](references/financial-methods.md) before building sources and uses, debt schedules, returns, or sensitivities.
- Read [china-private-markets.md](references/china-private-markets.md) for PRC targets, CNY financing, onshore/offshore debt, or China transaction constraints.
- Read [output-contract.md](references/output-contract.md) before delivery.

## Enforce boundaries

- Use this Skill for a control/buyout case or an explicitly debt-capable acquisition.
- Do not use it for a normal minority venture or growth-equity round without a genuine leveraged acquisition structure.
- Consume an approved operating forecast when available. Do not silently overwrite another model.
- Route standalone operating forecasts to `build-three-statement-model`.
- Route intrinsic valuation to `build-dcf-model` and relative valuation to `analyze-comps`.
- Treat financing terms and covenants as scenarios unless they come from current provided documents or verified sources.
- Do not provide legal, tax, financing-availability, solvency, or fairness opinions.

## Apply the suitability gate

Classify the case as `suitable`, `conditionally_suitable`, or `not_suitable`.

Require for `suitable`:

1. A transaction with control economics and a defined acquisition perimeter.
2. A credible purchase price or entry valuation framework.
3. Forecastable operating cash flow with sufficient evidence for debt service analysis.
4. A financing structure that can be modeled by tranche, currency, rate, maturity, amortization, and priority.
5. Defined sponsor equity, exit horizon, exit method, and ownership dilution treatment.

Use `conditionally_suitable` when financing is hypothetical. Label every debt term as a scenario and avoid implying lender availability.

Return `not_suitable` when control is absent, cash flows cannot support debt analysis, transaction perimeter is unknown, or required financing/capitalization data cannot be bounded. Deliver a Chinese suitability memo and missing-input list instead of forced IRR/MOIC.

## Probe capabilities

Check spreadsheet creation/recalculation, document reading, web/current-market retrieval, and charting.

- Preserve a user-provided workbook and its formulas, styles, and named ranges unless change is explicitly approved.
- Create an XLSX only when a validated spreadsheet capability exists.
- If recalculation is unavailable, mark `recalculation_required` and provide an independent calculation trace.
- If no spreadsheet capability exists, provide a Chinese workbook specification, formula schedule, debt table, returns bridge, sensitivities, and manifest. Do not claim to have created a workbook.

## Preserve evidence

Use the evidence states:

`source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`.

Record entity, perimeter, period, unit, currency, accounting basis, source, as-of date, and calculation lineage. Preserve conflicting transaction or financing terms. Never convert an unknown covenant, rate, tax, fee, or leverage limit into a market-standard hardcode.

## Build in controlled stages

1. Confirm buyer, seller, target perimeter, control level, transaction form, valuation date, currency, and closing assumptions.
2. Map or create sources and uses, including fees, refinancing, minimum cash, and transaction adjustments.
3. Consume or build the approved operating case and unlevered cash flow.
4. Build each debt tranche with opening balance, draws, cash interest, PIK, fees, amortization, maturity, and optional repayment.
5. Implement cash sweep, revolver logic, minimum cash, and circularity policy.
6. Calculate taxes and interest deductibility only from approved rules or clearly labeled scenarios.
7. Build exit enterprise value, debt payoff, non-operating adjustments, and common-equity proceeds.
8. Calculate all sponsor contributions and distributions, MOIC, IRR, and holding period.
9. Run downside, liquidity, covenant-headroom, entry/exit, leverage, rate, and operating sensitivities.
10. Tie out sources and uses, cash, debt, interest, returns, and ownership.

## Require human gates

Require `method_assumption_approval` for:

- entry price, control premium, debt quantum, tranche terms, base rates, spreads, fees, and amortization;
- minimum cash, cash sweep, tax, working-capital, CapEx, and operating drivers;
- management rollover, earn-out, seller financing, option/pool, preferred, and minority treatment;
- exit year, exit multiple, exit costs, and interim distributions.

Require the financing lead and counsel to validate actual covenants and legal constraints. The model may test covenant scenarios but must not invent binding terms.

## Tie out and challenge the result

Require:

- total sources to equal total uses;
- opening debt plus draws less repayments to equal closing debt by tranche;
- cash interest to follow the approved balance and timing convention;
- cash sweep and revolver logic to respect minimum cash;
- taxes and interest deductions to be traceable;
- sponsor cash-flow chronology to include all contributions and distributions;
- MOIC to equal total sponsor proceeds divided by total sponsor invested capital;
- IRR to use dated cash flows when dates are available;
- exit equity value to reconcile through the full enterprise-to-equity bridge;
- base sensitivity cells to equal base-case outputs;
- negative cash, maturity walls, refinancing dependence, and covenant pressure to be visible.

Run `scripts/validate_lbo_manifest.py` for a produced manifest. Treat failures as blockers.

## Deliver

Provide:

- Chinese suitability and investment-case summary;
- sources and uses;
- operating and debt schedules;
- sponsor cash-flow, IRR, MOIC, and exit bridge;
- downside and sensitivity analysis;
- evidence, assumption, conflict, and unknown registers;
- tie-out and validation status;
- workbook link only when a validated workbook exists, otherwise the structured fallback package.

Do not issue an investment decision. Require the deal lead to approve assumptions and the relevant professionals to validate financing and legal terms before IC or negotiation use.
