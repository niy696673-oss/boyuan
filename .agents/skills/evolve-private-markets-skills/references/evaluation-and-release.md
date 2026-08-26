# Evaluation and Release Protocol

## Evaluation design

Tie every test to a diagnosed problem or protected invariant. Record the fixture,
expected result, observed baseline result, observed candidate result, grading
method, and evidence IDs.

Required test classes:

- `positive`: intended invocation and representative workflow behavior;
- `negative_trigger`: near-neighbor request that must not invoke the Skill;
- `out_of_scope`: forbidden or separately owned task;
- `missing_context`: unavailable input or capability produces an honest fallback;
- `abstention`: high-risk or unapproved action stops at the correct gate;
- `control_regression`: evidence, conflict, calculation, approval, license, and
  external-action controls remain intact;
- `structure`: links, scripts, metadata, schemas, and package shape validate;
- `portability`: required target platforms receive a documented compatible path.

Use at least three representative positive cases and five negative-trigger cases
for a changed trigger or workflow boundary. Add focused cases for conflicting
memory, unavailable permissions, license conflicts, withheld mutation approval,
cross-Skill impact, and platforms without writable Skill storage when relevant.

Use synthetic or redacted fixtures unless the user approves restricted test data.
Never put real GP relationships, personal data, meeting recordings, or confidential
company facts in a distributable test fixture.

## Comparison rules

Compare the unchanged baseline and isolated candidate on the same fixtures. A
candidate passes only when:

- it corrects the diagnosed behavior on the relevant tests;
- no critical test regresses;
- any non-critical regression is disclosed and specifically accepted;
- structural validation passes;
- qualitative grading uses a disclosed rubric and reviewer;
- claimed improvements are supported by result evidence, not wording alone.

Run baseline and candidate cases in fresh contexts that do not reveal the expected
answer, diagnosed defect, or candidate implementation. Treat contaminated tests as
invalid rather than as passing evidence.

## Release record

The `evolution_manifest` contains:

- identity, version, owner, and timestamps;
- target snapshot and complete-read evidence;
- context and problem registers;
- proposed and applied changes;
- protected invariants and compatibility impact;
- baseline/candidate tests and summary;
- all gate states with approver and timestamp;
- rollback artifact and verification status;
- unresolved unknowns, accepted risks, and release status.

Use semantic versioning where the host system supports it. Treat a changed output
contract, trigger boundary, or human gate as at least a minor release; treat a
breaking schema or renamed Skill as a major release. Fixes that do not change the
contract may be patch releases.

## Rollback

Keep the approved baseline, exact patch, and candidate identity until the release
is accepted. Verify that rollback restores the baseline hashes. If rollback cannot
be demonstrated, release is blocked.
