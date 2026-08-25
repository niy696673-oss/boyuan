# Diligence recipes

Each recipe has one lead artifact owner. Stop at each required human gate.

## Scope-only

1. `$build-dd-checklist`
2. Stop for `input_scope_approval`.

Output: approved request universe. Do not imply VDR coverage or risk conclusions.

## VDR readiness and coverage

1. `$build-dd-checklist` if no approved request universe exists.
2. Stop for scope approval.
3. `$review-vdr-table` against a disclosed VDR snapshot.
4. Return coverage/gaps/conflicts plus a separate substantive-evidence candidate payload.

Output: VDR index and exception/coverage statement. Do not call gaps risks.

## Interview preparation

1. Use the approved request universe, thesis hypotheses, validated VDR exceptions, and known evidence gaps.
2. `$draft-dd-interview-questions` for the selected respondent type.
3. Stop for project/domain lead approval of sensitive questions.

Output: question tree only. A general meeting brief belongs to the meeting domain.

## Full rolling DD cycle

1. `$build-dd-checklist` creates version N request universe.
2. Human scope approval.
3. `$review-vdr-table` creates coverage/gap/conflict state for version N.
4. `$draft-dd-interview-questions` creates evidence-seeking trees from approved gaps and hypotheses.
5. Human-validated interview/minutes evidence joins documentary evidence.
6. `$extract-risk-flags` creates substantive flags and keeps gaps separate.
7. Investment owner and professional owners approve severity/conclusions.
8. Any new request becomes a proposal for checklist version N+1; do not mutate version N.

## IC-support handoff

The diligence router may emit validated VDR, interview-evidence, and risk-register payloads for a deterministic IC assembler. It must not write the IC recommendation, vote, or approval and must not turn `$extract-risk-flags` into an IC memo generator.
