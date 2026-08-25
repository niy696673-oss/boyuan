#!/usr/bin/env python3
"""Validate catalyst-ledger modes, scheduler claims, and event traceability."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


REQUIRED = {
    "artifact_type": str,
    "mode": str,
    "as_of": str,
    "scheduler_status": str,
    "scheduler": dict,
    "source_coverage": list,
    "events": list,
    "human_approvals": list,
}
MODES = {"one_time_scan", "ledger_update", "monitoring_spec", "scheduled_monitor"}
SCHEDULER_STATUSES = {"active", "not_configured", "unavailable", "failed"}
VERIFICATION = {"confirmed", "expected", "inferred", "unknown", "changed", "completed", "cancelled"}
EVIDENCE = {"source-confirmed", "user-provided", "calculated", "inferred", "assumption", "unknown", "conflicting"}
PROBABILITY_LEVELS = {"low", "medium", "high", "unknown"}
CONFIDENCE_LEVELS = {"low", "medium", "high", "unknown"}
IMPACT_LEVELS = {"low", "medium", "high", "critical", "unknown"}
URGENCY_LEVELS = {"low", "medium", "high", "critical", "unknown"}
DIRECTIONS = {"positive", "negative", "mixed", "neutral", "unknown"}
THESIS_DELTAS = {"supports", "challenges", "mixed", "no_change", "unknown"}
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
    if data.get("artifact_type") != "catalyst_ledger":
        errors.append("artifact_type must equal catalyst_ledger")
    mode = data.get("mode")
    scheduler = data.get("scheduler_status")
    if mode not in MODES:
        errors.append(f"mode must be one of {sorted(MODES)}")
    if scheduler not in SCHEDULER_STATUSES:
        errors.append(f"scheduler_status must be one of {sorted(SCHEDULER_STATUSES)}")
    if scheduler == "active" and mode != "scheduled_monitor":
        errors.append("scheduler_status active requires mode scheduled_monitor")
    if mode == "scheduled_monitor" and scheduler == "not_configured":
        errors.append("scheduled_monitor cannot claim scheduler_status not_configured")
    if mode == "scheduled_monitor" and scheduler == "unavailable":
        errors.append("unavailable scheduler requires mode monitoring_spec")
    if mode == "monitoring_spec" and scheduler == "active":
        errors.append("monitoring_spec cannot claim an active scheduler")
    parse_timestamp(data.get("as_of"), "as_of", errors)

    scheduler_details = data.get("scheduler", {})
    approvals = validate_approvals(data.get("human_approvals"), errors)
    if scheduler == "active" and isinstance(scheduler_details, dict):
        for field in ("automation_id", "cadence", "last_verified_at"):
            if not scheduler_details.get(field):
                errors.append(f"active scheduler requires scheduler.{field}")
        if scheduler_details.get("last_verified_at"):
            parse_timestamp(
                scheduler_details["last_verified_at"], "scheduler.last_verified_at", errors
            )
        if approvals.get("external_state_mutation_approval") != "approved":
            errors.append("active scheduler requires approved external_state_mutation_approval")

    for index, source in enumerate(data.get("source_coverage", [])):
        prefix = f"source_coverage[{index}]"
        if not isinstance(source, dict):
            errors.append(f"{prefix} must be an object")
            continue
        if not (source.get("source_id") or source.get("name") or source.get("url")):
            errors.append(f"{prefix} is missing source identity")
        if source.get("status") not in {"queried", "available", "unavailable", "unauthorized", "failed", "not_checked"}:
            errors.append(f"{prefix}.status is invalid or missing")

    event_ids: list[str] = []
    for index, event in enumerate(data.get("events", [])):
        prefix = f"events[{index}]"
        if not isinstance(event, dict):
            errors.append(f"{prefix} must be an object")
            continue
        for field in (
            "event_id", "entity_id", "event_type", "event_subtype", "time_zone", "owner",
            "human_gate", "next_evidence", "deduplication_key", "thesis_pillar",
        ):
            if not event.get(field):
                errors.append(f"{prefix}.{field} is required")
        if event.get("event_id"):
            event_ids.append(str(event["event_id"]))
        if event.get("verification_status") not in VERIFICATION:
            errors.append(f"{prefix}.verification_status is invalid")
        if event.get("evidence_state") not in EVIDENCE:
            errors.append(f"{prefix}.evidence_state is invalid")
        if event.get("probability") not in PROBABILITY_LEVELS:
            errors.append(f"{prefix}.probability must be one of {sorted(PROBABILITY_LEVELS)}")
        if event.get("impact") not in IMPACT_LEVELS:
            errors.append(f"{prefix}.impact must be one of {sorted(IMPACT_LEVELS)}")
        if event.get("confidence") not in CONFIDENCE_LEVELS:
            errors.append(f"{prefix}.confidence must be one of {sorted(CONFIDENCE_LEVELS)}")
        if event.get("urgency") not in URGENCY_LEVELS:
            errors.append(f"{prefix}.urgency must be one of {sorted(URGENCY_LEVELS)}")
        if event.get("direction") not in DIRECTIONS:
            errors.append(f"{prefix}.direction must be one of {sorted(DIRECTIONS)}")
        if event.get("thesis_delta") not in THESIS_DELTAS:
            errors.append(f"{prefix}.thesis_delta must be one of {sorted(THESIS_DELTAS)}")
        expected_at = event.get("expected_at")
        actual_at = event.get("actual_at")
        if not expected_at and not actual_at:
            errors.append(f"{prefix} requires expected_at or actual_at")
        if expected_at:
            parse_timestamp(expected_at, f"{prefix}.expected_at", errors)
        if actual_at:
            parse_timestamp(actual_at, f"{prefix}.actual_at", errors)
        parse_timestamp(event.get("next_check_at"), f"{prefix}.next_check_at", errors)
        if not isinstance(event.get("related_event_ids"), list):
            errors.append(f"{prefix}.related_event_ids must be a list")
        if not isinstance(event.get("source_refs"), list):
            errors.append(f"{prefix}.source_refs must be a list")
        elif event.get("evidence_state") == "source-confirmed" and not event.get("source_refs"):
            errors.append(f"{prefix} is source-confirmed but has no source_refs")
        primary_source = event.get("primary_source")
        if not isinstance(primary_source, dict):
            errors.append(f"{prefix}.primary_source must be an object")
        elif event.get("evidence_state") == "source-confirmed":
            for field in ("source_id", "publication_date", "last_checked_at", "location"):
                if not primary_source.get(field):
                    errors.append(f"{prefix}.primary_source.{field} is required when source-confirmed")
            if primary_source.get("last_checked_at"):
                parse_timestamp(
                    primary_source["last_checked_at"],
                    f"{prefix}.primary_source.last_checked_at",
                    errors,
                )
        gate = event.get("human_gate")
        if gate not in APPROVAL_GATES:
            errors.append(f"{prefix}.human_gate is invalid")
        elif gate not in approvals:
            errors.append(f"{prefix}.human_gate has no recorded human_approvals row")
    if len(event_ids) != len(set(event_ids)):
        errors.append("events contains duplicate event_id values")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ledger", type=Path, help="Path to a catalyst ledger JSON file")
    args = parser.parse_args()
    try:
        errors = validate(load_manifest(args.ledger))
    except ValueError as exc:
        errors = [str(exc)]
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Catalyst ledger validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
