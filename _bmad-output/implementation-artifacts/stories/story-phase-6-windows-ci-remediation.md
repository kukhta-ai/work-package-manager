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
6. ZIP unit coverage distinguishes spawn-absent, usable, and present-but-nonzero tools without changing the
   production `toolAvailable` behavior.

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
- [x] Correct the ZIP test harness's three-state probe model only (AC: 6)
  - [x] Keep production `toolAvailable` byte-for-byte unchanged
  - [x] Assert unavailable guidance only for spawn absence and typed ZIP failure when a process ran non-zero
- [x] Invoke QA automation and run the targeted path/platform bands plus typecheck, lint, build, full regression,
      and diff hygiene gates (AC: 1-6)

## Dev Notes

### Immutable remediation boundary

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
- Production `src/adapters/packager.ts::toolAvailable` is correct and must not change. Only the test helper may
  distinguish spawn absence, zero exit, and non-zero process exit.

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

### Completion Notes List

- Context resolution now follows the injected platform rather than the JavaScript host, preserving POSIX fake
  determinism and native Win32 drive-root results.
- Exactly five result/fake seams normalize portable paths after native filesystem work: project-root stdout,
  authoring-skill records, absolute memory-fake alias observations, skill-stub changed paths, and template-miss
  diagnostics. Relative alias targets are not rewritten.
- Cross-platform test harnesses now model the documented archive-output, alias, npm-command-shim, and ZIP probe
  contracts without changing Windows symlink policy or production archive-tool availability logic.
- QA evidence is recorded in
  `_bmad-output/implementation-artifacts/tests/test-summary-phase-6-windows-ci-remediation.md`; local automation
  is green and the external Windows Node 20/22 matrix remains the final empirical CI confirmation.
- The approved reviewer comments are absorbed without executable changes; the story is returned to `review`
  for the parent-owned Phase-6 integration decision.

### File List

- `_bmad-output/implementation-artifacts/stories/story-phase-6-windows-ci-remediation.md` (new)
- `_bmad-output/implementation-artifacts/tests/test-summary-phase-6-windows-ci-remediation.md` (new)
- `src/adapters/memory-fs.ts`
- `src/cli.ts`
- `src/core/operations/install-authoring-skill.ts`
- `src/core/operations/scaffold-skill.ts`
- `src/core/services/context.ts`
- `src/core/services/template-resolver.ts`
- `test/integration/adapters/node-fs.test.ts`
- `test/integration/cli.build.e2e.test.ts`
- `test/integration/cli.init.test.ts`
- `test/integration/core-boundary.test.ts`
- `test/integration/docs-template-examples.e2e.test.ts`
- `test/unit/adapters/memory-fs.test.ts`
- `test/unit/adapters/packager.test.ts`
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
