# LBO workflow

## Intake

Capture buyer/sponsor, target perimeter, control level, transaction form, purchase price,
valuation date, currencies, closing date, financing status, forecast owner, exit horizon,
and intended decision audience.

## Stage gates

1. Confirm control/buyout and debt-capacity suitability.
2. Reconcile capitalization, debt, cash, ownership, and transaction perimeter.
3. Propose sources and uses plus financing scenarios.
4. Obtain assumption approval before treating any financing term as a base case.
5. Build operating, debt, tax, cash sweep, ownership, and returns schedules.
6. Run downside liquidity and maturity analysis.
7. Tie out and validate the manifest.
8. Deliver conclusions without issuing an IC decision.

## Stop conditions

Stop and return a readiness memo if control economics, purchase price, cash generation,
transaction perimeter, sponsor equity, or financing structure cannot be bounded.

## User-template rule

Preserve a supplied workbook. Map sheets, periods, named ranges, inputs, formulas, and
checks before editing. Obtain approval before changing structure or calculation policy.

## Handoffs

- Consume the approved operating case from `build-three-statement-model` when available.
- Consume a separately labeled peer/transaction range from `analyze-comps` when relevant.
- Pass only source-backed transaction assumptions, debt schedule, sponsor cash flows,
  sensitivities, and validation status to downstream materials.
