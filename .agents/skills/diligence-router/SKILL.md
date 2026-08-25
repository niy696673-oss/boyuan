---
name: diligence-router
description: Route China-focused private-market diligence requests across checklist scoping, VDR coverage review, role-specific DD interview questions, and substantive risk extraction while preserving professional ownership and a one-way evidence chain. Use for broad or ambiguous FA/VC/PE diligence requests, data-room review programs, multi-workstream DD plans, or requests that require more than one diligence atomic Skill. Do not use for standalone deal sourcing/screening, BP or transaction-material production, meeting briefs/minutes, financial modeling, legal/accounting advice, or an IC decision.
---

# Route Private-Market Diligence

Read [the global artifact and control contract](references/global-contract.md) before producing or releasing any substantive output.

Route the request; do not reproduce the atomic Skills' professional work.

## Classify the request

Capture `side`, `stage`, `deal_type`, `sector`, `jurisdiction`, `audience`, `confidentiality`, `as_of_date`, available evidence, requested artifact, professional owners, capabilities, and approvals.

Require every atomic output and handoff to preserve `source-confirmed`, `user-provided`, `calculated`, `inferred`, `assumption`, `unknown`, and `conflicting`, plus `source_register`, `calculation_lineage`, and `conflict_log`.

Choose the smallest sufficient route:

| User intent | Lead Skill | Support rule |
|---|---|---|
| Define DD scope or request materials | `$build-dd-checklist` | Lead owns request universe |
| Map existing VDR files to requests; find gaps/versions/conflicts | `$review-vdr-table` | Require approved request universe or explicit population |
| Draft management/customer/supplier/expert questions | `$draft-dd-interview-questions` | Lead owns question tree only |
| Extract evidence-backed red flags | `$extract-risk-flags` | Require substantive source evidence; keep gaps separate |
| Broad DD program or rolling diligence | Run a recipe below | Preserve one-way typed handoffs |

If the user explicitly invokes one atom and supplies sufficient inputs, route directly without adding unnecessary Skills.

## Preserve the one-way chain

Enforce:

`Checklist request universe -> VDR coverage/gaps/conflicts -> substantive risk flags`

- Do not let risk extraction silently mutate the checklist or VDR index.
- If a risk finding requires a new request, create a `request_change_proposal`. A human-approved new checklist version starts the next cycle.
- Do not pass `not-present`, `unreadable`, or `unknown` as substantive risk evidence.
- Pass interview answers to risk extraction only after meeting/interview records are human-validated and source-attributed.
- Carry approved severity floors forward unchanged unless the authorized reviewer approves a reasoned, evidenced downgrade.

Read [diligence-recipes.md](references/diligence-recipes.md) for ordered recipes and [diligence-handoffs.md](references/diligence-handoffs.md) for typed payloads.

## Apply capability and ownership gates

1. Probe VDR, OCR, spreadsheet, rendering, and source-retrieval capabilities before promising an action or artifact.
2. Return a Simplified-Chinese draft table/CSV schema and explicit next step when a capability is unavailable.
3. Keep business DD, technical DD, FDD, LDD, tax, data/security, export-control, EHS, and other specialist workstreams attributed.
4. Require `input_scope_approval` before finalizing scope and `method_assumption_approval` before applying firm-specific materiality or scoring rules.
5. Require the relevant professional for legal, accounting, tax, technical-certification, national-security, or regulatory conclusions.
6. Require `external_release_approval` before sharing request lists, interview guides, VDR exceptions, or risk registers outside the approved team.
7. Require `external_state_mutation_approval` before uploading, sending, changing VDR/workflow state, or writing to CRM or institutional memory; this Router does not perform those actions by default.

## Produce the routing response

Default to Simplified Chinese and include:

1. classified intent, stage, side, and selected lead Skill;
2. ordered recipe and typed handoffs;
3. inputs available, evidence/capability gaps, and stop conditions;
4. artifact owner, workstream owners, human gates, and confidentiality;
5. expected deliverables and limitations.

Then execute the route when inputs and authority are sufficient. Do not claim that an inaccessible VDR was reviewed or that professional diligence was completed.

## Refuse boundary violations

Do not auto-finalize an IC or initiation conclusion, give legal/accounting advice, bypass file permissions, execute active VDR content, infer risk from absence alone, lower severity silently, contact third parties, or mutate external systems.
