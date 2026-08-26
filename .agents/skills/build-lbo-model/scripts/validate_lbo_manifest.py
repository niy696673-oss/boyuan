#!/usr/bin/env python3
"""Validate the minimum LBO manifest contract without external dependencies."""

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
    "closing_date": str,
    "currency": str,
    "transaction_perimeter": dict,
    "sources": list,
    "uses": list,
    "debt_tranches": list,
    "scenarios": list,
    "sponsor_cash_flows": list,
    "exit_enterprise_value": (int, float),
    "exit_bridge_items": list,
    "exit_common_equity_value": (int, float),
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
    "sources_uses", "debt", "cash", "interest", "returns", "exit_bridge",
    "ownership_waterfall",
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


def validate_money_rows(name: str, rows: object, errors: list[str]) -> float | None:
    if not isinstance(rows, list):
        return None
    total = 0.0
    valid = True
    seen: set[str] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(f"{name}[{index}] must be an object")
            valid = False
            continue
        item_id = row.get("item_id")
        if not item_id:
            errors.append(f"{name}[{index}].item_id is required")
        elif item_id in seen:
            errors.append(f"{name} contains duplicate item_id: {item_id}")
        else:
            seen.add(item_id)
        amount = row.get("amount")
        if not is_number(amount) or amount < 0:
            errors.append(f"{name}[{index}].amount must be a non-negative number")
            valid = False
        else:
            total += float(amount)
        if row.get("evidence_state") not in EVIDENCE_STATES:
            errors.append(f"{name}[{index}].evidence_state is invalid or missing")
    return total if valid else None


def validate(data: dict) -> list[str]:
    errors: list[str] = []
    for key, expected_type in REQUIRED.items():
        if key not in data:
            errors.append(f"missing required field: {key}")
        elif not isinstance(data[key], expected_type) or isinstance(data[key], bool):
            type_name = "number" if isinstance(expected_type, tuple) else expected_type.__name__
            errors.append(f"{key} must be {type_name}")
    if data.get("artifact_type") != "lbo_model":
        errors.append("artifact_type must equal lbo_model")
    if data.get("status") not in STATUSES:
        errors.append(f"status must be one of {sorted(STATUSES)}")
    if data.get("suitability") not in SUITABILITY:
        errors.append(f"suitability must be one of {sorted(SUITABILITY)}")
    if (data.get("status") == "not_suitable") != (data.get("suitability") == "not_suitable"):
        errors.append("status and suitability must both be not_suitable or neither be not_suitable")
    for field in ("valuation_date", "closing_date"):
        try:
            date.fromisoformat(data.get(field, ""))
        except (TypeError, ValueError):
            errors.append(f"{field} must be YYYY-MM-DD")
    if (
        isinstance(data.get("scenarios"), list)
        and (data.get("suitability") != "not_suitable" or data["scenarios"])
        and set(data["scenarios"]) != {"downside", "base", "upside"}
    ):
        errors.append("modeled scenarios must contain exactly downside, base, and upside")
    if data.get("suitability") != "not_suitable":
        for field in (
            "transaction_perimeter", "sources", "uses", "debt_tranches",
            "sponsor_cash_flows", "exit_bridge_items", "evidence_register",
        ):
            if not data.get(field):
                errors.append(f"{field} cannot be empty for a modeled LBO")

    sources_total = validate_money_rows("sources", data.get("sources"), errors)
    uses_total = validate_money_rows("uses", data.get("uses"), errors)
    if sources_total is not None and uses_total is not None and data.get("suitability") != "not_suitable":
        tolerance = max(1e-6, max(abs(sources_total), abs(uses_total), 1.0) * 1e-8)
        if abs(sources_total - uses_total) > tolerance:
            errors.append("sources and uses do not reconcile")

    tranche_ids: list[str] = []
    for index, row in enumerate(data.get("debt_tranches", [])):
        if not isinstance(row, dict):
            errors.append(f"debt_tranches[{index}] must be an object")
            continue
        if not row.get("tranche_id"):
            errors.append(f"debt_tranches[{index}].tranche_id is required")
        else:
            tranche_ids.append(str(row["tranche_id"]))
        if not row.get("currency"):
            errors.append(f"debt_tranches[{index}].currency is required")
    if len(tranche_ids) != len(set(tranche_ids)):
        errors.append("debt_tranches contains duplicate tranche_id values")

    sponsor_amounts: list[float] = []
    for index, row in enumerate(data.get("sponsor_cash_flows", [])):
        if not isinstance(row, dict):
            errors.append(f"sponsor_cash_flows[{index}] must be an object")
            continue
        try:
            date.fromisoformat(row.get("date", ""))
        except (TypeError, ValueError):
            errors.append(f"sponsor_cash_flows[{index}].date must be YYYY-MM-DD")
        amount = row.get("amount")
        if not is_number(amount):
            errors.append(f"sponsor_cash_flows[{index}].amount must be a number")
        else:
            sponsor_amounts.append(float(amount))
    if data.get("suitability") != "not_suitable" and sponsor_amounts:
        if not any(amount < 0 for amount in sponsor_amounts):
            errors.append("modeled sponsor cash flows require at least one invested-capital outflow")
        if not any(amount > 0 for amount in sponsor_amounts):
            errors.append("modeled sponsor cash flows require at least one proceeds inflow")

    bridge_valid = is_number(data.get("exit_enterprise_value")) and is_number(
        data.get("exit_common_equity_value")
    )
    bridge_adjustment = 0.0
    for index, item in enumerate(data.get("exit_bridge_items", [])):
        if not isinstance(item, dict):
            errors.append(f"exit_bridge_items[{index}] must be an object")
            bridge_valid = False
            continue
        if not item.get("item_type"):
            errors.append(f"exit_bridge_items[{index}].item_type is required")
        operation = item.get("operation")
        if operation not in {"add", "subtract"}:
            errors.append(f"exit_bridge_items[{index}].operation must be add or subtract")
            bridge_valid = False
        amount = item.get("amount")
        if not is_number(amount) or amount < 0:
            errors.append(f"exit_bridge_items[{index}].amount must be a non-negative number")
            bridge_valid = False
        elif operation in {"add", "subtract"}:
            bridge_adjustment += amount if operation == "add" else -amount
        if item.get("evidence_state") not in EVIDENCE_STATES:
            errors.append(f"exit_bridge_items[{index}].evidence_state is invalid or missing")
    if bridge_valid and data.get("suitability") != "not_suitable":
        expected = float(data["exit_enterprise_value"]) + bridge_adjustment
        actual = float(data["exit_common_equity_value"])
        tolerance = max(1e-6, max(abs(expected), abs(actual), 1.0) * 1e-8)
        if abs(expected - actual) > tolerance:
            errors.append("exit bridge does not reconcile enterprise value to common equity")

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
    parser.add_argument("manifest", type=Path, help="Path to an LBO manifest JSON file")
    args = parser.parse_args()
    try:
        errors = validate(load_manifest(args.manifest))
    except ValueError as exc:
        errors = [str(exc)]
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("LBO manifest validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
