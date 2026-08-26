#!/usr/bin/env python3
"""Validate a single-mode comparable-analysis manifest."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path


REQUIRED = {
    "artifact_type": str,
    "analysis_status": str,
    "analysis_mode": str,
    "valuation_date": str,
    "currency": str,
    "target": dict,
    "primary_peers": list,
    "reference_peers": list,
    "excluded_peers": list,
    "metric_definitions": dict,
    "statistics": dict,
    "implied_range": dict,
    "evidence_register": list,
    "assumption_register": list,
    "conflict_log": list,
    "unknowns": list,
    "human_approvals": list,
}
MODES = {"public_trading_comps", "precedent_transactions", "private_financing_rounds"}
ANALYSIS_STATUSES = {"complete", "insufficient_comparability"}
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


def peer_key(peer: object) -> str | None:
    if not isinstance(peer, dict):
        return None
    for field in ("peer_id", "entity_id", "transaction_id", "round_id", "name"):
        if peer.get(field):
            return f"{field}:{str(peer[field]).strip().casefold()}"
    return None


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
    if data.get("artifact_type") != "comps_analysis":
        errors.append("artifact_type must equal comps_analysis")
    mode = data.get("analysis_mode")
    if mode not in MODES:
        errors.append(f"analysis_mode must be one of {sorted(MODES)}")
    analysis_status = data.get("analysis_status")
    if analysis_status not in ANALYSIS_STATUSES:
        errors.append(f"analysis_status must be one of {sorted(ANALYSIS_STATUSES)}")
    try:
        date.fromisoformat(data.get("valuation_date", ""))
    except (TypeError, ValueError):
        errors.append("valuation_date must be YYYY-MM-DD")

    peers = data.get("primary_peers", []) + data.get("reference_peers", [])
    keys = [peer_key(peer) for peer in peers]
    if any(key is None for key in keys):
        errors.append("every included peer must have a stable ID or name")
    concrete_keys = [key for key in keys if key]
    if len(concrete_keys) != len(set(concrete_keys)):
        errors.append("primary_peers and reference_peers contain duplicate peers")
    for index, peer in enumerate(peers):
        if not isinstance(peer, dict):
            errors.append(f"included peer {index} must be an object")
            continue
        if peer.get("analysis_mode") != mode:
            errors.append(f"peer {peer_key(peer) or index} mixes analysis modes")
        if not (peer.get("source_date") or peer.get("announcement_date") or peer.get("round_date")):
            errors.append(f"peer {peer_key(peer) or index} is missing a source/event date")
        if not peer.get("currency"):
            errors.append(f"peer {peer_key(peer) or index} is missing currency")
        if peer.get("evidence_state") not in EVIDENCE_STATES:
            errors.append(f"peer {peer_key(peer) or index} has invalid or missing evidence_state")
        peer_currency = peer.get("currency")
        normalized_currency = peer.get("normalized_currency")
        if peer_currency and peer_currency != data.get("currency") and normalized_currency != data.get("currency"):
            errors.append(f"peer {peer_key(peer) or index} lacks normalization to manifest currency")
    validate_evidence_register(data.get("evidence_register"), errors)
    approvals = validate_approvals(data.get("human_approvals"), errors)
    if analysis_status == "complete":
        if len(data.get("primary_peers", [])) < 3:
            errors.append("complete analysis requires at least three primary peers")
        for field in ("target", "metric_definitions", "statistics", "implied_range", "evidence_register"):
            if not data.get(field):
                errors.append(f"complete analysis requires non-empty {field}")
        if approvals.get("method_assumption_approval") != "approved":
            errors.append("complete analysis requires approved method_assumption_approval")
    if analysis_status == "insufficient_comparability" and data.get("implied_range"):
        errors.append("insufficient_comparability must not contain an implied_range")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="Path to a comps manifest JSON file")
    args = parser.parse_args()
    try:
        errors = validate(load_manifest(args.manifest))
    except ValueError as exc:
        errors = [str(exc)]
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Comps manifest validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
