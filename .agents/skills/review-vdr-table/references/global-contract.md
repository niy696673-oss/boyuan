# Global Artifact and Control Contract

Apply this contract to every substantive artifact. A field may be `not_required`,
but it must not disappear merely because the platform or current workflow does not
use it.

## Artifact envelope

Record:

- `artifact_type`, stable artifact/project/transaction identifiers, side, stage,
  audience, confidentiality, language, and `as_of_date`;
- entity and consolidation/transaction perimeter;
- currency, units, accounting basis, valuation date, and FX date when relevant;
- `source_register`, `calculation_lineage`, `assumption_register`, `conflict_log`,
  unknowns, version, and owner;
- capability status and any fallback used.

Use exactly these evidence states: `source-confirmed`, `user-provided`,
`calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`.

Apply source precedence: signed or official originals; audited or regulatory
sources; user-provided working files; reproducible calculations; inference.
Preserve unresolved conflicts and never turn `unknown` into zero, an industry
average, or an unlabeled estimate.

## Human gates

Record all four gate events using `not_required`, `pending`, `approved`, or
`rejected`:

- `input_scope_approval`
- `method_assumption_approval`
- `external_release_approval`
- `external_state_mutation_approval`

Content approval is not external-release approval. Release approval is not
permission to contact, schedule, upload, send, persist, overwrite, or update an
external system. Do not treat silence as approval.

## China private-market controls

Default narrative to Simplified Chinese while keeping schema keys, formulas, code,
citations, and source quotations in English or their source language. Record CNY
units and conversions, accounting basis, valuation date, FX date, and any
unofficial translation. Treat “领先”, “唯一”, “国产替代”, “卡脖子”, policy support,
certification, and similar management claims as assertions unless supported by
independent evidence.

## Capability fallback

Probe relevant web, OCR, transcription, spreadsheet recalculation, PPTX/DOCX,
VDR, CRM/memory, scheduler, and automation capabilities before claiming use. If a
capability is absent, return a structured Chinese draft, schema, CSV, specification,
route plan, or next-check instruction. Never claim that a file, monitor, review,
message, schedule, or external update exists when it does not.
