---
name: build-three-statement-model
description: Build or review an integrated income statement, balance sheet, and cash flow model with historical normalization, driver schedules, scenarios, circularity policy, and accounting tie-outs. Use for private-company forecasting, financing readiness, liquidity planning, or as the approved operating forecast feeding DCF or LBO analysis. Do not use for bank-style financial institutions, single-metric projections, or valuation-only requests.
---

# Build Three-Statement Model

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Build an auditable operating forecast and integrated statements without changing source accounting policy or inventing missing balances.

Default user-facing narrative and labels to Simplified Chinese unless another language is requested. Keep canonical schema keys, formulas, IDs, and citations in English or their source language.

## Read references progressively

- Read [workflow.md](references/workflow.md) before mapping data or a workbook.
- Read [financial-methods.md](references/financial-methods.md) before building schedules, circularity, or tie-outs.
- Read [china-private-markets.md](references/china-private-markets.md) for PRC GAAP, IFRS-to-PRC mappings, CNY units, Chinese tax, grants, VAT, or private-company records.
- Read [output-contract.md](references/output-contract.md) before delivery.

## Enforce boundaries

- Own the operating forecast and integrated statements.
- Allow `build-dcf-model` to consume approved UFCF; do not embed valuation unless explicitly requested as a separate handoff.
- Allow `build-lbo-model` to consume the operating case; do not silently add transaction debt or sponsor returns.
- Do not force a three-statement structure onto banks, insurers, funds, or other financial institutions without a specialized methodology.
- Do not provide an audit opinion or determine accounting policy.

## Apply the suitability and scope gate

Classify the task as `full_model`, `scoped_model`, `repair_review`, or `not_suitable`.

Require for a full model:

1. Entity and consolidation perimeter.
2. Historical income statement, balance sheet, and cash flow data with periods, units, currency, and accounting basis.
3. Opening balances for material schedules.
4. Forecast horizon and approved operating drivers.
5. Sufficient detail to reconcile cash, debt, equity, working capital, fixed assets, and taxes.

Use a scoped model for an early-stage company when monthly runway, hiring, revenue, burn, and financing schedules are more decision-useful than a full institutional statement model. State omitted schedules.

Return `not_suitable` when the entity basis is irreconcilable, opening balances are unavailable, or a specialized financial-institution framework is required.

## Probe capabilities

Check for spreadsheet creation and recalculation, document/table extraction, OCR, and charting.

- Preserve user-provided templates, formulas, styles, hidden sheets, named ranges, and existing checks unless change is approved.
- Write derived values as formulas when a spreadsheet is available. Keep historicals and approved assumptions as traceable inputs.
- If recalculation is unavailable, mark `recalculation_required` and provide independent tie-out calculations.
- If no spreadsheet capability exists, produce a Chinese workbook specification, statement tables, schedule definitions, formula map, checks, and manifest. Do not claim an XLSX exists.
- If OCR or table extraction is unreliable, request clean data or mark affected fields `unknown` rather than transcribing silently.

## Preserve evidence

Classify every input as:

`source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, or `conflicting`.

Record entity, statement, line item, period, unit, currency, accounting basis, source location, as-of date, and calculation lineage. Preserve reported, adjusted, management, and analyst views separately.

Never set an unknown balance to zero merely to make the balance sheet balance.

## Build in controlled stages

1. Confirm scope, audience, periods, frequency, entity perimeter, accounting basis, currency, units, and template policy.
2. Map source line items to a canonical chart without destroying source labels.
3. Normalize historicals and document reclassifications, adjustments, and unresolved differences.
4. Build revenue, cost, headcount, operating-expense, working-capital, fixed-asset, intangible, debt, interest, tax, equity, and other material schedules.
5. Build the income statement from drivers and supporting schedules.
6. Build the balance sheet from roll-forwards and approved assumptions.
7. Build the cash flow statement and reconcile ending cash to the balance sheet.
8. Implement a documented circularity policy for debt, interest, cash sweep, and taxes.
9. Add base, downside, and upside cases only through approved driver blocks.
10. Run statement, schedule, liquidity, and scenario checks.

## Require human gates

Require `input_scope_approval` after mapping the entity, periods, units, and historical line items.

Require `method_assumption_approval` for:

- revenue recognition and contract asset/liability treatment;
- capitalization, depreciation, amortization, impairment, grants, leases, tax, and minority-interest policy;
- forecast drivers, seasonality, working-capital days, CapEx, financing, dividends, and minimum cash;
- management adjustments and any non-GAAP presentation.

Accounting policy remains owned by the finance owner, auditor, or accountant. Record approval and do not infer it from prior-year presentation.

## Tie out and challenge the model

Require for every forecast period:

- assets equal liabilities plus equity;
- cash flow ending cash equals balance-sheet cash after documented restricted-cash treatment;
- retained earnings and other equity accounts roll forward;
- fixed assets and intangibles reconcile opening balance, additions, disposals, depreciation/amortization, impairment, and closing balance;
- debt reconciles opening, draws, repayments, non-cash changes, FX, and closing balance;
- interest follows the approved balance/timing convention;
- taxes reconcile current/deferred components when modeled;
- working-capital balances and cash-flow changes use consistent signs;
- scenario selector changes only approved assumption blocks;
- no formula error, unexplained plug, hidden balancing item, or stale external link remains.

Run `scripts/validate_three_statement_manifest.py` when a model manifest is produced. Treat failures as blockers.

## Deliver

Provide:

- Chinese model scope and accounting-basis summary;
- historical normalization and adjustment log;
- driver and schedule map;
- integrated statements and liquidity view;
- scenario outputs;
- evidence, assumption, conflict, and unknown registers;
- tie-out dashboard and unresolved blockers;
- workbook link only when a validated workbook was created, otherwise the fallback package.

Require the finance owner to approve accounting treatment and forecast drivers before downstream valuation or financing use.
