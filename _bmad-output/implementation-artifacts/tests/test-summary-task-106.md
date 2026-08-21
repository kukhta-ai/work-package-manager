# Test Automation Summary — TASK-106 Node 20+ runtime support

## Generated Tests

### Package-contract integration tests

- [x] `test/integration/package-runtime-support.test.ts` — reads the shipped package metadata, lockfile, README,
  and CI workflow through the real filesystem boundary.
- [x] The manifest and user-documentation assertions preserve the exact Node >=20 public contract.
- [x] The resolved-lock assertion walks every non-root package that is neither development-only nor optional.
  For each declared Node engine it uses semantic-range intersection—not string comparison—to prove compatibility
  with the complete Node 20 and Node 22 major release lines.
- [x] The CI assertion preserves the exact six-cell matrix: Node 20 and 22 on Ubuntu, macOS, and Windows.

### Built-CLI E2E tests

- [x] `test/integration/cli.bin.test.ts` — creates the two npm-style bin symlinks named `wpm` and `installer`,
  asserts that `package.json` declares both against `./dist/cli.js`, resolves each exercised target from that
  declaration, and asserts both print the installed package version.
- [x] The existing built `--help` path remains covered through the `wpm` alias, retaining the historical symlink
  entry-point regression guard.
- [x] The two-alias suite passed independently under Node 20.20.2 and Node 22.22.1; CI executes that same built
  test in every OS/runtime matrix cell.

## Acceptance-Criteria Coverage

- AC 1 — package metadata Node >=20: covered by the manifest assertion.
- AC 2 — user-facing Node >=20 prerequisite: covered by the README assertion.
- AC 3 — required production dependency closure admits Node 20: covered generically over the resolved lock.
- AC 4 — clean locked install on Node 20/22 without a WPM/required-production engine conflict: covered by local
  clean lock-based installs plus the generic production-closure assertion; repository CI performs `npm ci` in
  all six matrix cells before any test can run.
- AC 5 — built `wpm` and `installer` start and agree on version under Node 20/22: covered by the real symlink
  boundary, exercised locally on both runtime lines and by the CI matrix.
- AC 6 — Node 20/22 x Linux/macOS/Windows compatibility matrix remains present: covered by parsed workflow data.
- TASK-106 acceptance criteria: 6/6 covered.
- API endpoints: not applicable (Node CLI package).
- UI workflows / semantic locators: not applicable (no GUI by design).

## Verification

- RED evidence: the initial package-contract run failed 1/4 and named only
  `node_modules/commander (>=22.12.0)` as excluding Node 20.
- GREEN package contract: 4/4 passed after npm resolved exact `commander@14.0.3` (`engines.node: >=20`).
- QA-focused package/built-bin automation: 8/8 passed across 2 integration files.
- Runtime-specific package/built-bin automation: 8/8 under Node 20.20.2 and 8/8 under Node 22.22.1.
- Clean full locked install/build/built-bin flow: completed under Node 20.20.2 and Node 22.22.1, with 108 packages
  installed and the task-specific suite passing 8/8 in each isolated checkout.
- Exact full regression: cycle 1 passed 1,294/1,294 across 100 files in 410.79 seconds; final cycle 2 freshly
  passed the same 1,294/1,294 across 100 files in 411.31 seconds.
- TypeScript typecheck, Biome CI (201 files), production build, and `git diff --check`: passed.

## Diagnostic Boundary

- npm 10 validates engine metadata for omitted dev entries while resolving `npm ci --omit=dev`. On Node 20 it
  therefore reports `EBADENGINE` warnings for `lint-staged@17.0.7` and `listr2@10.2.1`, even though neither is
  installed in the production-only result.
- Those warnings are not caused by WPM or a required production dependency and do not fail the clean install.
  The resolved-production test independently proves every required package with an engine declaration admits
  Node 20. An engine-strict clean install was deliberately not claimed as green because npm validates the
  omitted dev-only lock entries too.

## Test Quality

- Vitest 4.1.7 and the repository's established integration-project conventions are used.
- Tests are deterministic, independent, contain no waits/retries, and create/remove only isolated temporary bin
  directories.
- The dependency assertion is graph-generic and diagnostic: a future incompatible direct or transitive required
  package is reported by lock path and engine range.
- The bin test cannot pass against invented aliases or targets: it asserts the shipped manifest map before
  driving both declared entries through the built boundary.
- The CI test asserts the complete matrix object, so an `exclude` entry cannot silently remove one of the six
  required cells.
- No production helper or core import was introduced for repository-contract testing.

## Workflow Evidence

- `bmad-qa-generate-e2e-tests` was invoked after `bmad-dev-story` for TASK-106.
- Customization resolved with no activation prepend/append steps; the persistent `project-context.md` glob
  matched no files; `workflow.on_complete` resolved empty.
- Existing framework selected: Vitest 4.1.7. API/UI generation steps were inapplicable; package metadata,
  clean-install, and built-CLI execution are this CLI product's through-the-edges acceptance surfaces.

## Independent Review

- `bmad-story-automator-review` was invoked with automatic fixes selected. Its customization resolved no
  activation prepend/append steps, no matching `project-context.md` facts, and no completion hook.
- HIGH fixed: the bin execution test previously manufactured aliases against a hard-coded target and did not
  prove the published `package.json.bin` declaration. It now asserts and consumes that declaration.
- MEDIUM fixed: the CI assertion previously allowed a matrix exclusion to remove a required cell. It now
  asserts the exact six-cell matrix definition with no exclusions.
- Review verdict: APPROVE. All six acceptance criteria are covered and passing; the branch CI run remains the
  authoritative cross-platform execution evidence after the orchestrator commits and pushes the reviewed story.

## Review-Continuation Evidence

- `bmad-dev-story` was re-invoked against the explicit TASK-106 story after review cycle 1. Customization
  resolved no activation prepend/append steps, no matching `project-context.md` facts, and no completion hook.
- The worker independently re-audited the HIGH bin-map fix and MEDIUM matrix fix. The former asserts the exact
  published aliases and resolves each exercised target from the manifest; the latter rejects `exclude`,
  `include`, or any other unexpected matrix shaping. No further implementation/test change was required.
- Focused package/runtime, built-bin, and Commander smoke tests passed 13/13 across 3 files; typecheck, Biome CI
  (201 files), production build, and `git diff --check` passed.
- The package manifest, lockfile, built-bin test, and package-runtime test SHA-256 hashes remained byte-identical
  to the reviewer's exact-final inputs. Its full 1,294/1,294 regression across 100 files therefore remains the
  applicable full-suite evidence and was not redundantly rerun.

## Final Review Cycle 2

- The independent reviewer re-invoked `bmad-story-automator-review` from scratch with automatic fixes selected.
  The review skill has no default customization file, and no project override, matching project-context fact,
  activation step, or completion hook resolved.
- The cycle-1 published-bin fix and exact-matrix fix both remain closed. The six-entry story File List matches
  the complete non-orchestrator diff and review artifacts; no undocumented implementation file is present.
- Fresh cycle-2 verification passed: focused package/runtime, built-bin, and Commander smoke tests 13/13 across
  3 files; typecheck; Biome CI across 201 files; production build; exact full regression 1,294/1,294 across 100
  files in 411.31 seconds; lock consistency, stable product/test hashes, inventory, whitespace, and diff hygiene.
- No new finding was confirmed. Final review verdict: APPROVE.
