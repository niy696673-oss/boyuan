# DCF workflow

## Intake

Capture company, entity perimeter, purpose, audience, valuation date, currency,
accounting basis, historical periods, forecast horizon, capitalization date, and
approved source files. Record whether a three-statement forecast already exists.

## Stage gates

1. **Suitability** — issue `suitable`, `conditionally_suitable`, or `not_suitable`.
2. **Data readiness** — reconcile periods, units, entity scope, and key conflicts.
3. **Forecast ownership** — consume the approved forecast or define a scoped build.
4. **Method proposal** — show WACC, terminal method, equity bridge, and scenarios.
5. **Human approval** — obtain approval for material assumptions.
6. **Construction** — write formulas, source comments, checks, and sensitivities.
7. **Validation** — recalculate, tie out, inspect extremes, and run the manifest validator.
8. **Delivery** — lead with suitability, value range, drivers, limitations, and status.

## Stop conditions

Stop valuation and return a readiness memo when:

- source periods or units cannot be reconciled;
- forecast cash conversion has no defensible driver;
- capital structure cannot support an equity bridge;
- WACC currency differs from cash-flow currency;
- terminal assumptions are not bounded;
- a material assumption lacks an owner and approval.

## Source order

Prefer signed/official originals, audited or regulatory materials, approved company
records, current market sources, then calculations. Keep inference last. Preserve
conflicts and source dates.

## Handoffs

- Input from `build-three-statement-model`: approved forecast, UFCF components,
  evidence register, scenario IDs, and tie-out status.
- Optional cross-check from `analyze-comps`: separately labeled implied range.
- Output to other workflows: value range, equity bridge, sensitivities, assumptions,
  unknowns, and validation status. Never pass a single point value without context.
