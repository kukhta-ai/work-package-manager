# Test Automation Summary — TASK-109 fresh local packed-install journey

## Generated and Audited Tests

### Fresh consumer acceptance journey

- [x] `test/integration/distribution-preparation/packed-install.test.ts` copies the current feature source into
  a clean temporary Git repository, installs its locked dependencies, produces and inspects the real npm
  archive through Story 1.2, and persists the accepted report and `.tgz` outside that checkout.
- [x] The journey rejects bad syntax, a missing inspection report, and a report whose inspected artifact is
  missing with exit/status text that names the recovery command.
- [x] It deletes the entire packaged-source checkout before verification, freezes the exact inspected bytes
  into a distinct consumer input, and performs a normal npm tarball install with isolated HOME, USERPROFILE,
  workspace, cache, user config, and global prefix.
- [x] It invokes both actual npm-generated commands declared by the archive (`installer` and `wpm`), requires
  their exact installed version, resolves every revision-declared package path, and runs installed built-in
  template discovery from the isolated workspace.
- [x] It snapshots representative Codex and Claude Code personal/workspace directories and front doors before
  normal installation, then proves all six surfaces retain the same directory entries, bytes, and link targets.

### Contract, prerequisite, portability, and non-leakage tests

- [x] `test/unit/distribution-preparation/packed-install.test.ts` validates accepted/rejected/malformed and
  revision-mismatched reports against current archive bytes, including an arbitrary future required asset and
  aggregate installed-path omissions without artifact-type branches.
- [x] QA added focused executable-observation cases for a missing npm-generated shim, a nonzero installed-bin
  invocation, exact version success, and version drift. Each prerequisite failure names the affected command
  and a concrete recovery condition.
- [x] The unit contract also covers supported/unsupported Node, missing npm, and Unix/Windows package roots and
  shim invocation, including explicit `cmd.exe` use for Windows `.cmd` files.
- [x] `test/integration/distribution-preparation/public-surfaces.test.ts` keeps both new preparation modules in
  TypeScript/Biome while excluding them from `dist`, the npm ship allowlist, generated authoring deliverables,
  release credentials, publication automation, and public acquisition guidance.
- [x] Story 1.2 archive/preparation tests retain direct tar-byte validation, clean revision/source binding,
  exact-set evolution, aggregate violations, and package identity/bin/path evidence consumed by this journey.

## Acceptance-Criteria Coverage

- **AC 1 — exact inspected package installs without its source checkout:** the real journey packages a clean
  revision, records its accepted artifact, deletes the entire source copy, then successfully installs only a
  frozen copy of those archive bytes beneath the disposable consumer root.
- **AC 2 — every declared executable reports the installed version:** the report-driven loop discovers both
  actual npm shims, invokes each with `--version`, and requires `0.1.0`; focused negative cases cover missing,
  failed, and version-drift observations.
- **AC 3 — installed resources resolve without repository paths:** every declared expected path exists below
  the installed package root, the root is below the disposable consumer and not the deleted source, and the
  installed CLI successfully resolves the built-in `minimal` template.
- **AC 4 — installation is inert toward supported coding-agent configuration:** byte/link/tree snapshots prove
  the Codex `.agents` and `AGENTS.md` fixtures and Claude Code `.claude` and `CLAUDE.md` fixtures unchanged.
- **AC 5 — absent/unsupported prerequisites fail actionably:** coverage includes missing report, missing
  artifact, unsupported Node, missing npm, missing shim, failed invocation, wrong version, and install/resource
  guardrails, with nonzero outcomes and named recovery where applicable.
- TASK-109 acceptance criteria: **5/5 covered**.
- API endpoints: not applicable; this feature exposes no HTTP/service API.
- UI workflows and semantic locators: not applicable; this is a maintainer-only Node CLI/package journey.

## Verification

- QA-strengthened executable-observation unit file: **11/11 passed**.
- Real clean package -> source deletion -> packed-install journey: **2/2 passed in 73.53 seconds**.
- Final Story 1.2 + 1.3 package unit band: **33/33 passed across 4 files**.
- Final package preparation/install/public-surface plus built-bin/runtime integration band: **25/25 passed
  across 6 files in 152.84 seconds**.
- Focused total on the final QA diff: **58/58 passed across 10 files**.
- `npm run typecheck`: passed.
- `npm run lint`: passed, **217 files checked**.
- `npm run build`: passed; explicit inspection found no `distribution-preparation` output under `dist/`.
- `git diff --check`: passed.
- Stable product/test aggregate hash:
  `721d83f72943fbaa3398dad2ef82585bccb9660437e73040e9c01366df15fb6d`.
- Per the current direct-specialist fast-feedback policy, the one exact full `npm test` stable-diff gate is
  deliberately reserved for the independent reviewer.

## Test Quality

- Vitest 4.1.7 and the repository's existing unit/integration projects are used; no dependency, browser/API
  framework, retry layer, sleep, or production artifact-type inspector was added.
- Tests use isolated temporary repositories and consumer roots, behavior-oriented descriptions, explicit
  subprocess timeouts, and deterministic cleanup. The real acceptance test is independent of repository
  `dist/` and deletes its package source before consumer verification.
- Happy-path assertions cover the through-the-edges install/bin/resource/config journey. Critical failures
  cover input evidence and executable/prerequisite classification at the smallest deterministic boundary.
- A proposed subprocess-sabotage fixture was discarded after it proved slow and nondeterministic; the final
  suite keeps one real normal install and tests negative executable observations through a small synchronous
  contract seam.

## Deliberate Scope Deferrals

- Persisted artifact digests, candidate identity, and durable candidate evidence remain Story 1.4 / TASK-110.
- Read-only GitHub/npm staging assessment and dual-channel convergence remain Stories 1.5–1.7 /
  TASK-111–TASK-113.
- Agent skill/setup activation and cold installed-package-to-authoring handoff remain Epic 2.
- No publication, release, credential, remote write, public coordinate activation, or WPM setup behavior was
  introduced.

## Workflow Evidence

- The actual `bmad-qa-generate-e2e-tests` skill was invoked in YOLO mode for TASK-109 against Story 1.3 and
  the implemented packed-install journey.
- Customization resolved no activation prepend/append steps; the persistent `project-context.md` glob matched
  no files; no workflow override applied; the completion hook resolved empty.
- Existing framework selected: Vitest 4.1.7. API and UI generation steps were inapplicable; local maintainer
  subprocesses, exact archives, installed executables/resources, and inert configuration are this feature's
  through-the-edges surfaces.
- QA checklist verdict: **PASS**. Happy path and critical input/prerequisite errors are covered with clear,
  independent tests using standard Vitest APIs; all generated tests pass and this summary records coverage.

## Independent Review Verification

- The actual `bmad-story-automator-review` skill ran in automatic-fix mode. It confirmed and fixed **1 high +
  3 medium** findings: version-drift recovery, source-independent child environment and realpath confinement,
  Node-before-npm preflight ordering, and Windows `cmd.exe` percent expansion. **0 findings remain open.**
- Review-strengthened unit contract: **13/13 passed**. Final package unit band: **35/35 across four files**.
- Real clean package -> source deletion -> frozen-byte packed install: **2/2 passed in 80.51 seconds**.
- Complete focused reviewer band: **83/83 passed across 12 files**, including Task 1.2 package-boundary,
  inactive-distribution, runtime/bin, and generated-deliverable non-leakage regressions.
- `npm run typecheck`, `npm run lint`, exact `npx biome ci .` (**217 files**), `npm run build`, explicit `dist/`
  exclusion, JavaScript syntax checks, and `git diff --check`: passed.
- Exact stable-diff `npm test`: **1,368/1,368 tests across 109 files in 466.06 seconds**.
- Stable executable product/test hash:
  `6f9ff96d046ffa5f96c10bc5ad34f7d2f2658c90122e916ed3a65fc36e7bf2db`.
- No setup, candidate/digest, publication/release, public-coordinate, credential-use, remote-write, product CLI,
  or `src/core/**` scope leaked into TASK-109. Story 1.4 and later channel work remain deferred.
- Review customization resolved no prepend/append steps, matching project-context content, override, or
  completion hook. Verdict: **APPROVE; 5/5 ACs covered; 0 open findings.**
