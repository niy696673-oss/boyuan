#!/usr/bin/env python3
"""Validate the minimum DCF manifest contract without external dependencies."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path


REQUIRED = {
    "artifact_type": str,
    "status": str,
    "suitability": str,
    "valuation_date": str,
    "currency": str,
    "accounting_basis": str,
    "forecast_periods": list,
    "scenarios": list,
    "terminal_methods": list,
    "enterprise_value": (int, float),
    "equity_bridge_items": list,
    "common_equity_value": (int, float),
    "fully_diluted_share_count": (int, float),
    "evidence_register": list,
    "assumption_register": list,
    "conflict_log": list,
    "unknowns": list,
    "tie_outs": dict,
    "human_approvals": list,
}
STATUSES = {"validated_workbook", "recalculation_required", "specification_only", "not_suitable"}
SUITABILITY = {"suitable", "conditionally_suitable", "not_suitable"}
EVIDENCE_STATES = {
    "source-confirmed", "user-provided", "calculated", "inferred",
    "assumption", "unknown", "conflicting",
}
APPROVAL_STATES = {"not_required", "pending", "approved", "rejected"}
APPROVAL_GATES = {
    "input_scope_approval", "method_assumption_approval",
    "external_release_approval", "external_state_mutation_approval",
}
REQUIRED_VALIDATED_TIE_OUTS = {
    "fcf_to_forecast", "wacc", "discount_timing", "equity_bridge",
    "diluted_share_count", "sensitivity_base",
}


def load_manifest(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("top-level JSON value must be an object")
    return data


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


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
        elif not isinstance(data[key], expected_type) or isinstance(data[key], bool):
            type_name = "number" if isinstance(expected_type, tuple) else expected_type.__name__
            errors.append(f"{key} must be {type_name}")

    if data.get("artifact_type") != "dcf_model":
        errors.append("artifact_type must equal dcf_model")
    if data.get("status") not in STATUSES:
        errors.append(f"status must be one of {sorted(STATUSES)}")
    if data.get("suitability") not in SUITABILITY:
        errors.append(f"suitability must be one of {sorted(SUITABILITY)}")
    if (data.get("status") == "not_suitable") != (data.get("suitability") == "not_suitable"):
        errors.append("status and suitability must both be not_suitable or neither be not_suitable")
    try:
        date.fromisoformat(data.get("valuation_date", ""))
    except (TypeError, ValueError):
        errors.append("valuation_date must be YYYY-MM-DD")
    if (
        isinstance(data.get("scenarios"), list)
        and (data.get("suitability") != "not_suitable" or data["scenarios"])
        and set(data["scenarios"]) != {"bear", "base", "bull"}
    ):
        errors.append("modeled scenarios must contain exactly bear, base, and bull")
    if data.get("suitability") != "not_suitable":
        if not data.get("forecast_periods"):
            errors.append("forecast_periods cannot be empty for a modeled DCF")
        if not data.get("terminal_methods"):
            errors.append("terminal_methods cannot be empty for a modeled DCF")
        if not data.get("equity_bridge_items"):
            errors.append("equity_bridge_items cannot be empty for a modeled DCF")
        if not data.get("evidence_register"):
            errors.append("evidence_register cannot be empty for a modeled DCF")
        shares = data.get("fully_diluted_share_count")
        if not is_number(shares) or shares <= 0:
            errors.append("fully_diluted_share_count must be positive for a modeled DCF")

    bridge_valid = is_number(data.get("enterprise_value")) and is_number(data.get("common_equity_value"))
    bridge_adjustment = 0.0
    for index, item in enumerate(data.get("equity_bridge_items", [])):
        if not isinstance(item, dict):
            errors.append(f"equity_bridge_items[{index}] must be an object")
            bridge_valid = False
            continue
        if not item.get("item_type"):
            errors.append(f"equity_bridge_items[{index}].item_type is required")
        operation = item.get("operation")
        if operation not in {"add", "subtract"}:
            errors.append(f"equity_bridge_items[{index}].operation must be add or subtract")
            bridge_valid = False
        amount = item.get("amount")
        if not is_number(amount) or amount < 0:
            errors.append(f"equity_bridge_items[{index}].amount must be a non-negative number")
            bridge_valid = False
        elif operation in {"add", "subtract"}:
            bridge_adjustment += amount if operation == "add" else -amount
        if item.get("evidence_state") not in EVIDENCE_STATES:
            errors.append(f"equity_bridge_items[{index}].evidence_state is invalid or missing")
    if bridge_valid and data.get("suitability") != "not_suitable":
        expected = float(data["enterprise_value"]) + bridge_adjustment
        actual = float(data["common_equity_value"])
        tolerance = max(1e-6, max(abs(expected), abs(actual), 1.0) * 1e-8)
        if abs(expected - actual) > tolerance:
            errors.append("equity bridge does not reconcile enterprise_value to common_equity_value")

    validate_evidence_register(data.get("evidence_register"), errors)
    approvals = validate_approvals(data.get("human_approvals"), errors)
    if data.get("status") == "validated_workbook":
        if not data.get("tie_outs"):
            errors.append("validated_workbook requires non-empty tie_outs")
        failed = [name for name, result in data.get("tie_outs", {}).items() if result is not True]
        if failed:
            errors.append(f"validated_workbook has non-passing tie_outs: {', '.join(failed)}")
        missing = REQUIRED_VALIDATED_TIE_OUTS - set(data.get("tie_outs", {}))
        if missing:
            errors.append(f"validated_workbook is missing tie_outs: {', '.join(sorted(missing))}")
        if approvals.get("method_assumption_approval") != "approved":
            errors.append("validated_workbook requires approved method_assumption_approval")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="Path to a DCF manifest JSON file")
    args = parser.parse_args()
    try:
        errors = validate(load_manifest(args.manifest))
    except ValueError as exc:
        errors = [str(exc)]
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("DCF manifest validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
