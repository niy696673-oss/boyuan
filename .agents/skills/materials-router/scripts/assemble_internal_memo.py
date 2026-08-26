#!/usr/bin/env python3
"""Assemble a QR, initiation pack, or IC memo from reviewed atomic outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


EVIDENCE_STATES = {
    "source-confirmed",
    "user-provided",
    "calculated",
    "inferred",
    "assumption",
    "unknown",
    "conflicting",
}

MODES = {
    "qr": (
        "Quick Review（QR）",
        [
            ("executive_summary", "1. Executive summary"),
            ("company_snapshot", "2. Company and financing snapshot"),
            ("thesis", "3. Thesis and counter-thesis"),
            ("evidence_gaps", "4. Evidence quality and material gaps"),
            ("comps_context", "5. Market / comps context"),
            ("key_questions", "6. Key questions and next evidence requests"),
            ("decision_options", "7. Decision options"),
        ],
    ),
    "initiation": (
        "立项报告 / Initiation Pack",
        [
            ("initiation_request", "1. Initiation request"),
            ("mandate_fit", "2. Company, financing, and mandate fit"),
            ("thesis", "3. Thesis, counter-thesis, and evidence grade"),
            ("risks", "4. Preliminary risks and kill criteria"),
            ("workplan", "5. Proposed DD scope, budget, owners, and timetable"),
            ("committee_questions", "6. Meeting / committee questions"),
            ("decision_options", "7. Conditions and decision options"),
        ],
    ),
    "ic": (
        "投资建议书 / IC Memo",
        [
            ("transaction_summary", "1. Transaction summary"),
            ("thesis", "2. Investment thesis and counter-thesis"),
            ("diligence_findings", "3. Diligence findings and unresolved evidence"),
            ("valuation", "4. Valuation, scenarios, and calculation lineage"),
            ("terms_issues", "5. Transaction terms and open issues"),
            ("risks", "6. Risk, mitigation, conditions precedent, and residual risk"),
            ("decision_options", "7. Decision options and pause / revisit path"),
        ],
    ),
}


def load_input(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Input must be a JSON object")
    forbidden = {"final_decision", "approved", "vote_result", "legal_conclusion"}
    present = forbidden.intersection(data)
    if present:
        raise ValueError(f"Forbidden decision fields: {', '.join(sorted(present))}")
    return data


def validate_blocks(sections: dict[str, Any]) -> None:
    if not isinstance(sections, dict):
        raise ValueError("sections must be an object")
    for key, blocks in sections.items():
        if not isinstance(blocks, list):
            raise ValueError(f"sections.{key} must be a list")
        for index, block in enumerate(blocks):
            if not isinstance(block, dict) or not str(block.get("text", "")).strip():
                raise ValueError(f"sections.{key}[{index}] requires non-empty text")
            state = block.get("evidence_state")
            if state not in EVIDENCE_STATES:
                raise ValueError(f"sections.{key}[{index}] has invalid evidence_state")
            if not isinstance(block.get("source_ids", []), list):
                raise ValueError(f"sections.{key}[{index}].source_ids must be a list")


def render_blocks(blocks: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for block in blocks:
        sources = ", ".join(block.get("source_ids", [])) or "none"
        lines.append(f"- {block['text']}  ")
        lines.append(f"  `evidence_state: {block['evidence_state']}` · `sources: {sources}`")
    return lines or ["- 未提供。 `evidence_state: unknown`"]


def assemble(mode: str, data: dict[str, Any]) -> str:
    title, ordered_sections = MODES[mode]
    sections = data.get("sections", {})
    validate_blocks(sections)
    meta = data.get("artifact_meta", {})
    required_meta = ["project", "as_of_date", "owner", "confidentiality"]
    missing = [field for field in required_meta if not str(meta.get(field, "")).strip()]
    if missing:
        raise ValueError(f"Missing artifact_meta fields: {', '.join(missing)}")

    lines = [
        f"# {title}",
        "",
        "> Internal draft. Decision status: `pending_human_approval`.",
        "",
        "## Metadata",
        "",
        f"- Project: {meta['project']}",
        f"- As-of date: {meta['as_of_date']}",
        f"- Owner: {meta['owner']}",
        f"- Confidentiality: {meta['confidentiality']}",
        "",
    ]
    for key, heading in ordered_sections:
        lines.extend([f"## {heading}", ""])
        lines.extend(render_blocks(sections.get(key, [])))
        lines.append("")

    lines.extend(["## 8. Source register and conflict log", ""])
    for source in data.get("source_register", []):
        lines.append(f"- {source.get('source_id', 'unknown')}: {source.get('title', 'untitled')}")
    if not data.get("source_register"):
        lines.append("- No source register supplied; release is blocked.")
    lines.extend(["", "### Conflicts", ""])
    for conflict in data.get("conflict_log", []):
        lines.append(f"- {conflict.get('field', 'unknown')}: {conflict.get('description', 'unresolved')}")
    if not data.get("conflict_log"):
        lines.append("- No conflicts recorded; this does not prove that no conflicts exist.")

    lines.extend(
        [
            "",
            "## 9. Human approvals",
            "",
            "- Input and scope: pending / approved / rejected",
            "- Method and assumptions: pending / approved / rejected",
            "- Decision language: pending / approved / rejected",
            "- External release: pending / approved / rejected",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=sorted(MODES), required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = assemble(args.mode, load_input(args.input))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(result, encoding="utf-8")


if __name__ == "__main__":
    main()
