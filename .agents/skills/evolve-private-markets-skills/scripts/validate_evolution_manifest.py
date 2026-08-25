#!/usr/bin/env python3
"""Validate the governance gates of an evolution manifest."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


GATE_STATES = {"not_required", "pending", "approved", "rejected"}
EVIDENCE_STATES = {
    "source-confirmed",
    "user-provided",
    "calculated",
    "inferred",
    "assumption",
    "unknown",
    "conflicting",
}
SOURCE_TYPES = {
    "visible_conversation",
    "user_supplied_file",
    "authorized_memory_export",
    "run_trace",
    "user_feedback",
    "evaluation_artifact",
    "approved_external_source",
    "analyst_inference",
}
REQUIRED_GATES = {
    "target_scope_approval",
    "context_scope_approval",
    "change_proposal_approval",
    "apply_change_approval",
    "release_approval",
    "external_state_mutation_approval",
}
REQUIRED_INVARIANTS = {
    "chinese_first_deliverables",
    "evidence_and_conflict_controls",
    "human_decision_ownership",
    "no_silent_external_mutation",
    "no_fabricated_context_or_actions",
    "explicit_atomic_invocation",
    "felix_license_trace",
    "third_party_authorization",
}
REQUIRED_TEST_CLASSES = {
    "positive",
    "negative_trigger",
    "out_of_scope",
    "missing_context",
    "abstention",
    "control_regression",
    "structure",
    "portability",
}


def load_manifest(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("manifest root must be an object")
    return data


def validate(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    required = {
        "manifest_version",
        "operation_id",
        "created_at",
        "owner",
        "target_skill",
        "baseline_version",
        "candidate_version",
        "requested_outcome",
        "target_snapshot",
        "context_register",
        "problem_register",
        "proposed_changes",
        "applied_changes",
        "protected_invariants",
        "tests",
        "gates",
        "rollback",
        "release_status",
        "unresolved_unknowns",
    }
    for key in sorted(required - data.keys()):
        errors.append(f"missing required field: {key}")

    snapshot = data.get("target_snapshot", {})
    if not isinstance(snapshot, dict) or snapshot.get("complete_read") is not True:
        errors.append("target_snapshot.complete_read must be true")
    if not isinstance(snapshot, dict) or not snapshot.get("snapshot_id"):
        errors.append("target_snapshot.snapshot_id is required")
    if not isinstance(snapshot, dict) or not snapshot.get("files"):
        errors.append("target_snapshot.files must contain the read inventory")
    if not isinstance(snapshot, dict) or snapshot.get("editable") is not True:
        errors.append("target_snapshot.editable must be true")
    if not isinstance(snapshot, dict) or not snapshot.get("owner"):
        errors.append("target_snapshot.owner is required")
    if isinstance(snapshot, dict):
        files = snapshot.get("files", [])
        if isinstance(files, list):
            for index, entry in enumerate(files):
                if not isinstance(entry, dict):
                    errors.append(f"target_snapshot.files[{index}] must be an object")
                    continue
                if not entry.get("path") or not entry.get("sha256"):
                    errors.append(
                        f"target_snapshot.files[{index}] requires path and sha256"
                    )
                path = str(entry.get("path", ""))
                if path.startswith(("/", "\\")) or ".." in Path(path).parts:
                    errors.append(f"target_snapshot.files[{index}] path is unsafe")
                if entry.get("read_status") not in {"read", "rendered", "parsed"}:
                    errors.append(
                        f"target_snapshot.files[{index}].read_status is invalid"
                    )

    context = data.get("context_register", [])
    if not isinstance(context, list):
        errors.append("context_register must be an array")
    else:
        for index, entry in enumerate(context):
            if not isinstance(entry, dict):
                errors.append(f"context_register[{index}] must be an object")
                continue
            source_type = entry.get("source_type")
            if source_type not in SOURCE_TYPES:
                errors.append(f"context_register[{index}].source_type is invalid")
            if entry.get("evidence_state") not in EVIDENCE_STATES:
                errors.append(f"context_register[{index}].evidence_state is invalid")
            if not entry.get("source_id"):
                errors.append(f"context_register[{index}].source_id is required")
            if not entry.get("access_basis"):
                errors.append(f"context_register[{index}].access_basis is required")
            if source_type == "authorized_memory_export" and not entry.get("access_basis"):
                errors.append(
                    f"context_register[{index}].access_basis is required for memory exports"
                )

    gates = data.get("gates", {})
    if not isinstance(gates, dict):
        errors.append("gates must be an object")
        gates = {}
    for gate in sorted(REQUIRED_GATES):
        record = gates.get(gate)
        if not isinstance(record, dict):
            errors.append(f"gate record missing: {gate}")
            continue
        state = record.get("state")
        if state not in GATE_STATES:
            errors.append(f"gate {gate} has invalid state")
        if state == "approved" and (not record.get("approver") or not record.get("timestamp")):
            errors.append(f"gate {gate} approval requires approver and timestamp")

    invariants = data.get("protected_invariants", {})
    if not isinstance(invariants, dict):
        errors.append("protected_invariants must be an object")
        invariants = {}
    for invariant in sorted(REQUIRED_INVARIANTS):
        state = invariants.get(invariant)
        if state not in {"preserved", "approved_change"}:
            errors.append(f"protected invariant not preserved or approved: {invariant}")

    problems = data.get("problem_register", [])
    if not isinstance(problems, list):
        errors.append("problem_register must be an array")
        problem_ids: set[str] = set()
    else:
        problem_ids = {
            item.get("problem_id")
            for item in problems
            if isinstance(item, dict) and item.get("problem_id")
        }
    for section_name in ("proposed_changes", "applied_changes"):
        changes = data.get(section_name, [])
        if not isinstance(changes, list):
            errors.append(f"{section_name} must be an array")
            continue
        for index, change in enumerate(changes):
            if not isinstance(change, dict):
                errors.append(f"{section_name}[{index}] must be an object")
                continue
            linked = change.get("problem_ids", [])
            if not isinstance(linked, list) or not linked:
                errors.append(f"{section_name}[{index}].problem_ids is required")
            elif not set(linked).issubset(problem_ids):
                errors.append(f"{section_name}[{index}] references unknown problem_ids")

    tests = data.get("tests", [])
    observed_classes: set[str] = set()
    if not isinstance(tests, list):
        errors.append("tests must be an array")
    else:
        for index, test in enumerate(tests):
            if not isinstance(test, dict):
                errors.append(f"tests[{index}] must be an object")
                continue
            test_class = test.get("class")
            if isinstance(test_class, str):
                observed_classes.add(test_class)
            if test.get("candidate_result") not in {"pass", "fail", "not_run"}:
                errors.append(f"tests[{index}].candidate_result is invalid")
    for missing in sorted(REQUIRED_TEST_CLASSES - observed_classes):
        errors.append(f"missing required test class: {missing}")

    release_status = data.get("release_status")
    if release_status not in {
        "draft",
        "no_change",
        "blocked",
        "approved",
        "released",
        "rolled_back",
    }:
        errors.append("release_status is invalid")

    applied = bool(data.get("applied_changes"))
    if applied and gates.get("apply_change_approval", {}).get("state") != "approved":
        errors.append("applied_changes require apply_change_approval")

    releasing = release_status in {"approved", "released"}
    if releasing:
        for gate in (
            "target_scope_approval",
            "context_scope_approval",
            "change_proposal_approval",
            "apply_change_approval",
            "release_approval",
        ):
            if gates.get(gate, {}).get("state") != "approved":
                errors.append(f"release requires approved gate: {gate}")
        for index, test in enumerate(tests if isinstance(tests, list) else []):
            if isinstance(test, dict) and test.get("candidate_result") != "pass":
                errors.append(f"release requires passing candidate test: tests[{index}]")
        rollback = data.get("rollback", {})
        if not isinstance(rollback, dict) or rollback.get("verified") is not True:
            errors.append("release requires rollback.verified to be true")

    external_write = bool(data.get("external_state_mutation"))
    if external_write and gates.get("external_state_mutation_approval", {}).get("state") != "approved":
        errors.append("external mutation requires external_state_mutation_approval")

    return errors


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_evolution_manifest.py MANIFEST.json", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    try:
        data = load_manifest(path)
        errors = validate(data)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("OK: evolution manifest is valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
