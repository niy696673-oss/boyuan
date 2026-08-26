# DCF financial methods

## Unlevered free cash flow

```text
NOPAT = EBIT × (1 - cash_tax_rate)
UFCF = NOPAT + D&A - CapEx - ΔOperatingNWC
```

Define each component from the approved forecast. Keep restructuring, share-based
compensation, grants, one-time items, leases, and capitalized development costs explicit.

## WACC

```text
CostOfEquity = RiskFreeRate + Beta × EquityRiskPremium + approved_specific_premium
AfterTaxCostOfDebt = PreTaxCostOfDebt × (1 - marginal_cash_tax_rate)
WACC = EquityWeight × CostOfEquity + DebtWeight × AfterTaxCostOfDebt
```

Use market or approved target weights consistently. Do not give debt a negative weight
when net cash is positive. Match rates, beta, ERP, inflation, and cash flows by currency.

## Terminal value

Perpetuity growth:

```text
TV = UFCF_n × (1 + g) / (WACC - g)
```

Require `WACC > g`. Cross-check implied terminal EV/Revenue, EV/EBITDA, and FCF yield.

Exit multiple:

```text
TV = TerminalMetric × ApprovedExitMultiple
```

Explain the source and period of the multiple. Do not mix trading and transaction
multiples without labeling control and synergy effects.

## Timing and bridge

Use year-end or mid-year discounting consistently. Bridge enterprise value to common
equity with signed, non-overlapping adjustments:

```text
CommonEquityValue = EnterpriseValue
                  - DebtAndDebtLikeClaims
                  - NonControllingInterest
                  - PreferredAndOtherSeniorClaims
                  + CashAvailableToEquity
                  + NonOperatingInvestments
                  +/- OtherApprovedAdjustments
```

Use positive magnitudes plus an explicit `add` or `subtract` operation in the manifest.
If consolidated UFCF includes the operations attributable to NCI, subtract the value of
NCI; do not add it. Treat lease liabilities consistently with the EBIT/UFCF and enterprise-
value basis: subtract them only when the operating forecast and valuation convention do not
already capture the same lease claim. Apply the same no-double-counting rule to pension,
factoring, guarantees, and other debt-like items.

Resolve preferred securities and convertibles by their economic and contractual treatment,
not by label alone. Reconcile options, warrants, employee pools, anti-dilution, convertibles,
and other contingent shares to a dated fully diluted capitalization table. Use a treasury-
stock method only where it is appropriate and disclose assumed exercise proceeds; for
private securities with preferences or conversion choices, use an approved scenario or
waterfall rather than a public-company shortcut.

## Sensitivities

Center the matrix on the actual base assumptions. Recalculate the full valuation for
each cell. Include a scenario-driver sensitivity when WACC/terminal value alone hides
operating uncertainty.
