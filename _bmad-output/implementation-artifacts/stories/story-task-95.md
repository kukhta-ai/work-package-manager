---
baseline_commit: 0dab4185146a551ff0b2756a2486cdaf783dc15d
---

# Story TASK-95: Apply the build's un-nesting and front-door strip to the git archive format

Status: done

## Story

As a work-package author,
I want `wpm build package --format git` to package the same transformed deliverable as the zip and tarball formats,
so that choosing the Git-backed archive format never leaks authoring-only files or changes the installable layout.

## Acceptance Criteria

1. A git-format build produces an archive whose root is the un-nested deliverable, identical in layout to the tarball and zip formats for the same project state.
2. The git-format archive excludes the workspace wrapper (authoring front door, authoring backlog, build-output directory) and disabled bundle directories.
3. The git-format archive contains the executor front door only under its canonical stripped name (`AGENTS.md` plus per-target aliases), never the reserved `_AGENTS.md` prefix.
4. Building the same project state in any supported format yields the same archive layout.

## Tasks / Subtasks

- [x] Add red tests that expose the Git-format divergence (AC: #1, #2, #3, #4)
  - [x] At the packager boundary, assert Git archives exactly the supplied shippable set, excludes an on-disk sentinel omitted from that set, and applies root and per-bundle front-door transforms.
  - [x] At the built-CLI boundary, compare normalized Git and tarball layouts for one authoring workspace; include an enabled bundle, executor-front-door aliases, and builder-only leak sentinels.
  - [x] Compare zip as well when the platform provides the existing `zip` executable; keep the test meaningful on platforms where it is unavailable.
- [x] Make the Git format consume the same prepared archive source as the other formats (AC: #1, #2, #3)
  - [x] Materialize only `PackageRequest.files`, preserving symlinks, and apply every `frontDoorTransform` before invoking Git.
  - [x] Archive that prepared tree at its root, without a `wip/` prefix and without reading the source repository's raw `HEAD` tree.
  - [x] Preserve the existing output name/extension and typed `ValidationError` behavior for Git/tool failures.
  - [x] Clean temporary staging and Git metadata on success and failure.
- [x] Prove cross-format parity and regression safety (AC: #1, #2, #3, #4)
  - [x] Normalize archive listings before comparison so format-specific directory entries do not create false differences.
  - [x] Confirm canonical front-door bytes and alias/scope symlinks still survive extraction.
  - [x] Run the focused adapter and build E2E tests, then the repository's full typecheck, Biome, and Vitest gates.

## Dev Notes

### Current defect and required behavior

- `computeBuildPlan` already supplies one sorted `shippable` file set and `frontDoorTransforms`. Tarball and zip consume both through `archiveSource`; Git currently bypasses both and runs `git archive ... HEAD` against `req.root`. In a workspace, Git finds the enclosing repository and can archive the builder checkout rather than the un-nested `wip/` deliverable. That is the sole behavioral gap this story closes.
- The authoritative contract is the Backlog.md TASK-95 record plus docs 06/10/12: every format packages the `wip/` deliverable un-nested; only planned shippable paths may enter; the workspace wrapper and disabled bundles never ship; `_AGENTS.md` is transformed to canonical executor surfaces at build time.
- The earlier task-83 implementation note that Git archives the source checkout's committed `HEAD` was an implementation choice, not the current boundary contract. TASK-95 supersedes it where it conflicts with cross-format layout parity. Git should still produce the archive through `git archive`, but from a tree representing the prepared ship set rather than the enclosing source repository.

### Architecture compliance

- Keep `src/core/operations/build.ts` pure and unchanged unless a test proves a missing policy input. It already computes the correct file set and transforms through the injected `FileSystem` port.
- Keep all staging, temporary Git object/index creation, filesystem effects, and subprocess calls in `src/adapters/packager.ts`. Nothing under `src/core/` may import Git/process/OS/filesystem libraries.
- Reuse the existing staging/copy/symlink logic. Do not duplicate transform policy or re-enumerate the project tree in the adapter; `PackageRequest.files` is the single source shared with dry-run and other package formats.
- A temporary Git index/tree is sufficient: official Git documentation states that `git write-tree` creates a tree object from the current index, and `git archive` accepts a tree-ish/tree ID. A commit and author identity are not required. This also removes the accidental dependency on the authoring workspace itself being a committed repository.

### Files being modified — current state / change / preserve

- `src/adapters/packager.ts`
  - Current: tarball/zip call `archiveSource`; transforms cause a staged copy of the planned file set. Git ignores `files` and `transforms`, archives `HEAD`, and exempts an empty file set.
  - Change: prepare the exact planned/transformed source for Git, write a Git tree from it, then archive that tree; make an empty ship set consistently invalid.
  - Preserve: POSIX-normalized returned output path, `.tgz` extension, typed errors, symlink preservation, verbatim executor-front-door content, and `finally` cleanup.
- `test/unit/adapters/packager.test.ts`
  - Current: Git test proves only that committed `HEAD` produces a tarball and explicitly asserts that Git ignores `files`; transform coverage exists only for tarball.
  - Change: replace that obsolete expectation with exact ship-set, transform, exclusion, and tarball-layout-parity assertions; retain clear typed-failure coverage.
  - Preserve: real-tool adapter testing, conditional zip coverage, output-path portability assertions, and push tests.
- `test/integration/cli.build.e2e.test.ts`
  - Current: workspace un-nesting/front-door/leak guards run against tarball; there is no Git-format workspace scenario.
  - Change: add a Git build from the real workspace flow and compare its normalized listing with tarball (and zip when available), while asserting the TASK-95 negatives directly.
  - Preserve: existing helper conventions, serial temp-workspace execution, and non-vacuous sentinel checks.

### Testing requirements

- Red phase must demonstrate the current defect before product changes: Git includes paths outside `files` and omits the requested front-door transform.
- Compare archive **layout** (normalized root-relative entry set), which is what all four ACs require. Do not assert byte-identical archives: gzip/zip metadata differs by backend.
- Include positive and negative proof together: `manifest.yml`, enabled bundle content, canonical root/bundle `AGENTS.md`, and target aliases are present; `wip/`, workspace-root sentinels, `builds/`, disabled/unlisted paths, and `_AGENTS.md` are absent.
- The pure build-plan tests already cover disabled-bundle pruning before the adapter. The Git adapter test must prove it honors the supplied plan exactly; together those boundaries prove AC #2 without weakening project validation.
- Run focused tests first, then `npm run typecheck`, `npm run lint`, and `npm test` (or the repository's equivalent scripts from `package.json`). Do not run Vitest projects concurrently; integration tests share built artifacts/resources.

### Previous-story and Git intelligence

- TASK-89 established the workspace `builds/` output and un-nested `wip/` root; its notes explicitly carried Git parity forward.
- TASK-90 introduced `frontDoorTransforms` and documented Git's bypass as TASK-95. Preserve its rule that author bytes are copied verbatim and aliases are relative symlinks.
- TASK-93 strengthened workspace E2E leak guards. Extend those guards rather than creating a separate test harness.
- Recent follow-up work keeps pure ship policy in `src/core/operations/build.ts` and format mechanics in the packager adapter. Stay on that seam.

### References

- [Source: backlog TASK-95 via `backlog task task-95 --plain`]
- [Source: docs/06-project-skeleton.md#Authoring-workspace-vs-shipped-artifact]
- [Source: docs/10-authoring-cli.md#Per-command-actions — `build package`]
- [Source: docs/12-builder-architecture.md#What-wpm-build-produces-un-nesting-exclusions-and-the-front-door-prefix-strip]
- [Source: docs/13-core-architecture.md#The-dependency-rule]
- [Source: src/core/operations/build.ts — `BuildPlan`, `shippableFiles`, `computeFrontDoorTransforms`]
- [Source: src/adapters/packager.ts — `createArchive`, `stageWithTransforms`, `createGitArchive`]
- [Source: https://git-scm.com/docs/git-write-tree.html]
- [Source: https://git-scm.com/docs/git-archive/2.46.0.html]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex (persistent BMAD worker)

### Implementation Plan

- Reuse the existing staging transform as the single prepared archive source.
- Make Git build an isolated index/tree from exactly that prepared source, then archive the tree ID.
- Prove exact-set behavior and cross-format parity at adapter and built-CLI boundaries.

### Debug Log References

- Create-story analysis: Git format archives raw `HEAD`; tarball/zip archive `BuildPlan.shippable` with transforms.
- Red unit run: `npx vitest run --project unit test/unit/adapters/packager.test.ts` — 2 expected failures (raw-HEAD leakage/prefix retention; non-repository failure).
- Red integration run against the pre-change build: TASK-95 built-CLI case failed because `--format git` exited 1.
- Green focused runs: packager adapter 9/9; TASK-95 built-CLI case 1/1; complete build E2E file 23/23.
- Review-continuation audit: accepted the reviewer's Git byte-preservation and Zip symlink fixes at the adapter boundary; corrected the remaining stale Zip success-test title.
- Post-review green run: packager adapter 10/10; TASK-95 built-CLI case 1/1; full Vitest suite 1,237/1,237 across 97 files; typecheck, Biome, build, and diff check clean.

### Completion Notes List

- Implemented Git-format packaging from an isolated prepared tree containing exactly the pure build plan's file set and front-door transforms; source-repository `HEAD`, `.gitignore`, and export attributes can no longer change the deliverable.
- Preserved the un-nested archive root, verbatim canonical front-door bytes, relative alias symlinks, `.tgz` naming, typed Git failures, and guaranteed temporary-directory cleanup.
- Added adapter and real built-CLI regressions for exact-set exclusion, workspace-wrapper leak guards, canonical root/bundle front doors, source-repository independence, and normalized cross-format layout parity. Zip parity remains conditional on the platform's existing `zip`/`unzip` tools, as required.
- Absorbed reviewer cycle 1 fixes: neutralized Git `ident`/`working-tree-encoding` and related content attributes, required Info-ZIP `-y` symlink preservation, and strengthened the Zip contract regression. No core-layer change was needed.
- Verification after review: adapter unit 10/10; TASK-95 integration 1/1; full Vitest suite 1,237/1,237 across 97 files; `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` all clean.
- BMAD `bmad-create-story`, `bmad-dev-story`, and `bmad-qa-generate-e2e-tests` workflows executed against TASK-95; the task-scoped QA summary records the coverage and checklist disposition.

### File List

- `_bmad-output/implementation-artifacts/stories/story-task-95.md`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-95.md`
- `src/adapters/packager.ts`
- `test/unit/adapters/packager.test.ts`
- `test/integration/cli.build.e2e.test.ts`

### Change Log

- 2026-08-19: Made Git archives consume the same un-nested, transformed shippable tree as tarball/zip; added unit and built-CLI parity regressions (TASK-95).
- 2026-08-19: Separate-lane `bmad-story-automator-review` fixed Git attribute byte mutation and Zip symlink dereferencing, strengthened regressions, and approved the story.
- 2026-08-19: Resumed `bmad-dev-story` after reviewer cycle 1, absorbed all four fixes, corrected the stale Zip test title, and revalidated the full 1,237-test gate.
- 2026-08-19: Separate-lane `bmad-story-automator-review` cycle 2 re-audited the worker-absorbed diff, found no new issues, and approved the exact final diff after a fresh full gate.

## Senior Developer Review (AI)

### Outcome

**APPROVE** — all TASK-95 acceptance criteria are implemented. The adversarial review found two blocking
format-parity defects and one test-quality gap; all were fixed automatically and the resulting gates are green.

### Acceptance-criteria audit

- **AC #1 — implemented.** Git always archives a temporary tree prepared from `PackageRequest.files`, so the
  archive is rooted at the un-nested deliverable and does not depend on an enclosing repository or `HEAD`.
- **AC #2 — implemented.** The adapter consumes only the pure build plan's file set; unit and built-CLI tests
  prove workspace/backlog/build-output and disabled-bundle sentinels are absent.
- **AC #3 — implemented.** The shared staging transform drops every `_AGENTS.md`, writes canonical `AGENTS.md`
  bytes verbatim, and creates target aliases as relative symlinks; extraction tests cover root and bundle scopes.
- **AC #4 — implemented after review fixes.** Git and tarball normalized layouts match. Zip now invokes
  Info-ZIP's documented `-y`/`--symlinks` mode, preventing planned aliases from being dereferenced into a
  different tree; the command contract is tested even when the local image has no Zip binary, and the existing
  real-tool parity branch remains active on environments with `zip` + `unzip`.

### Findings and automatic fixes

1. **HIGH — fixed:** shipped `.gitattributes` could still set `ident` or `working-tree-encoding`; `git add`
   therefore rewrote or transcoded author-owned bytes before `git archive`. A red regression reproduced the
   `$Id: …$` rewrite. The temporary repository's highest-precedence info attributes now neutralize every
   check-in/archive content transform (`text`, `eol`, `filter`, `ident`, `working-tree-encoding`,
   `export-ignore`, `export-subst`), and tests compare extracted binary bytes with the source.
   (`src/adapters/packager.ts`, `test/unit/adapters/packager.test.ts`)
2. **HIGH — fixed:** Info-ZIP follows symlinks by default. Existing `zip -r` could expand `.claude/skills` and
   front-door aliases, violating the exact layout parity required by AC #4. Zip now receives `-y`, with a
   deterministic fake-tool regression plus the conditional real-tool parity E2E.
   (`src/adapters/packager.ts`, `test/unit/adapters/packager.test.ts`)
3. **MEDIUM — fixed:** the existing Zip happy-path unit test accepted a `ValidationError` even after `zip -v`
   proved the tool existed, masking command-shape regressions. It now requires an archive whenever Zip is
   available. (`test/unit/adapters/packager.test.ts`)
4. **LOW — fixed:** a test comment claimed the ignored source tree was committed wholesale; it now describes
   the intentional tracked/untracked setup accurately. (`test/unit/adapters/packager.test.ts`)

Primary behavior references checked during review: Git `gitattributes` documents highest-precedence
`$GIT_DIR/info/attributes`, check-in transforms, and archive attributes; Info-ZIP documents `-y` as storing
symbolic links instead of their referenced content.

### File-list and task audit

- Every application file in the uncommitted diff is present in the story File List; story/QA artifacts are also
  listed. Backlog and `.bmad/` state changes are orchestration-owned and excluded from application review.
- Every checked task/subtask has corresponding implementation or automated evidence. No false completion claim
  remains.

### Verification

- Review red probe: adapter suite **2 failures** before fixes (Git byte rewrite; missing Zip `-y`).
- Focused green: adapter suite **10/10**; TASK-95 built-CLI E2E **1/1** (22 unrelated cases filtered).
- Static/build gate: `npm run typecheck`, `npx biome ci .`, `npm run build`, and `git diff --check` — passed.
- Full Vitest gate: **1,237/1,237 passed across 97 files**.
- Environment note: this image has no `zip`/`unzip`, so real three-format execution remains conditionally
  exercised where those tools are installed; the non-conditional fake-tool test proves the required `-y` call.
- Sprint sync: `sprint-status.yaml` contains only foundation tasks 1–33, so `task-95` has no mirror entry to sync;
  Backlog.md remains the authoritative story status.

_Reviewer: persistent separate-lane reviewer, `bmad-story-automator-review`, 2026-08-19._

### Review cycle 2 — worker-absorbed final diff

**APPROVE, clean.** The actual `bmad-story-automator-review` workflow was re-run after the persistent worker
absorbed cycle-1 fixes. No skill-specific `customize.toml` or matching team/user override exists, so workflow
defaults applied.

- Re-read the complete story/QA artifacts, Backlog.md TASK-95 contract, full application diff, and every source
  file in the story File List. There are no application File List discrepancies.
- Revalidated AC #1–#4 and every checked task/subtask. All remain implemented; no false completion claim exists.
- Confirmed cycle-1 **HIGH/HIGH/MEDIUM/LOW** findings remain closed: Git authored bytes survive `ident` and
  `working-tree-encoding`; Zip requests `-y`; a present Zip tool must produce an archive; the test commentary and
  title now accurately describe their contracts.
- No new CRITICAL, HIGH, MEDIUM, or LOW issue was found. No product or test file changed during cycle 2.
- Exact-final-diff gate: `npm run typecheck` passed; `npx biome ci .` checked 197 files; `npm run build` passed;
  adapter tests **10/10** passed; TASK-95 built-CLI E2E **1/1** passed (22 filtered); full Vitest
  **1,237/1,237** passed across 97 files; `git diff --check` passed.
- `task-95` is absent from the foundation-only `sprint-status.yaml`, so there is no mirror key to sync; Backlog.md
  remains authoritative and is intentionally untouched by the reviewer.

_Review cycle 2: persistent separate-lane reviewer, `bmad-story-automator-review`, 2026-08-19._
