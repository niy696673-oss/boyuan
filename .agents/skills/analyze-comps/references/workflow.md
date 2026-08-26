# Comparable-analysis workflow

## Mode gate

Set exactly one `analysis_mode` before collecting peers. If several methods are requested,
run separate datasets and statistics. Never pool public, transaction, and private-round values.

## Sequence

1. Confirm target, purpose, valuation date, currency, accounting basis, and mode.
2. Define target business model, revenue drivers, stage, geography, scale, growth, margins,
   capital intensity, customer profile, and risk.
3. Build a broad candidate universe from current sources.
4. Create a peer decision log with primary/reference/excluded status.
5. Obtain approval for the peer set and material adjustments.
6. Normalize source periods, units, currencies, ownership, and metrics.
7. Calculate live metrics and statistics.
8. Investigate outliers and explain premiums/discounts.
9. Derive a bounded implied range without an investment decision.
10. Validate the manifest and deliver limitations.

## Stop conditions

Stop or return `insufficient_comparability` when fewer than three defensible observations
exist for a statistic, material values cannot be sourced, or instrument terms prevent
normalization. A small but honest reference set is preferable to fabricated precision.

## Handoffs

Pass mode, valuation date, peer decision log, normalized dataset, formulas, implied range,
and limitations to DCF/LBO or materials workflows. Do not pass a blended median.
