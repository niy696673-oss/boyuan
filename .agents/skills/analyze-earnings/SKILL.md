---
name: analyze-earnings
description: Analyze a public company's earnings release, filing, call, or guidance update and translate the evidence into implications for a private target, portfolio company, customer, supplier, competitor, financing plan, valuation, or exit thesis. Use for post-earnings deep dives and private-market read-throughs. Do not use for pre-earnings monitoring, generic company summaries, automatic model changes, or stock ratings and trading advice.
---

# Analyze Earnings

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Produce an evidence-first earnings analysis and a separately reasoned private-market thesis bridge.

Default user-facing narrative to Simplified Chinese unless another language is requested. Keep canonical keys, formulas, source titles, quotations, and citations in English or their source language.

## Read references progressively

- Read [workflow.md](references/workflow.md) before gathering the earnings package.
- Read [financial-methods.md](references/financial-methods.md) before calculating variances, normalization, cash conversion, or valuation read-throughs.
- Read [china-private-markets.md](references/china-private-markets.md) for A/H/offshore Chinese issuers, PRC disclosure types, Chinese accounting metrics, policy signals, or China private-market implications.
- Read [output-contract.md](references/output-contract.md) before delivery.

## Enforce boundaries

- Own the deep analysis of an already released earnings event.
- Route event watchlists and recurring checks to `monitor-catalysts`.
- Do not create consensus by averaging historical growth or management guidance.
- Do not update a model, target price, CRM, thesis store, or position automatically.
- Do not provide a stock rating, trade, position-size, or personal investment recommendation.
- Treat the private-company read-through as an inference unless direct evidence supports it.

## Confirm scope

Identify:

- reporting company, ticker, exchange, period, reporting currency, and accounting basis;
- event type and release timestamp;
- private target or decision context, if any;
- relationship to the target: competitor, customer, supplier, channel, portfolio company, public comp, sector bellwether, or exit-market signal;
- audience, as-of time, and required depth.

If no target linkage is supplied, analyze the earnings event and state that the private-market bridge remains unassigned.

## Probe capabilities

Check web/current-source retrieval, filing/document access, PDF extraction, transcript access, spreadsheet support, and charting.

- Use current primary sources when available: earnings release, regulatory filing, investor presentation, official call/transcript, and prior guidance.
- If a full transcript is unavailable, do not claim to have analyzed Q&A or management tone.
- If consensus data is unavailable, leave it `unknown` and compare against prior guidance or a separately labeled internal estimate.
- If document extraction is incomplete, disclose pages/sections not reviewed.
- If spreadsheet/chart capability is absent, provide structured Chinese tables and chart specifications rather than pretending files exist.

## Preserve evidence

Use:

`source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`.

For every material figure, record entity, metric, period, unit, currency, GAAP/non-GAAP basis, source, publication date, page/section or timestamp, and calculation lineage. Separate:

- reported actuals;
- management-adjusted metrics;
- consensus estimates;
- prior internal estimates;
- management guidance;
- analyst inference.

Preserve contradictions between the release, filing, slides, transcript, and data provider.

## Analyze in controlled stages

1. Build a source register and confirm the latest complete earnings package.
2. Extract reported financials, sector KPIs, segments, guidance, cash flow, balance sheet changes, and one-time items.
3. Reconcile headline metrics across sources and normalize units and periods.
4. Compare actuals against dated consensus, prior internal estimates, prior-period actuals, and management guidance where each exists.
5. Explain revenue, price, volume, mix, margin, expense, cash conversion, working capital, CapEx, leverage, and KPI drivers.
6. Assess earnings quality, disclosure changes, estimate risk, and management statements.
7. Identify direct and indirect read-throughs to the private target.
8. Translate the event into thesis implications, valuation/financing/exit implications, open questions, and next evidence checks.
9. Propose follow-up catalysts for `monitor-catalysts` without scheduling or storing them automatically.

## Apply calculation discipline

- Calculate beat/miss only against a real, dated comparison value.
- Show both absolute and percentage variance where meaningful.
- Use gross profit divided by revenue for gross margin.
- Mark negative or near-zero denominator comparisons `NM` when percentage changes mislead.
- Separate parent-attributable, total, adjusted, and recurring profit measures.
- Reconcile operating cash flow and free cash flow definitions before discussing cash conversion.
- Do not infer quarterly values from cumulative disclosures without showing the calculation.
- Do not treat share-price reaction as proof of business quality or thesis validity.

## Require human gates

Require `method_assumption_approval` before:

- changing metric definitions or normalizations;
- using a non-primary consensus or internal estimate;
- assigning a material positive/negative thesis impact;
- changing valuation, financing, or exit assumptions in another model.

Require the analyst to approve target-company linkage and interpretation. Emit proposed model/thesis updates as handoffs only.

Run `scripts/validate_earnings_manifest.py` when a manifest is produced. Treat missing source dates, fake consensus, or unlabeled inference as blockers.

## Deliver

Provide:

- Chinese answer-first earnings summary;
- actual/consensus/prior/guidance variance table with missing fields visible;
- operating and financial driver analysis;
- earnings-quality and risk flags;
- direct evidence vs inferred read-throughs;
- private-company thesis, valuation, financing, and exit implications;
- open questions and follow-up watch items;
- evidence, conflict, unknown, and calculation registers;
- coverage limitations and analyst approval status.

Do not hide missing sources or convert the analysis into a stock recommendation.
