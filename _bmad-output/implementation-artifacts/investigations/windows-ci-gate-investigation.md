# Investigation: Windows CI Gate Failures

## Hand-off Brief

1. **What happened.** Confirmed: GitHub Actions run `32355637349` failed the same 284 tests on Windows/Node 20 and Windows/Node 22 at commit `4547434117562bb79a9dfe0e670f66934a8034e4`, after install, type-check, lint/boundary enforcement, and build had passed.
2. **Where the case stands.** Concluded with Medium confidence: the complete failure set partitions into six bounded mechanisms, and the ZIP member is a unit-harness three-state classification defect rather than a production `toolAvailable` defect or a demonstrated broad runtime CLI failure.
3. **What's needed next.** Apply the six seam-scoped corrections through `bmad-quick-dev`—leaving production `toolAvailable` unchanged—then prove them with the targeted Windows bands and complete Node 20/22 plus Ubuntu/macOS gate below.

## Case Info

| Field | Value |
| --- | --- |
| Ticket | PR #3 / GitHub Actions run `32355637349` |
| Date opened | 2026-08-20 |
| Status | Concluded |
| System | `windows-latest`, Node 20 and Node 22; comparison jobs on Ubuntu and macOS |
| Evidence sources | GitHub Actions run/job metadata and logs; branch `feature/authoring-context`; workflow/configuration; package scripts and lockfile; tests/source; git history |

## Problem Statement

The supplied report says that Phase-7 PR #3 run `32355637349` fails on Windows Node 20/22 with `(a) spawnSync backlog ENOENT` in `test/integration/docs-template-examples.e2e.test.ts`, `(b) NodeFileSystem symlink-mode tests expecting `symlink` but receiving `copy` at `node-fs.test.ts:118/136`, and likely core-boundary path/import failures; macOS/Ubuntu failures are described as a separately fixed stale-ZIP issue. These claims are inputs to verify, not established facts.

## Evidence Inventory

| Source | Status | Notes |
| --- | --- | --- |
| GitHub Actions run `32355637349` metadata | Available | Confirms both Windows matrix jobs failed only at the test step; type-check, lint/boundary gate, and build passed. |
| GitHub Actions Windows/Node 22 failed-step log | Available | Job `96384106228`; about 1,175,772 bytes / 9,805 lines; 41/99 files and 284/1,278 tests failed, 994 tests passed, no timeouts. |
| GitHub Actions Windows/Node 20 failed-step log | Available | Job `96384106372`; about 1,177,972 bytes / 9,823 lines; the same 41 files and 284 tests failed, 994 tests passed, no timeouts. |
| Exact cross-job failure-set manifest | Available | The sorted failed-test sets are identical (SHA-256 `8090499cd05886058e7756c2aa59a6dc372cde16ddf6303e6dd2b30eadd710ed`); every inventoried failure occurs on both Node versions. |
| Workflow at failing SHA | Available | `.github/workflows/ci.yml:41`-`.github/workflows/ci.yml:45` deliberately provides an OS/Node matrix; `.github/workflows/ci.yml:61`-`.github/workflows/ci.yml:64` incorrectly says no integration test invokes `backlog` and adds no explicit provisioning. |
| Package/tool provisioning at failing SHA | Available | `package.json:10`-`package.json:16` declares `backlog.md` as a required peer; lockfile resolves `backlog.md@1.45.2`, its `backlog` bin, and the Windows x64 optional package. |
| Source and tests at failing SHA | Available | Relevant files are present and bounded: `src/adapters/node-fs.ts` (97 lines), adapter integration test (183), docs E2E (127), boundary integration test (129), workflow (86), and package manifest (60). |
| Static-analysis evidence | Available | Both Windows jobs passed `tsc` and the dedicated Biome/core-boundary lint step; the Vitest boundary self-test separately failed at `test/integration/core-boundary.test.ts:99:22`. |
| Historical CI evidence | Partial | The only three runs on the PR branch all failed; no successful CI run exists in repository history. June runs `27141875384` and `27141919613` failed before useful step-level evidence. |
| Issue tracker | Missing | No matching issue was found for Windows CI, symlink, or `spawnSync backlog`. |
| Relevant diagnostic archive | Missing | No local diagnostic archive/log contains this run; authoritative logs are remote GitHub job logs. |
| Persistent project facts (`**/project-context.md`) | Missing | The configured glob matched no file. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --- | --- | --- | --- |
| 1 | Capture the exact failure set for both Windows jobs | High | Done | 284 failures across 41 files; identical on Node 20/22; no timeouts. |
| 2 | Trace `spawnSync backlog ENOENT` through test setup and CI provisioning | High | Done | Package is provisioned and production Execa path works; this E2E helper directly invokes an npm `.cmd` shim with `execFileSync`, which Node does not support on Windows. |
| 3 | Trace NodeFileSystem symlink behavior, privileges, fallback policy, and test contract | High | Done | Adapter unconditionally copies on `win32` per docs 12/13; three tests assert POSIX symlink identity without a Windows guard. Runner privilege is not consulted. |
| 4 | Verify or refute core-boundary path/import test failures | High | Done | Rule/lint gate passed. The self-test directly executes the extensionless npm Biome shim through `execFileSync`, catches the spawn error, and asserts against empty output. |
| 5 | Compare historical cross-platform CI evidence and relevant commits | Medium | Done | No successful run is available, but commits `4eb869c` and `b998a11` establish the native-I/O/POSIX-logical-path split and Execa command-shim pattern; later commits introduced the uncovered seams. |
| 6 | Separate stale-ZIP failures from Windows-only mechanisms | Medium | Done | Stale archive membership is independent; the Windows unit helper collapses a present-but-nonzero probe into “absent,” while production `toolAvailable` correctly distinguishes that state from spawn failure and requires no change. |
| 7 | Explain the 280 failures outside the four initially named tests | High | Done | Exhaustive partition below accounts for all 284 tests and distinguishes cascades from independent failures. |
| 8 | Trace the exact source/caller chain for each confirmed mechanism | High | Done | Outcome 4 maps six mechanisms and every affected test to the narrowest correction boundary; see Source Code Trace. |

## Timeline of Events

| Time | Event | Source | Confidence |
| --- | --- | --- | --- |
| 2026-05-31 | The core-boundary test, NodeFileSystem adapter/test, and CI matrix entered history in tasks 5, 12, and 8 respectively. | Commits `f1047a2`, `1d1ba92`, `8fde536` | Confirmed |
| 2026-06-02 11:09:19Z | A prior Windows repair established the project rule: real filesystem/process paths remain native; logical, stored, returned, displayed, and compared paths use POSIX separators. | Commit `4eb869c` | Confirmed |
| 2026-06-02 12:08:01Z | A prior Windows repair replaced raw `execFileSync("backlog")` test calls with Execa and normalized fake Backlog keys. | Commit `b998a11` | Confirmed |
| 2026-06-07 03:25:41Z | `wpm skill install` added new HOME-rooted path results without applying the established logical-result normalization seam. | Commit `a71ccb4` | Confirmed |
| 2026-06-07 05:15:37Z | Workspace resolution was expanded across the CLI using host-default `node:path`, while its injected `Environment.platform()` remained unused. | Commit `56ba2d9` | Confirmed |
| 2026-06-07 07:13:16Z | Workspace-layout test migration retained an unconditional POSIX symlink-identity assertion in the real CLI-init suite. | Commit `f19aff9` | Confirmed |
| 2026-06-08 | Two PR-branch CI runs failed before producing useful step-level test evidence. | Runs `27141875384`, `27141919613` | Confirmed |
| 2026-08-19 19:56:20Z | The docs-template E2E test that invokes `backlog` was introduced. | Commit `a46560df67824a20e3083ee14294bf29144a97c7` | Confirmed |
| 2026-08-20 09:47:02Z | Run `32355637349` started for branch `feature/authoring-context`, SHA `4547434117562bb79a9dfe0e670f66934a8034e4`. | GitHub Actions run metadata | Confirmed |
| 2026-08-20 10:11:23Z | Windows/Node 22 test step failed after setup, dependency install, type-check, lint, and build succeeded. | GitHub Actions job `96384106228` metadata | Confirmed |
| 2026-08-20 10:13:40Z | Windows/Node 20 test step failed after setup, dependency install, type-check, lint, and build succeeded. | GitHub Actions job `96384106372` metadata | Confirmed |
| 2026-08-20 | Commit `15b671e` fixed stale Info-ZIP replacement after the failing SHA; it did not change the independent unit-harness probe classification or production `toolAvailable`. | `git show 15b671e` | Confirmed |

## Confirmed Findings

### Finding 1: Both supported Windows Node matrix jobs fail in the test step

**Evidence:** GitHub Actions run `32355637349`, jobs `96384106228` and `96384106372`, commit `4547434117562bb79a9dfe0e670f66934a8034e4`.

**Detail:** Checkout, Node setup, dependency installation, `tsc --noEmit`, Biome/core-boundary lint, and build all succeeded in both Windows jobs; `vitest run` failed in both.

### Finding 2: Node 20 and Node 22 produced the same broad failure set

**Evidence:** GitHub Actions job logs `96384106228` and `96384106372`; sorted failure-set digest `8090499cd05886058e7756c2aa59a6dc372cde16ddf6303e6dd2b30eadd710ed`.

**Detail:** Each job reports 41 failed / 58 passed test files and 284 failed / 994 passed tests (1,278 total), with no timeout. The failed-test set difference is empty, ruling out a Node-major-specific inventory.

### Finding 3: Every initially named Windows failure is present, but they are not the complete set

**Evidence:** Both Windows job logs: `test/integration/docs-template-examples.e2e.test.ts:66:30` (`spawnSync backlog ENOENT`); `test/integration/adapters/node-fs.test.ts:118:27` and `:136:27` (`copy` vs `symlink`); `test/integration/core-boundary.test.ts:99:22` (empty output lacks `noRestrictedImports`).

**Detail:** Those four tests are present in both jobs. An additional 280 tests fail, including widespread CLI/context/path assertions, a build E2E path assertion, scope-alias behavior, and the packager error assertion at `test/unit/adapters/packager.test.ts:400:45`.

### Finding 4: CI installs the Backlog.md package but does not explicitly provision its command for the new E2E test

**Evidence:** `.github/workflows/ci.yml:57`-`.github/workflows/ci.yml:66`; `package.json:10`-`package.json:16`; `package-lock.json` entry `node_modules/backlog.md` at failing SHA.

**Detail:** `npm ci` installs required peer `backlog.md@1.45.2`, whose package exposes the `backlog` bin and selects a Windows x64 optional package. The workflow comment still states that no integration test invokes the command, despite commit `a46560d` adding one.

### Finding 5: The complete failure set partitions into six bounded mechanisms

**Evidence:** Windows job logs `96384106228` and `96384106372`; exhaustive mutually exclusive sum `261 + 16 + 1 + 3 + 2 + 1 = 284`.

| Mechanism | Tests | Grade | Defect class |
| --- | ---: | --- | --- |
| `resolveContext` uses host-default path semantics instead of the injected environment platform | 261 | Confirmed at the resolver; Deduced for the 248-test CLI cascade | Core/fake determinism seam; not an observed real-filesystem Windows product failure |
| Native paths cross into logical results or deterministic fake observations without POSIX normalization | 16 | Confirmed | Five result/fake choke points; real filesystem I/O remains native |
| Build E2E expects a native `\\` output although the packager contract deliberately returns portable `/` | 1 | Confirmed | Test expectation |
| Tests demand symlink identity where the documented Windows adapter policy returns a copy | 3 | Confirmed | Test platform guard/expectation |
| Tests directly launch npm command shims with `execFileSync` | 2 | Confirmed/Deduced | Test subprocess harness |
| The ZIP unit helper collapses present-but-nonzero and absent probes into one boolean state | 1 | Confirmed | Test-harness three-state classification; production `toolAvailable` is correct |

**Detail:** This partition is exhaustive by failed test, not a sampling of error strings. It refutes both a single universal cause and the original three-family inventory. The first two mechanisms are one broad path-semantics family, but their correction boundaries differ: platform-selected path operations for context versus normalization only where native paths become logical/fake-observable values.

### Finding 6: The 248 CLI failures cascade from a host-dependent fake-path seam

**Evidence:** `src/core/services/context.ts:1`, `src/core/services/context.ts:121`-`src/core/services/context.ts:133`; `src/adapters/memory-fs.ts:9`-`src/adapters/memory-fs.ts:34`; direct failures in `test/unit/services/context.test.ts` and `test/unit/services/context.acceptance.test.ts`.

**Detail:** `resolveContext` uses the host-default `node:path` implementation. The in-memory filesystem and fixtures deliberately use POSIX absolute paths such as `/proj`, and `FakeEnvironment` defaults its reported platform to Linux, but the path calculations ignore that injected platform. On Windows, absolute override resolution may acquire the runner drive and returned joins use backslashes; five direct resolver tests become `found:false`, eight return native separators, and 248 command tests then fail at the shared pre-command workspace gate or its immediate output assertions. Node documents that default `node:path` behavior varies by host OS: [Node.js path: Windows vs. POSIX](https://nodejs.org/api/path.html#path_windows_vs_posix).

### Finding 7: Real-filesystem Windows evidence refutes a broad product-CLI failure

**Evidence:** Windows job `96384106228` log: `test/integration/cli.bundle-lifecycle.e2e.test.ts`, `test/integration/cli.project-meta.e2e.test.ts`, `test/integration/cli.project-reads.test.ts`, `test/integration/adapters/backlog-parity.test.ts`, and `test/integration/cli.bin.test.ts` all pass.

**Detail:** Those tests exercise the built binary, workspace resolution, real temp paths, Backlog.md through the production adapter, and representative authoring commands on the same Windows host. The bulk failure is therefore the POSIX virtual-fixture/native-path mismatch, not evidence that the built CLI cannot resolve or operate on genuine Windows workspaces.

### Finding 8: Windows copy fallback is intentional and unconditional

**Evidence:** `src/util/symlink.ts:64`-`src/util/symlink.ts:76`; `docs/12-builder-architecture.md:34`; `docs/13-core-architecture.md:79`; failing assertions `test/integration/adapters/node-fs.test.ts:118`, `test/integration/adapters/node-fs.test.ts:136`, and `test/integration/cli.init.test.ts:352`.

**Detail:** `process.platform === "win32"` selects copy before any symlink attempt. The same adapter test file already verifies the forced Windows copy branch. The two tests named “on POSIX” and the CLI-init assertion are not guarded on Windows. GitHub runner symlink privilege is therefore neither observed nor causal: the production code never tests it.

### Finding 9: Both command-resolution failures are Windows-incompatible test helpers

**Evidence:** `test/integration/docs-template-examples.e2e.test.ts:38`-`test/integration/docs-template-examples.e2e.test.ts:43`; `test/integration/core-boundary.test.ts:19`-`test/integration/core-boundary.test.ts:21`, `test/integration/core-boundary.test.ts:48`-`test/integration/core-boundary.test.ts:58`; Windows job logs.

**Detail:** The docs E2E test calls bare `backlog` through `execFileSync`; the boundary self-test calls the extensionless `node_modules/.bin/biome` npm shim the same way and then discards the caught spawn error, leaving empty output. Node documents that `.cmd` shims cannot be invoked directly with `execFile` on Windows: [Node.js child processes: spawning `.bat` and `.cmd`](https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows). Provisioning is not absent: the lockfile installs the Windows Backlog binary, and the production Execa/cross-spawn adapter tests pass in the same jobs.

### Finding 10: The ZIP unit helper collapses a present-but-unusable command into “absent”

**Evidence:** `test/unit/adapters/packager.test.ts:28`-`test/unit/adapters/packager.test.ts:37`, `test/unit/adapters/packager.test.ts:370`-`test/unit/adapters/packager.test.ts:400`; `src/util/shell.ts:60`-`src/util/shell.ts:79`; `src/adapters/packager.ts:95`-`src/adapters/packager.ts:114`, `src/adapters/packager.ts:319`-`src/adapters/packager.ts:350`; Windows job `96384106228` log at the `packager.test.ts:400` failure.

**Detail:** `runSync` emits `Command could not be run` only when no process starts and `Command failed (exit N)` when a process starts but exits non-zero. Production `toolAvailable` intentionally returns false for the former and true for the latter, then preserves a later archive-invocation failure as typed `zip failed`; this is the documented three-state behavior. The test helper's `has()` catches both `execFileSync` failure shapes and returns the same `false`, so it enters the absent-tool assertion even when the production-compatible probe reached a present-but-unusable command. The log's `Command failed (exit 1)` and subsequent `zip failed` result agree with production semantics; the misleading command-not-recognized stderr does not turn a process exit into a spawn failure. Only the test helper/expectation needs correction, and stale ZIP entries remain independent.

### Finding 11: The core-boundary invariant itself did not fail

**Evidence:** `.github/workflows/ci.yml:75`-`.github/workflows/ci.yml:76`; both Windows job step results; `test/integration/core-boundary.test.ts:48`-`test/integration/core-boundary.test.ts:59`.

**Detail:** The dedicated Biome step enforcing the rule passed. Only its subprocess-driven self-test failed because it asserted on empty captured output after a swallowed spawn failure. No forbidden production import is reported.

### Finding 12: The other 16 unit-path failures terminate at five logical-result or fake-observation seams

**Evidence:** `src/cli.ts:2947`-`src/cli.ts:2948`; `src/core/operations/install-authoring-skill.ts:102`-`src/core/operations/install-authoring-skill.ts:191`; `src/core/operations/lifecycle.ts:244`-`src/core/operations/lifecycle.ts:246`; `src/core/operations/init-project.ts:378`-`src/core/operations/init-project.ts:402`; `src/adapters/memory-fs.ts:200`-`src/adapters/memory-fs.ts:226`; `src/core/operations/scaffold-skill.ts:60`-`src/core/operations/scaffold-skill.ts:87`; `src/core/services/template-resolver.ts:143`-`src/core/services/template-resolver.ts:154`; commit `4eb869c`.

| Producer | Tests | Native work that must stay native | Narrow logical/fake seam |
| --- | ---: | --- | --- |
| `project root` renderer | 1 | `resolveContext` returns the real root | Normalize only the printed root. |
| Authoring-skill scope/destination results | 4 | `exists`, `copyTree`, and destination joins | Normalize the structured/displayed scope, destination, and `changedPaths` values. |
| In-memory alias target observation | 7 | `applyRerender`/`initProject` pass native absolute targets to `FileSystem.ensureAlias` | Normalize only absolute targets when the POSIX `MemoryFileSystem` records them; preserve relative targets such as `install-backlog` verbatim. |
| Skill-stub return | 2 | `fs.exists`/`fs.write` use the native `stubAbs` | Normalize the returned changed-path string. |
| Template not-found diagnostic | 2 | Candidate paths used by `fs.exists`/`fs.read` remain native | Normalize only the returned `searched` diagnostic paths. |

**Detail:** The sum is exactly `1 + 4 + 7 + 2 + 2 = 16`. Commit `4eb869c` already defines the governing distinction: native paths remain native while performing filesystem/process effects; values become POSIX only when stored, returned/displayed as logical results, compared, or exposed through a deterministic POSIX fake. Blanket conversion at the input or filesystem boundary would mask genuine Windows behavior and is not the correction.

## Deduced Conclusions

### Deduction 1: One broad path family has two different correction boundaries

**Based on:** Findings 2, 6, 7, and 12.

**Reasoning:** Both Node versions have the same failures; direct resolver tests show host-separator and `found:false` changes; 248 unrelated CLI tests terminate at the same pre-command gate; 16 other tests preserve their underlying effect but expose a native separator at a logical/fake boundary; built-binary tests using real Windows paths pass.

**Conclusion:** The 277-test path group is not 277 regressions and must not be fixed by globally forcing POSIX paths. `resolveContext` must select its path dialect from the injected platform; the other five producers keep native effect paths and normalize only their logical/fake-observable result.

### Deduction 2: The Windows gate does not require a ZIP adapter probe change

**Based on:** Findings 5, 8, 9, and 10.

**Reasoning:** Symlink assertions contradict the documented copy policy; two subprocess helpers bypass the Windows-aware Execa path; the package-output assertion contradicts an explicit POSIX-return contract. For ZIP, `runSync` and `toolAvailable` already distinguish spawn failure from a process that exits non-zero, whereas the unit helper maps every thrown `execFileSync` result to the single boolean `false` and therefore selects the wrong assertion branch.

**Conclusion:** Treating the ZIP failure as a product change would erase a deliberate adapter distinction. The coherent remediation has separate path/fake, subprocess-harness, platform-expectation, portable-output, and test-only ZIP three-state-classification parts; production `toolAvailable` remains unchanged.

### Deduction 3: Runner symlink privilege cannot explain the observed copy results

**Based on:** Finding 8.

**Reasoning:** The adapter selects copy solely from `process.platform` and never attempts `symlinkSync` on Windows.

**Conclusion:** A privilege probe would not change or further diagnose this run; changing to attempt-and-fallback would be a product-policy refinement beyond the CI repair.

## Hypothesized Paths

### Hypothesis 1: Three Windows-specific defect families account for the Windows job failures

**Status:** Refuted

**Theory:** The exact Windows failure set consists of an unresolved `backlog` executable in the docs-template E2E test, symlink-to-copy fallback that conflicts with unit-test expectations, and one or more path/import assertions in core-boundary tests.

**Supporting indicators:** The user supplied exact error/test locations; both Windows Node versions fail after otherwise successful gate setup.

**Would confirm:** Matching failures in both Windows job logs plus source/configuration traces that explain each outcome.

**Would refute:** Logs omit one or more claimed failures, show different errors, or source/history demonstrates a different mechanism.

**Resolution:** Both job logs contain the three named families, but the identical inventory has 284 failed tests across 41 files. The proposed three-family enumeration is therefore incomplete.

### Hypothesis 2: A small number of Windows platform-boundary mechanisms fan out into most of the 284 failures

**Status:** Confirmed

**Theory:** Platform-native path semantics, command resolution, and symlink fallback may independently produce a small number of upstream conditions that cascade through many tests.

**Supporting indicators:** Failure sets are identical across Node 20/22; representative assertions contain backslash/forward-slash mismatches, workspace-resolution failures, `backlog` ENOENT, and symlink/copy mismatches.

**Would confirm:** Causal tracing maps most failed assertions to a bounded set of shared Windows-specific producers.

**Would refute:** Each failure family traces to unrelated defects with no shared producer or platform boundary.

**Resolution:** Six bounded mechanisms exhaustively account for all failures. Two path mechanisms account for 277, and bounded command-shim and symlink-test mechanisms account for five more. Refutation found two independent single-test mechanisms: a wrong package-output expectation and a ZIP unit helper that collapses three process states; therefore no universal single cause exists.

### Hypothesis 3: The bulk CLI failures are genuine Windows product failures

**Status:** Refuted

**Theory:** Windows path handling prevents normal users from resolving or operating on authoring workspaces.

**Supporting indicators:** 248 unit CLI tests reject their workspace or exit with the wrong code.

**Would confirm:** Built-binary tests using genuine Windows temp paths fail the same workspace/command flows.

**Would refute:** Real-filesystem Windows flows pass while POSIX in-memory fixtures fail direct resolver/path assertions.

**Resolution:** The latter is observed. Multiple built-binary suites and the real Backlog adapter pass; direct fake resolver tests expose POSIX fixture/native `node:path` mixing.

### Hypothesis 4: The Windows runner lacks privileges needed by code that attempts symlinks

**Status:** Refuted

**Theory:** An attempted Windows symlink fails for lack of elevation, forcing an unexpected fallback.

**Supporting indicators:** Three assertions receive copy/non-symlink behavior.

**Would confirm:** A logged failed symlink attempt or source branch driven by an OS privilege error.

**Would refute:** Source chooses copy from platform before attempting a symlink.

**Resolution:** `src/util/symlink.ts:64`-`src/util/symlink.ts:76` takes the platform branch unconditionally, exactly as docs 12/13 specify.

### Hypothesis 5: CI failed to install Backlog.md for the docs example

**Status:** Refuted

**Theory:** `npm ci` omitted the Backlog.md executable.

**Supporting indicators:** The docs E2E test reports `spawnSync backlog ENOENT`.

**Would confirm:** Lockfile/install evidence lacks the package or all real Backlog integrations fail.

**Would refute:** The Windows package is installed and Windows-aware production calls pass.

**Resolution:** The lockfile installs `backlog.md@1.45.2` plus its Windows x64 binary, and real adapter/built-binary Backlog flows pass. Only the raw `execFileSync` helper fails on the npm command shim.

### Hypothesis 6: A forbidden core import broke the Windows boundary gate

**Status:** Refuted

**Theory:** The repository violates `noRestrictedImports` on Windows.

**Supporting indicators:** The boundary integration test fails.

**Would confirm:** The dedicated Biome step reports a forbidden import.

**Would refute:** The enforcement step passes and only the self-test's diagnostic subprocess fails.

**Resolution:** Both Windows Biome steps passed; the self-test suppresses its npm-shim spawn failure and then sees empty output.

### Hypothesis 7: The Windows packager assertion is another stale-ZIP symptom

**Status:** Refuted

**Theory:** Info-ZIP update semantics retain stale entries and cause the Windows packager test failure.

**Supporting indicators:** ZIP behavior independently failed on the same matrix run.

**Would confirm:** The failing assertion compares archive membership across successive builds.

**Would refute:** The failure concerns probe/invocation classification before an archive is produced rather than archive membership across successive builds.

**Resolution:** The helper's version probe selects its “absent” branch, while production reaches archive invocation and returns typed `zip failed`; no archive-membership comparison is involved. Commit `15b671e` addresses stale replacement but leaves this independent test-harness path unchanged.

### Hypothesis 8: `toolAvailable` misclassifies the Windows missing-command result

**Status:** Refuted

**Theory:** The probe treats a non-zero command-wrapper result as evidence that `zip` exists, then invokes it again and maps the failure to the wrong product error.

**Supporting indicators:** The log contains `Command failed (exit 1): zip ...` and Windows command-not-recognized text.

**Would confirm:** `runSync` reports a spawn failure (`Command could not be run`, with no process exit code) and `toolAvailable` nevertheless returns true.

**Would refute:** Source returns false for spawn failure and true only for the distinct case where a process ran and exited non-zero.

**Resolution:** Refuted by `src/util/shell.ts:60`-`src/util/shell.ts:79` and `src/adapters/packager.ts:104`-`src/adapters/packager.ts:114`: the adapter uses two explicit error shapes and preserves their intended distinction. The Windows log contains `Command failed (exit 1)`, not the spawn-failure shape, so proceeding to `runArchiveTool` and returning typed `zip failed` is consistent with the production contract despite the stderr wording.

### Hypothesis 9: The ZIP unit helper collapses present-but-unusable and absent into one state

**Status:** Confirmed

**Theory:** The test-only `has()` helper returns false for any `execFileSync` exception, causing a present-but-nonzero command to enter the absent-tool assertion branch.

**Supporting indicators:** The helper has an unqualified `catch { return false; }`; the selected test title says “when zip is absent,” but production reaches archive invocation and returns `zip failed` after a process exit.

**Would confirm:** Source shows one boolean false branch for both spawn failure and non-zero exit, and the log shows the production non-zero-exit path.

**Would refute:** The helper independently distinguishes no-process spawn failure from a process exit and selects an expectation for each.

**Resolution:** Confirmed at `test/unit/adapters/packager.test.ts:28`-`test/unit/adapters/packager.test.ts:37` and `test/unit/adapters/packager.test.ts:370`-`test/unit/adapters/packager.test.ts:400`, cross-checked with the `Command failed (exit 1)`/`zip failed` log. The correction belongs only in the test's state classifier and conditional expectations.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | --- | --- |
| Whether the GitHub runner grants symlink creation privileges | No impact on this incident because production never attempts a symlink on `win32`; relevant only to a future policy change | Add an explicit runner probe only if the documented copy policy is reconsidered. |
| Prior passing Windows run | Prevents empirical regression pinpointing | Unavailable: no successful CI run exists in repository history. A future fixed run can become the baseline. |
| Post-fix Windows evidence | Prevents proving the six-mechanism remediation closes the complete set | Run targeted tests, then the full matrix and require that none of the recorded 284 tests remains failed on either Windows Node version. |

## Source Code Trace

| Element | Detail |
| --- | --- |
| Trigger | `.github/workflows/ci.yml:85` runs the full Vitest suite after install, type-check, lint/boundary enforcement, and build have passed. |
| Condition | `windows-latest`, Node 20 and Node 22, failing SHA `4547434117562bb79a9dfe0e670f66934a8034e4`. |
| Failure inventory | 284 tests in 41 files on each Node version; six source/caller mechanisms below sum exactly to 284. |
| Area boundary | No workflow, dependency-install, TypeScript, build, or forbidden-core-import failure occurred. The fault perimeter is path-result/fake semantics, platform-specific test behavior, two test subprocess launchers, and a ZIP unit-helper state-classification mismatch. |

### Mechanism 1 — context path dialect ignores the injected platform (261 tests)

- **Origin:** `src/core/services/context.ts:1` binds host-default `dirname`, `join`, and `resolve`; those functions produce the marker probe, returned deliverable, override resolution, and parent walk at `src/core/services/context.ts:87`-`src/core/services/context.ts:91` and `src/core/services/context.ts:114`-`src/core/services/context.ts:139`.
- **Injected state ignored:** `src/adapters/fake-env.ts:26`-`src/adapters/fake-env.ts:39` defaults to a Linux platform and POSIX cwd, while `src/adapters/memory-fs.ts:9`-`src/adapters/memory-fs.ts:34` promises a host-independent POSIX namespace.
- **Caller chain:** every project-bound command calls `src/cli.ts:239`-`src/cli.ts:248` (`requireProject`) → `resolveContext` → `FileSystem.exists`. A missed marker becomes the canonical no-workspace error before command-specific logic runs.
- **Observed effect:** 13 direct context failures (five `found:false`, eight separator mismatches) plus the 248-test CLI cascade. The direct failures are Confirmed; membership of all 248 downstream tests is Deduced from their common gate symptom and shared caller.
- **Smallest correction:** select `node:path.posix` or `node:path.win32` once from `env.platform()` and use it consistently for marker probes, `resolve`, `join`, `dirname`, and returned roots. Keep `WORKSPACE_MARKER` as a stable POSIX logical relative path. This makes the default Linux fake deterministic on any host while `ProcessEnvironment` still yields native `C:\\...` roots on genuine Windows.
- **Required proof:** retain the existing POSIX fake cases and add an explicit `FakeEnvironment({ platform: "win32", cwd: "C:\\\\work\\\\proj\\\\..." })` case that returns native Windows roots. This prevents a false repair that globally forces POSIX behavior.

### Mechanism 2 — native paths cross five logical-result/fake seams (16 tests)

The effects themselves succeed; only the returned, displayed, diagnostic, or fake-observable value has the wrong path kind. Commit `4eb869c` is the established design: native filesystem/process paths stay native, and `toPosix` is applied only where a value becomes logical.

| Caller chain | Tests | Correction seam |
| --- | ---: | --- |
| `src/cli.ts:2947`-`src/cli.ts:2948` writes `resolveContext.deliverableRoot` for `project root` | 1 | Apply `toPosix` only to stdout. |
| `src/core/operations/install-authoring-skill.ts:102`-`src/core/operations/install-authoring-skill.ts:191` builds scopes/destinations; `src/cli.ts:3343`-`src/cli.ts:3348` displays them | 4 | Keep native variables for `exists`/`copyTree`; normalize structured/displayed scope, destination, and `changedPaths` values. |
| `src/core/operations/lifecycle.ts:244`-`src/core/operations/lifecycle.ts:246` and `src/core/operations/init-project.ts:378`-`src/core/operations/init-project.ts:402` pass native absolute alias targets; `src/adapters/memory-fs.ts:210`-`src/adapters/memory-fs.ts:226` stores them verbatim | 7 | In the POSIX fake only, normalize absolute targets before recording; preserve a relative target such as `install-backlog` byte-for-byte. Do not alter the real adapter call. |
| `src/core/operations/scaffold-skill.ts:60`-`src/core/operations/scaffold-skill.ts:87` writes and returns `stubAbs` | 2 | Keep `stubAbs` native for `fs`; normalize only the returned changed path. |
| `src/core/services/template-resolver.ts:143`-`src/core/services/template-resolver.ts:154` probes native candidates and returns them on a miss | 2 | Keep native candidates for `fs`; normalize only `found:false.searched`. |

The exact sum is `1 + 4 + 7 + 2 + 2 = 16`. A blanket `path.posix` conversion before filesystem operations is explicitly out of scope because it would erase the native-path behavior the Windows matrix is meant to exercise.

### Mechanism 3 — build stdout test contradicts the packager contract (1 test)

- **Origin/caller:** `src/adapters/packager.ts:84`-`src/adapters/packager.ts:93` deliberately returns the archive path as POSIX; `src/cli.ts:3182`-`src/cli.ts:3190` prints that value.
- **Failing assertion:** `test/integration/cli.build.e2e.test.ts:176` uses a native path correctly for `existsSync`, but `test/integration/cli.build.e2e.test.ts:179` also expects that native `\\` form in stdout.
- **Smallest correction:** retain the native `archive` for existence and `tar` execution; compare stdout with `toPosix(archive)`. No product change.

### Mechanism 4 — POSIX symlink assertions run against the documented Windows copy policy (3 tests)

- **Origin/caller:** `src/util/symlink.ts:64`-`src/util/symlink.ts:80` selects copy solely from `platform === "win32"`; `src/adapters/node-fs.ts:94`-`src/adapters/node-fs.ts:95` delegates to it.
- **Failing assertions:** `test/integration/adapters/node-fs.test.ts:109`-`test/integration/adapters/node-fs.test.ts:143` contains two explicitly POSIX scenarios without a Windows guard; `test/integration/cli.init.test.ts:331`-`test/integration/cli.init.test.ts:353` unconditionally demands a real symlink.
- **Smallest correction:** make the two POSIX-only identity cases non-Windows, and make the CLI-init case assert the platform contract: real symlink on POSIX; readable copied directory (not symlink) on Windows. Retain the forced-Windows relative-copy and warning tests already at `test/integration/adapters/node-fs.test.ts:146`-`test/integration/adapters/node-fs.test.ts:181`.
- **Excluded theory:** runner elevation or Developer Mode is non-causal; the adapter never attempts a Windows symlink. Do not add a privilege probe or change to attempt-and-fallback as part of this gate repair.

### Mechanism 5 — two tests bypass the Windows-aware npm-shim launcher (2 tests)

- **Backlog (Confirmed):** `test/integration/docs-template-examples.e2e.test.ts:38`-`test/integration/docs-template-examples.e2e.test.ts:43` calls bare `backlog` with `execFileSync`; the log reports `spawnSync backlog ENOENT` at line 66. `npm ci` did install the package and Windows binary, and production Backlog adapter suites pass.
- **Biome (Deduced):** `test/integration/core-boundary.test.ts:19`-`test/integration/core-boundary.test.ts:21` builds the extensionless `.bin/biome` path; `test/integration/core-boundary.test.ts:48`-`test/integration/core-boundary.test.ts:59` launches it with `execFileSync` and converts any spawn failure to empty output. The dedicated Biome boundary step passed; the test then failed only because empty output lacked `noRestrictedImports`.
- **Established correction:** use `execaSync` as commit `b998a11` and `src/util/shell.ts:44`-`src/util/shell.ts:57` already do. Invoke `backlog` by command name. Invoke Biome with local-bin resolution and `reject:false`, preserve stdout/stderr/non-zero diagnostics, and surface a no-process/undefined-exit result instead of silently returning empty output.

### Mechanism 6 — the ZIP test helper collapses three process states (1 test)

- **Origin:** `test/unit/adapters/packager.test.ts:28`-`test/unit/adapters/packager.test.ts:37` returns `false` for every version-probe exception, merging absent spawn, present-but-nonzero, and usable into only two observable states.
- **Production contract:** `src/util/shell.ts:60`-`src/util/shell.ts:79` separates no-process spawn failure from non-zero process exit; `src/adapters/packager.ts:104`-`src/adapters/packager.ts:114` correctly maps only spawn failure to unavailable and preserves present-but-nonzero as present.
- **Caller chain:** boolean `hasZip === false` selects `test/unit/adapters/packager.test.ts:392`-`test/unit/adapters/packager.test.ts:400` and expects unavailable; production reaches `src/adapters/packager.ts:325`-`src/adapters/packager.ts:350`, attempts the archive, and returns typed `zip failed` for the non-zero invocation.
- **Condition/effect:** the Windows job records `Command failed (exit 1)` and `zip failed`, proving the production non-zero-exit branch. The stderr says `'zip' is not recognized`, but the wrapper's structured process outcome—not localized stderr text—defines the adapter state.
- **Smallest correction:** make the test probe/conditional expectations represent three states: spawn failure → expect `not available`/tarball guidance; exit-zero probe → expect ZIP success; process-ran/non-zero probe → expect typed `zip failed`. Do not change `toolAvailable`, do not match localized stderr, and keep the stale-entry fix separate.

## Final Conclusion

**Confidence:** Medium

**Status:** Concluded

All 284 failures are exhaustively partitioned and their source/caller correction seams are bounded. Confirmed source/log evidence establishes the two path seams, documented copy fallback, Backlog command-shim misuse, portable-output expectation mismatch, and ZIP unit-helper state collapse; production `toolAvailable` correctly distinguishes spawn failure from present-but-nonzero and requires no change. The Biome spawn mechanism and exact per-test extent of the 248-test CLI cascade remain Deduced from shared symptoms rather than directly logged at every call site. Those two minor uncertainties require post-fix Windows execution to close empirically, but they do not leave an open diagnostic branch or change the proposed correction boundaries.

## Recommended Next Steps

### Fix direction

Apply the six corrections at the seams above, with no workflow provisioning change, no change to the documented Windows copy policy, and no change to production `toolAvailable`:

1. **Context path dialect — 261 tests.** Make `resolveContext` select `path.posix` or `path.win32` from `Environment.platform()` and use that dialect consistently; retain the default POSIX fake and add an explicit Windows-drive fake case proving genuine Win32 roots remain native.
2. **Logical-result and fake-observation paths — 16 tests.** Apply `toPosix` only at the five output/result/diagnostic/fake-recording seams; retain native values for every filesystem/process effect and preserve relative alias targets byte-for-byte.
3. **Build archive stdout — 1 test.** Correct the E2E expectation to the packager's portable POSIX result while keeping native paths for archive creation and existence checks.
4. **Symlink platform contract — 3 tests.** Limit the two explicitly POSIX identity tests to non-Windows and make CLI-init assert a readable non-symlink copy on Windows; do not change the unconditional Windows copy policy or add a privilege probe.
5. **Command-shim launchers — 2 tests.** Move the Backlog and Biome test-only launches to Execa, use local-bin resolution where appropriate, retain non-zero stdout/stderr, and fail visibly when no process launches.
6. **ZIP test-state classification — 1 test.** Replace the test helper's boolean availability model with spawn-failed, exit-zero, and process-ran/non-zero states; assert unavailable only for spawn failure, success for exit zero, and typed `zip failed` for present-but-nonzero. Production `toolAvailable` remains unchanged.

### Diagnostic

No further diagnostic expansion is required before implementation. The post-fix Windows run must directly validate the two Deduced portions: that all 248 downstream CLI failures disappear with the context-dialect correction and that the boundary self-test now exposes Biome's `noRestrictedImports` diagnostic through Execa. If failures remain, compare their sorted set with baseline digest `8090499cd05886058e7756c2aa59a6dc372cde16ddf6303e6dd2b30eadd710ed` before broadening scope; do not add a symlink-privilege probe unless product policy is separately reconsidered.

## Reproduction Plan

Reproduce the baseline on `windows-latest` at `4547434117562bb79a9dfe0e670f66934a8034e4` with Node 20 or Node 22: run `npm ci`, `npm run typecheck`, `npx biome ci .`, `npm run build`, and `npm test`. The first four stages should pass, while Vitest should report 41 failed files and 284 failed tests; the sorted failed-test set should match digest `8090499cd05886058e7756c2aa59a6dc372cde16ddf6303e6dd2b30eadd710ed`.

After applying the corrections, verify on `windows-latest` in three bands:

1. **Path band:** run the following commands, then `npx vitest run --project unit` to close the 248-test cascade. Prove the default fake remains POSIX, an explicit Win32 fake returns native drive paths, relative alias targets remain relative, and real I/O inputs are not normalized prematurely.

   ```text
   npx vitest run test/unit/services/context.test.ts test/unit/services/context.acceptance.test.ts
   npx vitest run test/unit/cli/project-reads-commands.test.ts test/unit/cli/skill-commands.test.ts
   npx vitest run test/unit/operations/create-bundle.acceptance.test.ts test/unit/operations/create-bundle.test.ts test/unit/operations/init-project.test.ts test/unit/operations/install-authoring-skill.test.ts test/unit/operations/lifecycle.acceptance.test.ts test/unit/operations/lifecycle.test.ts test/unit/operations/scaffold-skill.test.ts
   npx vitest run test/unit/services/template-resolver.acceptance.test.ts test/unit/services/template-resolver.test.ts test/unit/templates/default-bundle.test.ts
   ```

2. **Platform/process band:** run the commands below. Require native archive existence plus POSIX stdout, Windows readable-copy behavior, 19 Backlog tasks, a visible `noRestrictedImports` diagnostic, and all three ZIP test states: spawn failure yields unavailable guidance, exit zero yields success, and process-ran/non-zero yields typed `zip failed` without changing production `toolAvailable`.

   ```text
   npm run build
   npx vitest run test/integration/cli.build.e2e.test.ts test/unit/util/symlink.test.ts test/integration/adapters/node-fs.test.ts test/integration/cli.init.test.ts test/integration/docs-template-examples.e2e.test.ts test/integration/core-boundary.test.ts test/unit/adapters/packager.test.ts
   ```

3. **Full gate:** on both Node 20 and Node 22 run `npm run typecheck`, `npx biome ci .`, `npm run build`, and `npm test`. Require zero failed tests, no unexpected skips, and continued passes for the real-filesystem Windows suites that already refute a broad CLI regression. Then require the Ubuntu/macOS cells to stay green, including the separate stale-ZIP replacement coverage.

## Side Findings

- Confirmed: the explicit Biome/core-boundary lint step passed in both Windows jobs, so any claimed boundary failure must be a separate Vitest test rather than failure of the workflow lint command itself.
- Confirmed: the workflow itself calls out Windows symlink-to-copy fallback as expected matrix coverage at `.github/workflows/ci.yml:41`-`.github/workflows/ci.yml:43`.
- Missing evidence: no historical successful CI run exists, so claims that these failures are recent regressions cannot be established from CI history alone.
- Confirmed: commit `15b671e` fixes stale Info-ZIP archive entries; the independent Windows correction is confined to the unit helper's three-state classification, and production `toolAvailable` must remain untouched.

## Follow-up: 2026-08-20

### New Evidence

- Confirmed at failing SHA `4547434117562bb79a9dfe0e670f66934a8034e4`: `src/util/shell.ts:60`-`src/util/shell.ts:79` emits distinct spawn-failure and non-zero-exit shapes, and `src/adapters/packager.ts:104`-`src/adapters/packager.ts:114` intentionally maps them to absent versus present.
- Confirmed: `test/unit/adapters/packager.test.ts:28`-`test/unit/adapters/packager.test.ts:37` catches every `execFileSync` exception and returns `false`, losing that distinction before choosing the assertion at `test/unit/adapters/packager.test.ts:392`-`test/unit/adapters/packager.test.ts:400`.
- Confirmed in Windows job `96384106228`: production reports `Command failed (exit 1)` and typed `zip failed`, which is the present-but-nonzero branch, even though the launched command's stderr contains command-not-recognized wording.

### Additional Findings

The earlier interpretation privileged localized stderr over the wrapper's explicit process-state contract. The structured result and control flow are stronger evidence: production started a process that exited non-zero, while only the test labeled every probe exception “absent.”

### Updated Hypotheses

Hypothesis 8 is retained and changed from Confirmed to Refuted. Hypothesis 9 records the replacement finding: the test helper, not `toolAvailable`, collapses the three states.

### Backlog Changes

No investigation path remains open. Mechanism 6's correction boundary moved from `src/adapters/packager.ts` to `test/unit/adapters/packager.test.ts`; all other five mechanisms and the exhaustive `261 + 16 + 1 + 3 + 2 + 1 = 284` partition remain unchanged.

### Updated Conclusion

Status remains Concluded with Medium confidence. Production `toolAvailable` requires no modification; only the ZIP test probe and its conditional expectations must distinguish spawn failure, exit-zero success, and present-but-nonzero failure. The resolved `workflow.on_complete` hook is empty, so this follow-up requires no completion-hook action.
