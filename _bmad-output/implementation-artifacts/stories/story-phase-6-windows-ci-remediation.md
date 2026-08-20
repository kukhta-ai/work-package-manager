---
baseline_commit: 080ad9b933b04915dc0f0d0373f9385e217752c4
---

# Story phase-6-windows-ci-remediation — Restore the cross-platform CI gate

Status: done

> BMAD dev-story provenance: this Phase-6 fix story is derived one-for-one from the concluded
> `windows-ci-gate-investigation.md` because the remediation has no Backlog.md story. The investigation remains
> immutable, and neither Backlog.md nor sprint-state is updated by this workflow.

## Story

As a wpm contributor,
I want the test and core path seams to honor their declared platform contracts,
so that the supported Windows Node 20/22 CI cells validate the same behavior as Linux and macOS without masking
native filesystem or process semantics.

## Acceptance Criteria

1. Project-context path operations select POSIX or Win32 semantics from the injected `Environment.platform()`,
   so default Linux fakes remain host-independent POSIX while real and fake Win32 contexts retain native paths.
2. Native filesystem/process paths are converted to portable values only at the five documented
   logical-result/fake-observation seams: project-root stdout, authoring-skill results, absolute alias targets
   recorded by the POSIX memory fake, skill-stub changed paths, and template-miss searched paths. Relative alias
   targets remain byte-for-byte unchanged.
3. Built-CLI archive coverage uses a native path for archive existence and a POSIX path for printed build
   output.
4. Cross-platform alias tests assert the documented unconditional Windows copy fallback while retaining proof
   of real POSIX symlinks.
5. Backlog and Biome test-harness commands run through Execa with non-zero and launch diagnostics preserved.
6. ZIP availability follows the production launcher outcome: an absent command or non-zero version probe is
   unavailable and never reaches archive creation, while a zero-exit probe permits either successful creation
   or a typed archive failure with partial-output cleanup.
7. The real-subprocess packager suite runs under the existing serialized 60-second integration budget, with its
   prior tar, Git, ZIP, exact-set, transform, and push coverage preserved and no global timeout change.

## Tasks / Subtasks

- [x] Make project-context path computation follow the injected environment platform (AC: 1)
  - [x] Keep the workspace marker a stable logical relative path while selecting one path dialect for every
        join, resolve, dirname, and returned root
  - [x] Add explicit POSIX-default and Win32-drive fake coverage
- [x] Normalize only the five concluded logical/result/fake seams (AC: 2)
  - [x] Preserve native inputs for all filesystem and process effects
  - [x] Preserve relative alias targets verbatim while normalizing absolute targets recorded by the memory fake
- [x] Correct the three bounded cross-platform test contracts (AC: 3, 4, 5)
  - [x] Separate native archive existence from portable build stdout
  - [x] Assert Windows copies and POSIX symlinks according to the documented adapter policy
  - [x] Launch Backlog and local Biome command shims through Execa and preserve diagnostics
- [x] Correct the ZIP availability boundary from the production launcher result (AC: 6)
  - [x] Treat only a zero-exit version probe as usable, without localized diagnostic matching or a global
        `runSync` change
  - [x] Deterministically prove command absence, non-zero probe/no archive, zero-probe success, and zero-probe
        typed archive failure with partial-output cleanup
- [x] Move the real-subprocess packager suite into the existing serialized integration budget (AC: 7)
  - [x] Preserve every prior packager case and the integration project's existing 60-second timeout
  - [x] Leave global/unit-project timeout configuration unchanged
- [x] Invoke QA automation and run the targeted path/platform bands plus typecheck, lint, build, full regression,
      and diff hygiene gates (AC: 1-7)

## Dev Notes

### Remediation boundary and Follow-up #2 supersession

- The concluded investigation exhaustively partitions the 284 Windows failures into `261 + 16 + 1 + 3 + 2 +
  1`; this story implements those six correction mechanisms and does not reopen diagnosis.
- Core remains pure over injected ports. `resolveContext` may use pure `node:path` dialect objects, but must not
  import filesystem/process adapters.
- `Environment.platform()` chooses context path operations. Do not globally force POSIX paths: real and fake
  Win32 roots must remain native.
- Apply `toPosix` only when a native path becomes a logical/displayed/returned/fake-observable value at the five
  named seams. Filesystem and process I/O stays native.
- `MemoryFileSystem.ensureAlias` normalizes only absolute targets it records. A relative target such as
  `install-backlog` must be stored byte-for-byte.
- `NodeFileSystem` intentionally copies unconditionally on Windows. Do not add a privilege probe, attempt a
  symlink first, or change this product policy.
- Backlog and Biome command-shim fixes belong to test harnesses. Use Execa; retain stdout, stderr, exit status,
  and a visible launch-failure result.
- Follow-up #2 supersedes the original test-only ZIP diagnosis: production
  `src/adapters/packager.ts::toolAvailable` must treat a version probe as usable only when `runSync` returns
  successfully. Do not parse localized diagnostics or change the shared `runSync` contract.

### Required evidence

- Preserve existing default-Linux fake assertions and add an explicit Win32 `FakeEnvironment` context case.
- Assert native effect inputs where practical, portable returned/printed paths, and verbatim relative aliases.
- Keep POSIX symlink identity proof active on POSIX and assert a readable non-symlink copy on Windows rather
  than skipping the cross-platform contract.
- Run the investigation's targeted path band and platform/process band, then typecheck, Biome, production build,
  the full Vitest suite, and `git diff --check`.

### References

- [Source: _bmad-output/implementation-artifacts/investigations/windows-ci-gate-investigation.md]
- [Source: docs/12-builder-architecture.md]
- [Source: docs/13-core-architecture.md]
- [Source: src/core/services/context.ts]
- [Source: src/adapters/memory-fs.ts]
- [Source: src/adapters/packager.ts]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex persistent worker

### Debug Log References

- Dev-story customization: no activation prepend/append steps; the configured `**/project-context.md`
  persistent-fact glob matched no files; `workflow.on_complete` is empty.
- Dev-story execution: the concluded investigation was read in full and materialized one-for-one into this
  Phase-6 story. No sprint-status entry exists for the fix, so progress remained story-local and Backlog.md was
  untouched.
- Red/green: all 6 new deterministic regression assertions failed before the production correction (62
  unaffected assertions passed), then the final focused seam set passed 87/87 across 6 files. An initial test
  patch displaced the existing MemoryFileSystem cases; the complete original suite was restored before green
  validation, and its final diff contains additions only.
- Architecture audit: `resolveContext` selects one pure `node:path` dialect from the injected environment;
  native effect paths remain native, and `toPosix` appears only at the five concluded logical/result/fake seams.
  Relative alias targets remain verbatim.
- Harness audit: build output separates native archive existence from portable stdout; real alias coverage
  asserts the documented POSIX-symlink/Windows-copy contract; Backlog and local Biome run through Execa with
  diagnostics preserved.
- ZIP invariant: the unit probe now distinguishes spawn absence, successful execution, and present-but-nonzero
  execution. `src/adapters/packager.ts` remained byte-identical at hash
  `04c1dc4e037834740ec1bd9ff898b76c5c30c74b`.
- QA workflow: `bmad-qa-generate-e2e-tests` was invoked after implementation; customization resolved with no
  prepend/append steps, no project-context facts, and an empty completion hook. Native-effect recording was
  added at the authoring-skill, scaffold, and template-diagnostic seams.
- Final gates: investigation path band 168/168 across 15 files; unit project 1,081/1,081 across 75 files; built
  platform/process band 67/67 across 7 files; typecheck passed; Biome passed on 200 files; production build
  passed; full Vitest passed 1,286/1,286 across 99 files; `git diff --check` passed.
- Review-continuation absorption: `bmad-dev-story` was re-invoked after the separate-lane APPROVE verdict.
  Customization again resolved with no activation steps, persistent facts, or completion hook. The two reviewer
  edits were audited as comment-only; the 18-file product/test set remained byte-identical at composite SHA-256
  `5df8e4b2d63f9e5b7bade00eecd221cea4135b464c7001718c7a1008df6036eb`. Focused memory-fs/packager tests
  passed 32/32, then typecheck, Biome (200 files), build, and diff hygiene passed. The reviewer's fresh exact-final
  1,286/1,286 full run remains the full-regression evidence because no product or test bytes changed during
  absorption.
- External-CI Follow-up #2: `bmad-dev-story` was invoked again against this story on baseline `c76a44b`, with
  no customization activation steps, project-context facts, or completion hook. The concluded follow-up was
  read in full and supersedes the original test-only ZIP conclusion: an optional tool is usable only when its
  version probe exits zero, without localized stderr matching or a global `runSync` change.
- Follow-up red/green: after the test-only patch and packager-suite reclassification, the unchanged production
  code failed exactly 1/13 packager cases (12 passed): a non-zero version probe reached archive invocation and
  returned typed `zip failed`. The one-function probe correction then passed 13/13. The combined corrected
  output/packager band passed 42/42 across 4 integration files.
- Follow-up QA: `bmad-qa-generate-e2e-tests` was invoked after implementation; customization again resolved to
  no activation steps, facts, or completion hook. Deterministic production-launcher cases now cover command
  absence, a non-zero version probe, successful ZIP replacement, and successful probe followed by typed archive
  failure with partial-output removal.
- Follow-up final gates: typecheck passed; Biome passed on 200 files; production build passed; the exact full
  Vitest suite passed 1,288/1,288 across 99 files in 384.27 seconds; `git diff --check` passed. No global test
  timeout, `src/util/shell.ts`, or unrelated production behavior changed.
- Follow-up #2 review absorption: `bmad-dev-story` was re-invoked after the separate-lane APPROVE verdict.
  Customization again resolved with no activation additions, project-context facts, or completion hook. The
  reviewer changed only the story and QA contract/evidence; the five-file product/test composite remained
  byte-identical at SHA-256 `5f4f52361b8e31e66574e53da83d8e0505f7626e18b635d25a92cccd94acb9e7`.
  The corrected integration band passed 42/42, followed by typecheck, Biome (200 files), build, and diff hygiene.
  Because product/test bytes did not change, the reviewer's fresh exact-final 1,288/1,288 run remains the full
  regression evidence for this artifact-only absorption.

### Completion Notes List

- Context resolution now follows the injected platform rather than the JavaScript host, preserving POSIX fake
  determinism and native Win32 drive-root results.
- Exactly five result/fake seams normalize portable paths after native filesystem work: project-root stdout,
  authoring-skill records, absolute memory-fake alias observations, skill-stub changed paths, and template-miss
  diagnostics. Relative alias targets are not rewritten.
- Cross-platform test harnesses now model the documented archive-output, alias, npm-command-shim, and ZIP probe
  contracts without changing Windows symlink policy. Follow-up #2 supersedes the initial archive-tool
  availability conclusion as recorded above.
- QA evidence is recorded in
  `_bmad-output/implementation-artifacts/tests/test-summary-phase-6-windows-ci-remediation.md`; local automation
  is green and the external Windows Node 20/22 matrix remains the final empirical CI confirmation.
- The approved reviewer comments are absorbed without executable changes; the story is returned to `review`
  for the parent-owned Phase-6 integration decision.
- Follow-up #2 corrects only three stale portable-output expectations, the ZIP availability probe, and the test
  project classification for the real tar/Git packager suite. Native filesystem values, post-probe typed ZIP
  failure, stale-archive replacement, symlink/archive parity, and the existing 60-second integration budget are
  preserved.
- The reviewer-corrected live AC6/AC7, checked subtasks, and remediation note are absorbed without executable
  changes; the story is returned to `review` for parent-owned integration and fresh Windows matrix confirmation.

### File List

- `_bmad-output/implementation-artifacts/stories/story-phase-6-windows-ci-remediation.md` (new)
- `_bmad-output/implementation-artifacts/tests/test-summary-phase-6-windows-ci-remediation.md` (new)
- `src/adapters/memory-fs.ts`
- `src/adapters/packager.ts`
- `src/cli.ts`
- `src/core/operations/install-authoring-skill.ts`
- `src/core/operations/scaffold-skill.ts`
- `src/core/services/context.ts`
- `src/core/services/template-resolver.ts`
- `test/integration/adapters/node-fs.test.ts`
- `test/integration/adapters/packager.test.ts` (moved from `test/unit/adapters/packager.test.ts`)
- `test/integration/cli.build.e2e.test.ts`
- `test/integration/cli.init.test.ts`
- `test/integration/cli.project-reads.test.ts`
- `test/integration/cli.skill-install.test.ts`
- `test/integration/core-boundary.test.ts`
- `test/integration/docs-template-examples.e2e.test.ts`
- `test/unit/adapters/memory-fs.test.ts`
- `test/unit/cli/project-reads-commands.test.ts`
- `test/unit/operations/install-authoring-skill.test.ts`
- `test/unit/operations/scaffold-skill.test.ts`
- `test/unit/services/context.test.ts`
- `test/unit/services/template-resolver.test.ts`

## Senior Developer Review (AI)

### Reviewer

GPT-5 Codex persistent separate-lane reviewer — Phase-6 remediation review cycle 1

### Workflow and Scope Evidence

- Invoked `bmad-story-automator-review` against this story and the complete uncommitted diff from
  `080ad9b933b04915dc0f0d0373f9385e217752c4`.
- Workflow customization resolved to defaults: English/intermediate output, no `customize.toml`, no activation
  prepend/append steps, no project-context facts, and no completion hook. Backlog, sprint/state, branch,
  investigation, and `.serena/` artifacts remained parent-owned and untouched.
- The story File List reconciles exactly to 18 tracked source/test changes plus this story and its QA summary.
  The only other tracked workspace change is the explicitly excluded `.bmad/sdlc-state.yaml`; no staged or
  undocumented remediation file exists.
- The concluded investigation's exhaustive `261 + 16 + 1 + 3 + 2 + 1 = 284` failure partition maps one-for-one
  to the six bounded correction mechanisms. No workflow/dependency/product-policy expansion entered the diff.

### Findings and Auto-fixes

- **LOW — fixed:** `MemoryFileSystem`'s public alias documentation still said every target was stored verbatim,
  contradicting its new absolute-only POSIX observation normalization. The comment now states that absolute
  targets normalize while relative targets remain byte-for-byte unchanged.
- **LOW — fixed:** the packager test header still described ZIP as a binary installed/missing condition. It now
  documents the actual spawn-absent, usable, and present-but-nonzero test model.

### Acceptance-Criteria Audit

- AC 1: PASS — `resolveContext` chooses `node:path.posix` or `.win32` exclusively from
  `Environment.platform()`, uses that dialect for resolve/join/dirname/walk results, and retains a stable
  logical `wip/manifest.yml` marker. Default Linux fakes and an explicit Win32 drive/relative-override case pass.
- AC 2: PASS — native effect arguments remain native at the authoring-skill, scaffold, and template probes;
  normalization occurs only at the five concluded logical/result/fake seams. The memory fake recognizes both
  absolute dialects, normalizes only absolute recorded targets, and preserves relative alias bytes.
- AC 3: PASS — archive existence/extraction uses the native path while built-CLI stdout expects `toPosix`.
- AC 4: PASS — real POSIX tests retain symlink identity, forced/actual Windows paths require a readable
  non-symlink copy, and production Windows copy policy remains unchanged.
- AC 5: PASS — Backlog and local Biome npm shims run through Execa. Biome's non-zero exit plus stdout/stderr
  diagnostic is asserted; no-process results retain an explicit launch diagnostic rather than collapsing to
  empty output.
- AC 6: PASS — the test classifier distinguishes spawn absence from a numeric process exit. Local evidence
  covers the normal spawn-absent branch, deterministic usable fake tools, and an explicitly forced
  present-but-nonzero `zip` process. Production `src/adapters/packager.ts` remains byte-identical at
  `04c1dc4e037834740ec1bd9ff898b76c5c30c74b`.

### Gate Evidence

- Investigation path band: 168/168 across 15 files; complete unit project: 1,081/1,081 across 75 files.
- Typecheck: PASS; Biome lint/core boundary: PASS (200 files); production build: PASS.
- Built platform/process band: 67/67 across 7 files. Forced present-but-nonzero ZIP branch: 1/1 passed (10
  non-matching tests filtered).
- Fresh full regression: 1,286/1,286 across 99 files (started 11:32:14 UTC, duration 376.94s).
- File List/inventory reconciliation, packager hash, and `git diff --check`: PASS.

### Outcome

**APPROVE** — 2 LOW findings auto-fixed; 0 open findings. All locally reproducible evidence is green. An
external `windows-latest` Node 20/22 run remains the only unproven evidence needed to empirically close the two
deduced portions identified by the concluded investigation.

## Senior Developer Review (AI) — Final Absorption Cycle

### Workflow and Exact-Diff Audit

- Re-invoked `bmad-story-automator-review` after worker absorption and re-audited the complete uncommitted diff
  from `080ad9b933b04915dc0f0d0373f9385e217752c4`. Customization again resolved with no activation additions,
  project-context facts, or completion hook; parent-owned state/investigation artifacts remained untouched.
- The File List still reconciles to 18 tracked source/test files plus this story and its QA summary. The only
  additional tracked workspace change is the explicitly excluded `.bmad/sdlc-state.yaml`; no file is staged.
- The sorted per-file SHA-256 composite for all 18 `src`/`test` diff files independently reproduces
  `5df8e4b2d63f9e5b7bade00eecd221cea4135b464c7001718c7a1008df6036eb`. Absorption therefore changed no
  product/test bytes, and the previously reviewed six-mechanism implementation is identical.
- Both LOW comment fixes remain present and accurate. Production `src/adapters/packager.ts` remains unchanged at
  `04c1dc4e037834740ec1bd9ff898b76c5c30c74b`; all prior findings remain closed.

### Fresh Gate Evidence

- Edited-file unit band: 32/32 across 2 files; investigation path band: 168/168 across 15 files.
- Typecheck: PASS; Biome lint/core boundary: PASS (200 files); production build: PASS.
- Built platform/process band: 67/67 across 7 files; File List/inventory and diff hygiene: PASS.
- Because the executable composite is unchanged, the prior exact-final full regression remains authoritative:
  1,286/1,286 across 99 files (started 11:32:14 UTC, duration 376.94s).

### Outcome

**APPROVE** — 0 fresh findings; all six mechanisms and both review fixes remain closed. Story status is `done`.
External Windows Node 20/22 CI remains the only unproven empirical evidence.

## Senior Developer Review (AI) — External CI Follow-up #2

### Reviewer and Workflow Evidence

GPT-5 Codex persistent separate-lane reviewer — Follow-up #2 review cycle 1

- Invoked `bmad-story-automator-review` against this story and audited the complete current diff from
  `c76a44b0aaccb2db68379abfd507e377c91fd442` on `fix/authoring-context/windows-ci-followup`.
- Workflow customization resolved to English/intermediate critical-only automation with no custom review
  configuration, activation additions, project-context facts, or completion hook. Parent-owned Backlog, state,
  investigation, branch/commit/push, and `.serena/` surfaces remained untouched.
- Exact inventory is one product file, the packager test move, three portable-expectation test files, this story,
  and its QA summary. `src/util/shell.ts`, `vitest.config.ts`, core, package metadata, and CI configuration have no
  baseline delta.

### Finding and Auto-fix

- **MEDIUM — fixed:** the operative AC6, checked subtasks, and remediation-boundary note still required
  production `toolAvailable` to remain unchanged even though concluded Follow-up #2 superseded that initial
  diagnosis. The story contract now requires exit-zero availability, deterministic absence/non-zero/success/
  post-probe-failure evidence, and the unchanged integration timeout boundary; stale historical cycle evidence
  remains explicitly historical.

### Seven-Failure Trace and Acceptance Audit

- Shared Windows Node 20/22 failures 1–2 map to the two project-root display expectations in
  `cli.build.e2e` and `cli.project-reads`; failure 3 maps to the skill-install destination display expectation.
  All three now compare `toPosix(...)` while their real native `existsSync`, extraction, and scaffold checks are
  unchanged.
- Shared failure 4 maps to the ZIP version probe. `toolAvailable` now succeeds iff the unchanged production
  `runSync` returns normally; every thrown probe result is unavailable. There is no localized stderr matching or
  shared launcher change. A direct baseline-classifier probe reproduced the red logic: a real exit 7 produces
  `Command failed (exit 7)` and the former prefix test incorrectly classified it as available.
- Node-20-only failures 5–6 are the real tar/Git archive cases and failure 7 is the real Git-remote case. Moving
  the complete packager file into the serialized integration project applies the existing 60-second per-test
  budget. The 11 baseline cases are preserved and 2 deterministic availability cases are added; no global/unit
  timeout changed.
- Deterministic same-launcher coverage proves: command absent -> unavailable/no archive; non-zero probe ->
  unavailable/no archive invocation; zero probe + archive success; and zero probe + archive failure -> typed
  `zip failed` with partial output removed. Existing exact-set, stale-replacement, symlink, front-door transform,
  format-parity, local-push, and Git-remote cases all remain active.
- The four shared plus three Node-20-only failures therefore map exactly to the five bounded Follow-up #2
  corrections. No unrelated product policy, core boundary, workflow, dependency, or test-timeout expansion is
  present.

### Fresh Gate Evidence

- Packager integration: 13/13; combined corrected integration band: 42/42 across 4 files.
- Typecheck: PASS; Biome lint/core boundary: PASS (200 files); production build: PASS.
- Exact full regression: 1,288/1,288 across 99 files (started 13:28:07 UTC, duration 382.82s).
- File inventory, unchanged shell/config probes, tracked and untracked whitespace hygiene, and
  `git diff --check`: PASS.

### Outcome

**APPROVE** — 1 MEDIUM artifact finding auto-fixed; 0 open findings. All seven reported Windows failures are
covered by the bounded implementation and green local evidence. Story status is `done`; a fresh external Windows
Node 20/22 matrix remains the only empirical evidence not reproducible on this host.

## Senior Developer Review (AI) — Follow-up #2 Final Absorption

### Workflow and Exact-Diff Audit

- Re-invoked `bmad-story-automator-review` after worker absorption and re-audited the complete current diff from
  `c76a44b0aaccb2db68379abfd507e377c91fd442`. Customization again resolved to English/intermediate critical-only
  automation with no custom activation, project-context facts, or completion hook; parent-owned state,
  investigation, branch/integration, and `.serena/` surfaces remained untouched.
- The corrected live AC6/AC7, checked tasks, supersession boundary, seven-failure trace, File List, and QA evidence
  all remain present and coherent. The current five executable files independently reproduce the sorted
  path-and-SHA-256 composite `5f4f52361b8e31e66574e53da83d8e0505f7626e18b635d25a92cccd94acb9e7`.
- Absorption therefore changed no product/test bytes. All 11 baseline packager cases plus the 2 deterministic
  availability cases remain active; core, `src/util/shell.ts`, `vitest.config.ts`, package metadata, and CI
  configuration remain outside the delta. All seven external-failure mappings and the prior MEDIUM artifact fix
  remain closed.

### Fresh Gate Evidence

- Corrected integration band: 42/42 across 4 files (started 13:40:25 UTC, duration 43.33s).
- Typecheck: PASS; Biome lint/core boundary: PASS (200 files); production build: PASS.
- Composite, 99-file test inventory, protected-surface probes, staged-file inventory, tracked/untracked
  whitespace checks, and `git diff --check`: PASS.
- Because executable bytes are unchanged, the prior exact-final full regression remains authoritative:
  1,288/1,288 across 99 files (started 13:28:07 UTC, duration 382.82s).

### Outcome

**APPROVE** — 0 fresh findings and 0 open findings. The Follow-up #2 implementation, tests, and absorbed review
artifacts are final-review clean; story status is `done`. Fresh external Windows Node 20/22 CI remains the only
empirical evidence not reproducible on this host.

## Change Log

- 2026-08-20: Created the Phase-6 remediation story directly from the concluded investigation for dev-story
  execution; no Backlog.md or sprint-state mutation.
- 2026-08-20: Implemented all six bounded Windows CI corrections, generated QA automation evidence, passed the
  complete local gate, and moved the Phase-6 fix story to review.
- 2026-08-20: Independent review reconciled all 284 baseline failures to the six bounded fixes, corrected two
  stale LOW comments, passed focused/static/build/full gates, and approved the story as done pending external
  Windows CI confirmation.
- 2026-08-20: Re-invoked dev-story in review-continuation mode, absorbed the two approved comment corrections,
  verified byte-identical product/test inputs with focused/static/build gates, reconciled QA evidence, and
  returned the story to review.
- 2026-08-20: Final review cycle verified the unchanged 18-file composite, reran focused/static/built gates,
  confirmed all findings closed, and approved the story as done pending external Windows CI evidence.
- 2026-08-20: External CI Follow-up #2 corrected three portable-output expectations and ZIP availability,
  moved the real-subprocess packager suite into the integration project, regenerated QA evidence, passed the
  exact 1,288-test regression, and returned the story to review.
- 2026-08-20: Independent Follow-up #2 review reconciled all seven external failures, repaired one MEDIUM stale
  story-contract contradiction, passed focused/static/build/full gates, and approved the story as done pending
  fresh external Windows matrix evidence.
- 2026-08-20: Re-invoked dev-story in Follow-up #2 review-continuation mode, absorbed the corrected live
  AC6/AC7/tasks/notes and QA evidence, verified byte-identical product/test inputs with focused/static/build
  gates, and returned the story to review.
- 2026-08-20: Final Follow-up #2 review re-invoked story-automator-review, reproduced the five-file executable
  composite, passed focused/static/build and hygiene gates, found no fresh issue, and approved the story as done.
