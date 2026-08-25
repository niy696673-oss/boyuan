#!/usr/bin/env python3
"""Validate an earnings-analysis manifest and evidence labeling."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path


REQUIRED = {
    "artifact_type": str,
    "company": dict,
    "reporting_period": str,
    "event_timestamp": str,
    "accounting_basis": str,
    "currency": str,
    "source_coverage": dict,
    "variance_rows": list,
    "drivers": list,
    "quality_flags": list,
    "direct_read_throughs": list,
    "inferred_read_throughs": list,
    "thesis_implications": list,
    "follow_up_events": list,
    "evidence_register": list,
    "conflict_log": list,
    "unknowns": list,
    "human_approvals": list,
}
SOURCE_STATUSES = {"complete", "partial_sources", "conflicting_sources", "insufficient_sources"}
EVIDENCE_STATES = {
    "source-confirmed", "user-provided", "calculated", "inferred",
    "assumption", "unknown", "conflicting",
}
DIRECT_EVIDENCE_STATES = {"source-confirmed", "user-provided", "calculated", "conflicting"}
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


def parse_timestamp(value: object, field: str, errors: list[str]) -> None:
    if not isinstance(value, str):
        errors.append(f"{field} must be an ISO-8601 string")
        return
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(f"{field} must be ISO-8601")


def parse_date(value: object, field: str, errors: list[str]) -> None:
    if not isinstance(value, str):
        errors.append(f"{field} must be a YYYY-MM-DD string")
        return
    try:
        date.fromisoformat(value)
    except ValueError:
        errors.append(f"{field} must be YYYY-MM-DD")


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
    if data.get("artifact_type") != "earnings_analysis":
        errors.append("artifact_type must equal earnings_analysis")
    parse_timestamp(data.get("event_timestamp"), "event_timestamp", errors)
    coverage = data.get("source_coverage", {})
    status = coverage.get("status") if isinstance(coverage, dict) else None
    if status not in SOURCE_STATUSES:
        errors.append(f"source_coverage.status must be one of {sorted(SOURCE_STATUSES)}")
    sources = coverage.get("sources", []) if isinstance(coverage, dict) else []
    if not isinstance(sources, list):
        errors.append("source_coverage.sources must be a list")
    else:
        for index, source in enumerate(sources):
            if not isinstance(source, dict):
                errors.append(f"source_coverage.sources[{index}] must be an object")
                continue
            if not source.get("publication_date"):
                errors.append(f"source_coverage.sources[{index}] is missing publication_date")
            else:
                parse_date(
                    source.get("publication_date"),
                    f"source_coverage.sources[{index}].publication_date",
                    errors,
                )
            if not (source.get("source_id") or source.get("url") or source.get("title")):
                errors.append(f"source_coverage.sources[{index}] is missing source identity")
    if status == "complete" and not sources:
        errors.append("complete source coverage requires at least one dated source")
    for index, row in enumerate(data.get("variance_rows", [])):
        if not isinstance(row, dict):
            errors.append(f"variance_rows[{index}] must be an object")
            continue
        uses_consensus = row.get("consensus") is not None or row.get("comparison_basis") == "consensus"
        if uses_consensus and not (row.get("consensus_source") and row.get("consensus_as_of")):
            errors.append(f"variance_rows[{index}] uses consensus without source and as-of date")
        elif uses_consensus:
            parse_date(row.get("consensus_as_of"), f"variance_rows[{index}].consensus_as_of", errors)
    for index, item in enumerate(data.get("direct_read_throughs", [])):
        if not isinstance(item, dict):
            errors.append(f"direct_read_throughs[{index}] must be an object")
            continue
        if item.get("evidence_state") not in DIRECT_EVIDENCE_STATES:
            errors.append(
                f"direct_read_throughs[{index}] must use a direct, non-inferred evidence_state"
            )
    for index, item in enumerate(data.get("inferred_read_throughs", [])):
        if not isinstance(item, dict):
            errors.append(f"inferred_read_throughs[{index}] must be an object")
            continue
        if item.get("evidence_state") not in {"inferred", "assumption"}:
            errors.append(f"inferred_read_throughs[{index}] must label evidence_state as inferred or assumption")
        if not item.get("rationale"):
            errors.append(f"inferred_read_throughs[{index}] is missing rationale")
    for field in ("drivers", "quality_flags", "thesis_implications", "follow_up_events"):
        for index, item in enumerate(data.get(field, [])):
            if not isinstance(item, dict):
                errors.append(f"{field}[{index}] must be an object")
                continue
            if item.get("evidence_state") not in EVIDENCE_STATES:
                errors.append(f"{field}[{index}].evidence_state is invalid or missing")

    validate_evidence_register(data.get("evidence_register"), errors)
    approvals = validate_approvals(data.get("human_approvals"), errors)
    if status != "insufficient_sources" and not data.get("evidence_register"):
        errors.append("non-insufficient analysis requires a non-empty evidence_register")
    if data.get("inferred_read_throughs") or data.get("thesis_implications"):
        if approvals.get("method_assumption_approval") not in {"pending", "approved", "rejected"}:
            errors.append(
                "inferred read-throughs or thesis implications require a recorded method_assumption_approval"
            )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="Path to an earnings manifest JSON file")
    args = parser.parse_args()
    try:
        errors = validate(load_manifest(args.manifest))
    except ValueError as exc:
        errors = [str(exc)]
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Earnings manifest validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
