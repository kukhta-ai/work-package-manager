---
id: TASK-130
title: Keep strict CI evidence validation supplied with repository history
status: Done
assignee: []
created_date: '2026-08-28 14:03'
updated_date: '2026-08-28 14:21'
labels:
  - follow-up
  - ci
  - process-artifacts
  - release-gate
dependencies:
  - TASK-129
references:
  - PROCESS-ARTIFACTS.md
  - .github/workflows/ci.yml
  - research/evolution/gates/authoring-agent-onboarding-pr-5.json
priority: high
ordinal: 130000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: PR #5 CI runs 33177235938 and 33177230961 passed install, typecheck, and Biome, then every Node/OS cell reported the same 13 false missing-object violations because the candidate checkout contained only one commit while tracked governance evidence intentionally references earlier commits and historical files.

Boundary: Make push and pull-request CI candidates provide the repository object history required by the existing read-only process-artifact contract.

Non-goals: Weakening or teaching the validator to fetch, changing evidence records, altering the Node/OS matrix, changing PR merge-ref behavior, or adding publication/release automation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given tracked governance evidence references ancestor commits or files from them, when strict validation runs for a push or pull-request candidate, then every valid referenced Git object is locally resolvable.
- [x] #2 Given tracked governance evidence references an object that does not exist in repository history, when strict validation runs, then it remains rejected as invalid evidence.
- [x] #3 The CI workflow contract prevents history provisioning required by strict evidence validation from being removed unnoticed.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Literal bmad-investigate at PR #5 gate failure, loaded revision 49f289ca30cec1bfe38f4939e429fecb1e106edf. Both GitHub Actions event runs failed identically at strict process-artifact validation after typecheck/Biome passed. A depth-one local clone reproduced 13 violations; fetching full history made the unchanged checker pass. Investigation rejects checker exceptions, evidence rewrites, validator-side fetches, matrix changes, and a synthetic shallow-clone fixture. Ignored case file: _bmad-output/implementation-artifacts/investigations/pr-5-ci-process-artifact-history-investigation.md.

BMAD implementation evidence 2026-08-28: replacement worker fully preloaded the design set, then literally ran bmad-create-story, bmad-dev-story, and bmad-qa-generate-e2e-tests. RED observed the parsed workflow had no history-depth contract; GREEN adds only full-history provisioning to the existing checkout and one regression assertion. Focused workflow integration passed 5/5, existing invalid-evidence unit band passed 6/6, strict and ordinary process-artifact checks passed, typecheck and focused Biome passed. Independent reviewer fully preloaded the same revision and literally ran bmad-story-automator-review cycle 1: APPROVED with 0 Critical/High/Medium/Low findings and no fixes. It confirmed default PR synthetic merge-ref behavior, six-cell matrix, checker logic, evidence records, and release automation remain unchanged. The exact remote full matrix follows after required no-ff integration and push.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CI now supplies complete repository history to the unchanged strict process-artifact validator, allowing valid historical revisions and file evidence to resolve for both push and pull-request candidates. The workflow contract test prevents this required history boundary from disappearing, while genuinely nonexistent evidence remains rejected.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
