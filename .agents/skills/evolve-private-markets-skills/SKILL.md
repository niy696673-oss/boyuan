---
name: evolve-private-markets-skills
description: "Propose, evaluate, and release controlled updates to editable Felix private-markets Skills using visible project context, authorized memory exports, user feedback, run evidence, Golden Sets, and approved sources. Use only when the user explicitly asks to improve, update, or evolve a Skill. Do not use for ordinary Skill execution or review, one-off answer rewriting, background learning, silent self-modification, third-party or system Skill mutation, or unapproved installation, publication, or external writes."
---

# Evolve Private-Markets Skills

Read [the global artifact and control contract](references/global-contract.md) and
[the evolution contract](references/evolution-contract.md) before inspecting or
changing a target Skill.

## Purpose

Improve one or more Felix private-markets Skills through a controlled,
evidence-backed release process. Treat conversation context and project memory as
versioned inputs, not as authority to mutate a Skill. Produce human-facing plans,
findings, and release notes in Simplified Chinese; keep schema keys, code, test
identifiers, and technical control fields in English.

Invoke this Skill only for an explicit request to evolve a Skill. Do not use it
for ordinary execution of a finance workflow, background learning, automatic
prompt rewriting, license changes, publication, deletion, or unapproved external
state changes.

## Establish Scope and Capability

1. Confirm `target_skill`, requested outcome, observed failure or opportunity,
   approved context boundary, compatibility targets, release scope, and owner.
   Verify that the target is user-owned or otherwise editable. For a system or
   third-party Skill, stop and offer a separately named overlay or authorized fork.
2. Record `target_scope_approval` and `context_scope_approval`. Silence is not
   approval.
3. Probe only capabilities relevant to the task: visible conversation context,
   supplied files, authorized project-memory tools or exports, repository access,
   test execution, and artifact creation.
4. Follow [the project-memory contract](references/project-memory-contract.md).
   Never claim to have read an unavailable conversation, hidden memory, or an
   inaccessible repository. Mark the gap `unknown` and request a materialized
   export when it is necessary.

## Read the Target Completely

Before proposing a patch:

1. Inventory the target directory and record a stable snapshot identifier.
2. Read the complete `SKILL.md` plus every operational file it links or invokes,
   including `references/`, `scripts/`, `assets/`, templates, schemas, interface
   metadata, licenses, and local tests. Inspect binary or visual assets with an
   appropriate renderer or parser; a checksum alone does not establish reading.
3. Record file hashes and unresolved links in `target_snapshot`.
4. Identify triggering behavior, exclusions, inputs, outputs, human gates,
   fallbacks, protected invariants, and downstream handoffs.
5. Stop if a required target file cannot be read. Do not infer its contents from
   a filename, catalog, summary, or a similar Skill.
6. Read affected routers and downstream contracts when a trigger, schema, handoff,
   or output contract may change. Reject symlinks, path traversal, or unresolved
   dependencies until they are safely inspected.

## Build the Evidence Pack

Create a `context_register` using only the source types and evidence states in
[the project-memory contract](references/project-memory-contract.md). Separate:

- direct user instructions and approvals;
- visible conversation observations;
- authorized project-memory exports;
- real run traces and user corrections;
- Golden Set or regression evidence;
- approved external standards and source materials;
- analyst inference and unresolved unknowns.

Preserve chronology, as-of dates, scope, provenance, conflicts, and permission
bounds. A repeated preference is not a permanent rule unless the user made it
one. A single successful example is not proof of general quality.

## Diagnose Before Editing

Classify each problem as one or more of:

- `triggering_error`;
- `scope_or_boundary_error`;
- `missing_context_or_capability`;
- `workflow_or_handoff_error`;
- `evidence_or_calculation_error`;
- `output_contract_error`;
- `safety_or_approval_error`;
- `portability_error`;
- `evaluation_gap`;
- `documentation_drift`.

For every problem, record evidence IDs, affected behavior, severity, recurrence,
and the smallest plausible correction. Distinguish a Skill defect from missing
input, platform limitation, model variance, and operator error.
Return `no_change` when the evidence does not justify a generalizable improvement.

## Propose the Minimal Change

Return a Simplified-Chinese change proposal containing:

- current behavior and evidence;
- proposed files and semantic changes;
- intended behavior and non-goals;
- protected invariants and compatibility impact;
- test additions or revisions;
- data, licensing, confidentiality, and external-action risks;
- rollback method and proposed version change;
- unresolved unknowns and requested approvals.

Obtain `change_proposal_approval` before editing. A request to analyze or suggest
improvements does not authorize file mutation.

## Implement in an Isolated Candidate

After approval, create a working candidate without overwriting the approved
baseline. Keep the patch minimal and preserve attribution, third-party notices,
Felix licensing, and user-authored content. Do not weaken evidence controls,
human decision ownership, confidentiality, or external-action gates unless the
user explicitly approves that exact invariant change.

Obtain `apply_change_approval` before changing the governed target. Record every
changed file and its before/after hash in `patch_register`.

## Evaluate the Candidate

Follow [the evaluation and release protocol](references/evaluation-and-release.md).
At minimum, compare baseline and candidate on:

- representative positive cases;
- negative-trigger and out-of-scope cases;
- missing-context and abstention cases;
- evidence, conflict, calculation, and approval controls;
- link, script, schema, metadata, and license integrity;
- required platform compatibility.

Prefer deterministic assertions for contracts and structure. Use qualitative
grading only with disclosed rubrics and evidence. Do not promote a candidate that
regresses a critical control, merely moves wording, or has no testable connection
to the diagnosed problem.

Create an `evolution_manifest` and validate it with:

```bash
python scripts/validate_evolution_manifest.py path/to/evolution-manifest.json
```

## Release or Stop

Release only after `release_approval` is approved and all blocking tests pass.
Writing to a personal Skill store, shared repository, platform, marketplace, or
other external system also requires `external_state_mutation_approval` and
separate authorization for that destination.

Return a Simplified-Chinese release note with version, changed behavior, test
results, remaining limitations, rollback instructions, and approval record. If a
gate fails, keep the baseline and return a blocked release report instead.

## Protected Invariants

- Chinese-first human deliverables with English technical fields.
- Exact evidence states, conflict preservation, and calculation lineage.
- Human ownership of investment, legal, accounting, valuation, and release
  decisions.
- No silent contact, distribution, CRM/VDR update, scheduling, monitoring, or
  other external state mutation.
- No fabricated context, memory access, files, tests, approvals, or actions.
- Atomic Skills remain explicit-invocation by default; only intentional routers
  may be implicit.
- Felix attribution and license trace remain present.
- Third-party material remains within its authorization and license scope.
- Skill names and display headings do not reintroduce an `FA` package prefix;
  `FA` may remain where it identifies a legitimate business role or workflow.

## Resources

- [Evolution contract](references/evolution-contract.md)
- [Project-memory contract](references/project-memory-contract.md)
- [Evaluation and release protocol](references/evaluation-and-release.md)
