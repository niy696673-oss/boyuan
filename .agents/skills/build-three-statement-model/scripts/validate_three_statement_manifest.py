#!/usr/bin/env python3
"""Validate the minimum three-statement manifest contract."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REQUIRED = {
    "artifact_type": str,
    "status": str,
    "scope": str,
    "entity_perimeter": dict,
    "accounting_basis": str,
    "currency": str,
    "unit_scale": str,
    "historical_periods": list,
    "forecast_periods": list,
    "schedules": list,
    "evidence_register": list,
    "adjustment_log": list,
    "assumption_register": list,
    "conflict_log": list,
    "unknowns": list,
    "tie_outs": dict,
    "human_approvals": list,
}
STATUSES = {"validated_workbook", "recalculation_required", "specification_only", "repair_review", "not_suitable"}
SCOPES = {"full_model", "scoped_model", "repair_review", "not_suitable"}
EVIDENCE_STATES = {
    "source-confirmed", "user-provided", "calculated", "inferred",
    "assumption", "unknown", "conflicting",
}
APPROVAL_STATES = {"not_required", "pending", "approved", "rejected"}
APPROVAL_GATES = {
    "input_scope_approval", "method_assumption_approval",
    "external_release_approval", "external_state_mutation_approval",
}


def load_manifest(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("top-level JSON value must be an object")
    return data


def validate_evidence_register(rows: object, errors: list[str]) -> None:
    if not isinstance(rows, list):
        return
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(f"evidence_register[{index}] must be an object")
        elif row.get("evidence_state") not in EVIDENCE_STATES:
            errors.append(f"evidence_register[{index}].evidence_state is invalid or missing")


def validate_approvals(rows: object, errors: list[str]) -> dict[str, str]:
    states: dict[str, str] = {}
    if not isinstance(rows, list):
        return states
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(f"human_approvals[{index}] must be an object")
            continue
        gate = row.get("gate")
        status = row.get("status")
        if gate not in APPROVAL_GATES:
            errors.append(f"human_approvals[{index}].gate is invalid or missing")
        if status not in APPROVAL_STATES:
            errors.append(f"human_approvals[{index}].status is invalid or missing")
        if gate in states:
            errors.append(f"human_approvals contains duplicate gate: {gate}")
        elif gate in APPROVAL_GATES and status in APPROVAL_STATES:
            states[gate] = status
    return states


def validate(data: dict) -> list[str]:
    errors: list[str] = []
    for key, expected_type in REQUIRED.items():
        if key not in data:
            errors.append(f"missing required field: {key}")
        elif not isinstance(data[key], expected_type):
            errors.append(f"{key} must be {expected_type.__name__}")
    if data.get("artifact_type") != "three_statement_model":
        errors.append("artifact_type must equal three_statement_model")
    if data.get("status") not in STATUSES:
        errors.append(f"status must be one of {sorted(STATUSES)}")
    if data.get("scope") not in SCOPES:
        errors.append(f"scope must be one of {sorted(SCOPES)}")
    if (data.get("status") == "not_suitable") != (data.get("scope") == "not_suitable"):
        errors.append("status and scope must both be not_suitable or neither be not_suitable")
    if (data.get("status") == "repair_review") != (data.get("scope") == "repair_review"):
        errors.append("status and scope must both be repair_review or neither be repair_review")
    if data.get("scope") in {"full_model", "scoped_model"}:
        for field in ("entity_perimeter", "historical_periods", "forecast_periods", "schedules"):
            if not data.get(field):
                errors.append(f"{field} cannot be empty for a modeled forecast")
    elif data.get("scope") == "repair_review":
        for field in ("entity_perimeter", "historical_periods", "schedules"):
            if not data.get(field):
                errors.append(f"{field} cannot be empty for a repair review")
    periods = data.get("historical_periods", []) + data.get("forecast_periods", [])
    if len(periods) != len(set(periods)):
        errors.append("historical_periods and forecast_periods must not overlap or duplicate")
    if data.get("scope") != "not_suitable" and not data.get("evidence_register"):
        errors.append("evidence_register cannot be empty for model or repair work")
    validate_evidence_register(data.get("evidence_register"), errors)
    approvals = validate_approvals(data.get("human_approvals"), errors)
    if data.get("status") == "validated_workbook":
        required_checks = {"balance_sheet", "cash_flow", "ending_cash"}
        tie_outs = data.get("tie_outs", {})
        missing = required_checks - set(tie_outs)
        if missing:
            errors.append(f"validated_workbook is missing tie_outs: {', '.join(sorted(missing))}")
        failed = [name for name, result in tie_outs.items() if result is not True]
        if failed:
            errors.append(f"validated_workbook has non-passing tie_outs: {', '.join(failed)}")
        if data.get("scope") == "full_model":
            full_model_checks = {"retained_earnings", "fixed_assets", "debt"}
            missing = full_model_checks - set(tie_outs)
            if missing:
                errors.append(
                    f"full validated_workbook is missing tie_outs: {', '.join(sorted(missing))}"
                )
        for gate in ("input_scope_approval", "method_assumption_approval"):
            if approvals.get(gate) != "approved":
                errors.append(f"validated_workbook requires approved {gate}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="Path to a three-statement manifest JSON file")
    args = parser.parse_args()
    try:
        errors = validate(load_manifest(args.manifest))
    except ValueError as exc:
        errors = [str(exc)]
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Three-statement manifest validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
