---
name: analyze-comps
description: "Analyze comparable valuation using exactly one mode per run: public trading comparables, precedent transactions, or private financing-round comparables. Use to select and normalize peers, calculate valuation metrics, explain premiums and discounts, and derive an evidence-bounded valuation range for FA, VC, or PE work. Do not mix modes into one median, make a final investment decision, or use DCF/LBO methods."
---

# Analyze Comps

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Run one mutually exclusive comparable-analysis mode and make every inclusion, exclusion, normalization, and calculation auditable.

Default user-facing narrative and labels to Simplified Chinese unless another language is requested. Keep canonical field names, formulas, IDs, and source quotations in English or their source language.

## Read references progressively

- Read [workflow.md](references/workflow.md) before selecting the mode or peer set.
- Read [financial-methods.md](references/financial-methods.md) before calculating metrics, statistics, or implied value.
- Read [china-private-markets.md](references/china-private-markets.md) for PRC companies, A/H/offshore comparisons, CNY conversion, Chinese accounting data, or private-round evidence.
- Read [output-contract.md](references/output-contract.md) before delivery.

## Select exactly one mode

Set `analysis_mode` to one of:

1. `public_trading_comps` — compare current or historical public-market values and operating metrics.
2. `precedent_transactions` — compare announced or completed control transactions and transaction multiples.
3. `private_financing_rounds` — compare disclosed private financing rounds, stages, instruments, and post-money/pre-money values.

Do not combine the three modes into one mean, median, quartile, or implied-value range. If the user asks for several modes, run separate labeled analyses and reconcile them narratively only after each has its own method and statistics.

## Enforce boundaries

- Own peer selection, metric normalization, valuation calculations, and the relative-value conclusion.
- Do not issue an advance/hold/decline decision.
- Route intrinsic valuation to `build-dcf-model` and control returns to `build-lbo-model`.
- Do not treat full-industry membership, shared labels, or similar market capitalization as sufficient comparability.
- Do not present undisclosed private-round rumors as facts.

## Probe capabilities

Check web/current-market access, filing/document access, spreadsheet creation/recalculation, and currency data.

- If current data is unavailable, use an explicitly dated user-provided dataset or return the missing-data list.
- If no spreadsheet capability exists, produce a structured Chinese table, formula map, source register, peer decision log, and manifest. Do not claim an XLSX exists.
- If a commercial data provider is unavailable, do not imitate its consensus or transaction fields from memory.

## Preserve evidence

Use:

`source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`.

For every peer and metric, record entity, security/instrument, period, LTM/NTM/FY basis, unit, currency, accounting basis, source, source date, valuation date, and calculation lineage. Preserve management-adjusted and reported metrics separately.

## Build the peer set

1. Confirm target company, mode, valuation date, currency, stage, sector, business model, geography, scale, growth, margin profile, capital intensity, and purpose.
2. Build a broad candidate universe from current evidence.
3. Score candidates on business-model, revenue-driver, customer, geography, stage, growth, margin, scale, capital-intensity, and accounting comparability.
4. Document every inclusion and material exclusion.
5. Separate primary peers from reference peers.
6. Obtain `method_assumption_approval` for the final peer set and material normalizations.

Do not select peers only because an external provider puts them in the same industry bucket.

## Normalize by mode

For public trading comps:

- align valuation date, security price, diluted shares, debt, cash, non-controlling interest, investments, leases, and other bridge items;
- align LTM/NTM/FY periods and reported vs adjusted metrics;
- use market capitalization for equity multiples and enterprise value for enterprise multiples.

For precedent transactions:

- record announcement/close date, status, control level, consideration, enterprise/equity value, target financial period, strategic/sponsor buyer, auction context, and unusual terms;
- disclose control premium and synergies rather than treating them as ordinary trading value.

For private financing rounds:

- distinguish pre-money from post-money, primary from secondary, priced equity from convertible/preferred instruments, stage, date, amount raised, dilution, liquidation preference, and disclosed vs inferred value;
- do not compare headline round values without instrument and stage normalization.

## Calculate and challenge

Use only metrics suited to the sector and mode. Apply formula and denominator definitions consistently.

- P/E and P/S use equity value measures.
- EV/Revenue and EV/EBITDA use enterprise value.
- Negative or near-zero denominators are `NM`, not extreme multiples.
- Separate reported EBITDA, adjusted EBITDA, EBIT, gross profit, recurring revenue, and sector KPIs.
- Prefer median and quartiles for skewed samples; explain outliers rather than deleting them mechanically.
- Apply currency conversion using a dated rate and disclose the conversion.
- Explain what supports or challenges any premium or discount.

Run `scripts/validate_comps_manifest.py` when a manifest is produced. Treat mixed modes, missing dates, duplicate peers, or inconsistent currency as blockers.

If no defensible primary peer remains, set `analysis_status` to `insufficient_comparability`, leave the implied range empty, and explain the evidence needed to revisit the analysis.

## Deliver

Provide:

- selected mode and valuation date;
- Chinese peer table and valuation range;
- inclusion/exclusion rationale;
- metric definitions and normalization adjustments;
- statistics and outlier explanation;
- premium/discount analysis;
- evidence, assumption, conflict, and unknown registers;
- limitations and human-approved adjustments;
- spreadsheet link only when a validated spreadsheet exists, otherwise the structured fallback.

Require an investment professional to approve the peer set, chosen metrics, and material adjustments before external or committee use.
