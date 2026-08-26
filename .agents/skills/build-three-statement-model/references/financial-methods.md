# Three-statement financial methods

## Schedule ownership

Build revenue, cost, headcount, working capital, fixed assets, intangibles, leases,
debt, interest, tax, equity, and other material schedules before statement totals.

## Core roll-forwards

```text
ClosingNetPPE = OpeningNetPPE + CapitalizedAdditions + AcquiredPPE + TransfersIn
              - NetBookValueOfDisposals - Depreciation - Impairment
              +/- FXAndOtherApprovedChanges
ClosingDebt = OpeningDebt + Draws - Repayments + NonCashChanges + FX
ClosingRetainedEarnings = OpeningRetainedEarnings + AttributableProfit - Distributions + OtherApprovedChanges
ClosingLeaseLiability = OpeningLeaseLiability + NewLeases + Remeasurements + Interest
                      - LeasePayments +/- FXAndOtherApprovedChanges
ClosingNCI = OpeningNCI + ProfitAttributableToNCI + NCIContributions
           - NCIDistributions +/- OwnershipAndOtherApprovedChanges
```

Use net book value—not disposal cash proceeds—in the PPE roll-forward. Adapt signs to the
approved template and record them in a sign-convention table. Keep lease expense, right-of-
use assets, lease liabilities, interest, principal, and cash-flow classification consistent
with the approved accounting basis. Keep parent equity, NCI, ordinary shares, preferred
securities, convertibles, options, and employee pools in separate schedules. If downstream
per-share analysis is required, reconcile a dated fully diluted share-count schedule without
converting contractual preferences into ordinary shares by default.

## Working capital

Use operational drivers such as DSO, inventory days, DPO, contract balances, deferred
revenue, prepayments, accruals, and taxes only where meaningful. Reconcile balance-sheet
changes to cash-flow effects using a documented sign convention.

## Cash flow

Support the required direct or indirect presentation while maintaining a reconciliation
from profit to operating cash flow. Keep restricted cash and non-cash transactions explicit.

## Circularity

Choose and document one policy:

- iterative workbook calculation;
- copy/paste convergence with an audit trail;
- controlled switch that disables circularity for construction;
- algebraic solution when defensible.

Never leave a hidden circularity or hardcoded plug.

## Checks

Use zero-tolerance identity checks subject only to explicit rounding tolerance. Separate
accounting identities from approximate analytical checks.
