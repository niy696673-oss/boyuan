# Output Contract

## Required Envelope

| Field | Requirement |
|---|---|
| `artifact_type` | `pitch_deck` or `pitch_deck_spec` |
| `company_id` | Stable identifier or `unknown` |
| `transaction_stage` | Declared stage |
| `audience` | Investor segment and meeting context |
| `as_of_date` | Evidence cut date |
| `confidentiality` | Disclosure tier |
| `story_brief` | Reader decision, core thesis, approved positioning |
| `source_register` | Source authority, date, location, access class |
| `calculation_lineage` | Chart and derived-metric lineage |
| `conflict_log` | Unresolved figure or claim conflicts |
| `slide_inventory` | Ordered slide records |
| `appendix_plan` | Supporting detail and restricted disclosure |
| `qa_report` | Content, numeric, visual, and disclosure checks |
| `approval_status` | Human-gate status |

## Slide Record

```yaml
slide_id: "S01"
section: "company | problem | solution | proof | market | competition | business_model | commercialization | team | financials | financing | appendix"
purpose: "reader decision supported by this slide"
headline_zh: "answer-first Chinese headline"
key_points_zh: ["point one", "point two"]
visual_spec: "chart, process, evidence table, product image, or text layout"
source_ids: ["SRC-001"]
evidence_states: ["source-confirmed"]
calculation_ids: []
qualification_zh: "material caveat or blank"
speaker_note_zh: "what to explain verbally"
disclosure_tier: "internal | nda | named-recipient | public"
status: "ready | blocked | needs_human_review"
```

## Presentation Rules

- Use a claim-led headline; do not use decorative titles that hide the conclusion.
- Keep one primary communication objective per core slide.
- Label actual, forecast, management target, and scenario data distinctly.
- Cite source IDs in notes or a source appendix without exposing restricted source
  details to unauthorized recipients.
- Do not use unlabeled market-size funnels, arbitrary TAM percentages, fabricated
  peer logos, or non-reconciled financial charts.

## Native Artifact Rule

Set `artifact_type: pitch_deck` only after native generation, render review, text
overflow review, font review, chart review, and file-open validation. Otherwise
return `pitch_deck_spec` with explicit placement instructions.

## Final QA

- Tie repeated figures, dates, names, and terms across slides.
- Verify every visual supports the stated headline.
- Check slide order, legibility, contrast, whitespace, and appendix references.
- Confirm restricted information matches the approved disclosure tier.
- Confirm the deck does not present an investment recommendation as management or
  FA fact.
