# Router Output Contract

## Route Plan

```yaml
route_id: "ROUTE-001"
domain: "fa_materials"
transaction_id: "user-provided-or-unknown"
side: "company | fa | gp | lp | mixed | unknown"
transaction_stage: "declared stage"
requested_artifact: "atomic or composite artifact"
audience: "reader role and segment"
confidentiality: "public | internal | restricted | strictly_restricted"
as_of_date: "YYYY-MM-DD"
lead_type: "atomic_skill | deterministic_assembler"
lead_owner: "skill or assembler name"
component_sequence: ["skill-or-assembler"]
capability_status: {}
human_gates: []
stop_conditions: []
unresolved: []
```

## Typed Handoff

Every component boundary must use:

```yaml
handoff_id: "HO-001"
from_component: "diagnose-bp"
to_component: "rewrite-bp"
transaction_id: "stable ID or unknown"
artifact_type: "bp_diagnostic"
artifact_version: "version identifier"
side: "company | fa | gp | lp | mixed"
transaction_stage: "declared stage"
audience: "reader role"
confidentiality: "access tier"
as_of_date: "YYYY-MM-DD"
source_register_ref: "source-register ID"
calculation_lineage_ref: "lineage ID or none"
conflict_log_ref: "conflict-log ID"
evidence_refs: ["SRC-001"]
requested_action: "bounded downstream action"
gate_status:
  input_scope_approval: "approved | pending | not_required"
  method_assumption_approval: "approved | pending | not_required"
  external_release_approval: "approved | pending | not_required"
restrictions: []
unresolved: []
```

Reject a handoff when artifact identity, version, scope, as-of date, evidence
register, conflict status, or required gate is absent. The receiver may not silently
broaden scope.

## Deterministic Assembly Record

```yaml
assembly_id: "ASM-001"
assembly_type: "qr | initiation | ic"
template_id: "human-approved-template"
template_version: "version"
input_manifest: []
slot_map: []
transformations: ["normalize", "order", "cross_reference", "tie_out"]
new_analysis_created: false
investment_judgment_created: false
missing_slots: []
conflicts_preserved: []
human_reviewers: []
status: "draft | blocked | human_approved"
```

## Router QA

- Verify one lead owner or deterministic assembler.
- Verify every component has a bounded output and receiver.
- Verify evidence states survive all handoffs.
- Verify missing inputs remain missing or unknown.
- Verify CIM content is not relabeled as QR, initiation, or IC analysis.
- Verify no external action or investment approval is implied.
