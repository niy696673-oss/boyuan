# Dealflow recipes

## Investor-side origination

1. `$source-deals` in `project-sourcing` mode.
2. Partner/investment owner selects candidates; no external contact occurs.
3. `$screen-deal` in `one-minute` mode for the selected candidates.
4. Owner decides whether to advance, hold, request evidence, or decline.

Output: project pipeline plus separately versioned screen cards.

## Company/FA capital-source targeting

1. `$source-deals` in `capital-source-sourcing` mode.
2. FA/relationship owner reviews permissions, conflicts, no-contact, mandate evidence, and private relationship fields.
3. `$screen-deal` in `gp-fit` mode for owner-selected GP/fund candidates.
4. If approved, emit a typed handoff to `$prepare-investment-meeting` for a GP-introduction brief.
5. Outreach remains outside the recipe and requires separate recipient and mutation approval.

Output: capital-source pipeline, GP-fit cards, and optional approved meeting-prep handoff.

## Direct screening

Use `$screen-deal` only. Select `one-minute` for sparse first-pass evidence or `preliminary` for broader available materials. Do not add sourcing unless the user separately requests a candidate universe.

## Re-screen after new evidence

1. Load the prior immutable screen, new source register, approved risk register, and owner decision if supplied.
2. `$screen-deal` in `re-screen` mode.
3. Preserve old unknowns, severity floors, and change lineage.
4. Owner makes a new decision; do not overwrite the prior decision.

## Multi-side request

When the user asks to find both projects and investors, split into two jobs:

- Job A: `project-sourcing` with investor-side permissions.
- Job B: `capital-source-sourcing` with company/FA-side permissions.

Do not join the outputs except through a separately approved matching operation that preserves both sides' confidentiality.
