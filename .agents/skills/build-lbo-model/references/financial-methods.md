# LBO financial methods

## Sources and uses

Model purchase equity, refinanced obligations, cash retained/acquired, fees, taxes,
minimum cash, shareholder instruments, and adjustments. Require sources to equal uses.

## Debt schedule

For each tranche model:

- currency, priority, opening balance, draw, mandatory amortization, optional repayment;
- cash and PIK rates, base rate, spread, floors, fees, maturity, and prepayment rules;
- interest on the approved average/beginning/ending balance convention;
- revolver and cash sweep logic;
- covenant scenarios only when definitions are sourced.

## Cash available for debt service

Start from the approved operating model. Keep cash taxes, CapEx, working capital,
restructuring, leases, minimum cash, and restricted cash visible.

## Sponsor returns

```text
MOIC = TotalSponsorProceeds / TotalSponsorInvestedCapital
```

Use dated XIRR where actual dates exist. Include initial/follow-on contributions,
management/sponsor flows as applicable, dividends, recap proceeds, fees borne by the
sponsor, and exit proceeds.

## Exit bridge

Calculate exit enterprise value from the approved metric/method, then deduct debt and
other claims, add eligible cash/non-operating assets, allocate proceeds by ownership and
security rights, and reconcile to sponsor proceeds:

```text
ExitCommonEquityValue = ExitEnterpriseValue
                      - DebtAndDebtLikeClaims
                      - NonControllingInterest
                      - PreferredAndOtherSeniorClaims
                      + CashAvailableToEquity
                      + NonOperatingInvestments
                      +/- OtherApprovedAdjustments
```

If consolidated exit metrics include operations attributable to NCI, subtract NCI in the
bridge. Treat leases consistently with the operating metric and exit-multiple convention;
never subtract a lease claim already captured in the selected metric/multiple basis. Resolve
preferred, convertible, rollover, option, earn-out, and minority rights through an approved
waterfall. Sponsor exit proceeds are not automatically equal to total common equity value.
Reconcile ownership, follow-on capital, interim distributions, and security rights before
calculating returns.

## Sensitivities

Test entry value, leverage, rates, operating downside, cash conversion, exit year,
exit multiple, refinancing, and covenant headroom. Center base cells on the base model.
