# Catalyst scoring methods

Score dimensions separately; do not collapse them into an unsupported point estimate.

## Probability

- `high`: direct authoritative evidence and few unresolved conditions.
- `medium`: credible evidence but material conditions remain.
- `low`: early, conditional, or weakly supported.
- `unknown`: evidence is insufficient.

## Impact

Assess impact on a named decision variable: revenue, margin, cash, runway, financing,
valuation, control, dilution, diligence, regulation, exit timing, or thesis pillar.

Use `critical`, `high`, `medium`, `low`, or `unknown` only with a written rationale. Do not
define importance using fixed stock-price moves.

## Confidence

Base confidence on source authority, recency, directness, corroboration, and data quality.

## Urgency

Use decision deadline, time to obtain evidence, reversibility, and downside of delay.

## Thesis delta

Classify as `supports`, `challenges`, `mixed`, `no_change`, or `unknown`. Preserve the
underlying pillar and evidence. An event outcome does not itself authorize a decision.

## Changed events

When date, status, or expected outcome changes, append history rather than overwriting the
prior record. Record who/what changed it and the source timestamp.
