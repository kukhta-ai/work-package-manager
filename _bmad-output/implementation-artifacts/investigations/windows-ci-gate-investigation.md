# Investigation: Windows CI Gate Failures

## Hand-off Brief

1. **What happened.** Confirmed: remediation run `32368788474` closed 280 of the prior 284 Windows failures, but head `8920284` still failed four deterministic tests on both Windows Node versions and three additional 5-second real-subprocess tests on Node 20.
2. **Where the case stands.** Concluded with High confidence: the `2 + 1 + 1 + 2 + 1` five-mechanism partition explains all seven Node 20 failures and the first four Node 22 failures; the new evidence refutes the earlier conclusion that ZIP was test-only.
3. **What's needed next.** Apply the five bounded corrections through `bmad-quick-dev`, including production ZIP command-absence recognition and integration-project placement for the real packager suite, then run the targeted red/green checks and full six-cell gate below.

## Case Info

| Field | Value |
| --- | --- |
| Ticket | PR #3 / GitHub Actions runs `32355637349` and `32368788474` |
| Date opened | 2026-08-20 |
| Status | Concluded |
| System | `windows-latest`, Node 20 and Node 22; comparison jobs on Ubuntu and macOS |
| Evidence sources | GitHub Actions run/job metadata and logs; branch `feature/authoring-context`; workflow/configuration; package scripts and lockfile; tests/source; Execa/cross-spawn dependency source; git history |

## Problem Statement

The supplied report says that Phase-7 PR #3 run `32355637349` fails on Windows Node 20/22 with `(a) spawnSync backlog ENOENT` in `test/integration/docs-template-examples.e2e.test.ts`, `(b) NodeFileSystem symlink-mode tests expecting `symlink` but receiving `copy` at `node-fs.test.ts:118/136`, and likely core-boundary path/import failures; macOS/Ubuntu failures are described as a separately fixed stale-ZIP issue. These claims are inputs to verify, not established facts.

## Evidence Inventory

| Source | Status | Notes |
| --- | --- | --- |
| GitHub Actions run `32355637349` metadata | Available | Confirms both Windows matrix jobs failed only at the test step; type-check, lint/boundary gate, and build passed. |
| GitHub Actions Windows/Node 22 failed-step log | Available | Job `96384106228`; about 1,175,772 bytes / 9,805 lines; 41/99 files and 284/1,278 tests failed, 994 tests passed, no timeouts. |
| GitHub Actions Windows/Node 20 failed-step log | Available | Job `96384106372`; about 1,177,972 bytes / 9,823 lines; the same 41 files and 284 tests failed, 994 tests passed, no timeouts. |
| Exact cross-job failure-set manifest | Available | The sorted failed-test sets are identical (SHA-256 `8090499cd05886058e7756c2aa59a6dc372cde16ddf6303e6dd2b30eadd710ed`); every inventoried failure occurs on both Node versions. |
| Remediation run `32368788474` metadata | Available | Head `8920284ea8c2bca93c84f9e0438cbac4cf4e6c5e`; both Ubuntu and both macOS jobs passed, while both Windows jobs failed only Vitest after setup, type-check, lint/boundary, and build passed. |
| Remediation Windows/Node 22 failed-step log | Available | Job `96424282263`; 95/99 files passed, 1,280/1,286 tests passed, four failed, two skipped, no timeouts; duration 1,119.98s. |
| Remediation Windows/Node 20 failed-step log | Available | Job `96424281937`; the same four deterministic failures plus three 5-second packager timeouts; 1,277/1,286 passed, seven failed, two skipped; duration 1,523.80s. |
| Locked subprocess implementation | Available | `package-lock.json:938`/`:1006` lock cross-spawn 7.0.6 and Execa 9.6.1; installed dependency source exposes the exact Windows `cmd.exe` rewrite and the synchronous ENOENT-verification seam. |
| Workflow at failing SHA | Available | `.github/workflows/ci.yml:41`-`.github/workflows/ci.yml:45` deliberately provides an OS/Node matrix; `.github/workflows/ci.yml:61`-`.github/workflows/ci.yml:64` incorrectly says no integration test invokes `backlog` and adds no explicit provisioning. |
| Package/tool provisioning at failing SHA | Available | `package.json:10`-`package.json:16` declares `backlog.md` as a required peer; lockfile resolves `backlog.md@1.45.2`, its `backlog` bin, and the Windows x64 optional package. |
| Source and tests at failing SHA | Available | Relevant files are present and bounded: `src/adapters/node-fs.ts` (97 lines), adapter integration test (183), docs E2E (127), boundary integration test (129), workflow (86), and package manifest (60). |
| Static-analysis evidence | Available | Both Windows jobs passed `tsc` and the dedicated Biome/core-boundary lint step; the Vitest boundary self-test separately failed at `test/integration/core-boundary.test.ts:99:22`. |
| Historical CI evidence | Partial | No fully successful Windows run exists, but remediation run `32368788474` supplies a precise post-fix comparison and closes 280/284 prior failures per Windows job. June runs `27141875384` and `27141919613` failed before useful step-level evidence. |
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
| 2026-08-20 11:46:42Z | Commit `8fe975d` applied the first Windows remediation, including portable result normalization and a raw three-state ZIP test helper, without changing the Execa/`toolAvailable` mismatch. | Commit `8fe975d86dbe56608e4fcd344496e7e59fc53951` | Confirmed |
| 2026-08-20 12:25:44Z | Remediation run `32368788474` started at head `8920284ea8c2bca93c84f9e0438cbac4cf4e6c5e`. | GitHub Actions run metadata | Confirmed |
| 2026-08-20 12:45:09Z | Windows/Node 22 completed with four deterministic failures; all 1,280 other executed tests passed. | Job `96424282263` | Confirmed |
| 2026-08-20 12:51:52Z | Windows/Node 20 completed with the same four failures plus three real-subprocess timeouts; the four non-Windows cells were green. | Job `96424281937`; run metadata | Confirmed |

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
| Execa's Windows command wrapper turns an unresolved ZIP command into `cmd.exe` exit 1, which `toolAvailable` misclassifies as a present tool | 1 | Confirmed at both observable ends; wrapper chain Deduced from locked dependency source | Product subprocess-boundary classification plus divergent test launcher |

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

### Finding 10: Windows Execa indirection defeats the generic ZIP availability heuristic

**Evidence:** `test/unit/adapters/packager.test.ts:28`-`test/unit/adapters/packager.test.ts:37`, `test/unit/adapters/packager.test.ts:370`-`test/unit/adapters/packager.test.ts:400`; `src/util/shell.ts:60`-`src/util/shell.ts:79`; `src/adapters/packager.ts:95`-`src/adapters/packager.ts:114`, `src/adapters/packager.ts:319`-`src/adapters/packager.ts:350`; Windows job `96384106228` log at the `packager.test.ts:400` failure.

**Detail:** Raw `execFileSync("zip", ["-v"])` reports a true spawn absence, but production Execa reports exit 1 and command-not-recognized stderr for the same missing underlying command. Execa 9.6.1 calls `crossSpawn._parse`, which rewrites an unresolved Windows command through `cmd.exe`, then calls native `spawnSync` without cross-spawn's `verifyENOENTSync`; the `cmd.exe` exit therefore reaches `runSync` as `Command failed (exit 1)`. `toolAvailable` treats that wrapper exit as proof that ZIP exists, proceeds, and returns `zip failed` instead of unavailable guidance. The product classification and test launcher must be aligned at the subprocess boundary; changing only the assertion would preserve false availability.

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

### Deduction 2: The Windows gate requires a bounded ZIP availability correction

**Based on:** Findings 5, 8, 9, and 10.

**Reasoning:** The old shape model assumed a missing command always yields no exit code. On Windows, Execa's cross-spawn parsing can launch `cmd.exe` for an unresolved command and return its exit 1 while bypassing cross-spawn's synchronous ENOENT verifier. The raw probe independently proves the named ZIP command is not spawnable, and both Windows logs show the wrapper's command-not-recognized failure.

**Conclusion:** A test-only change is insufficient. Correct availability at `toolAvailable`/`runSync` without locale-specific stderr matching and preserve the separate case where a genuinely resolved tool passes its probe but archive invocation later fails.

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

**Resolution:** Six bounded mechanisms exhaustively account for the original run. Remediation run `32368788474` closed 280 per Windows job and exposed a refined ZIP product-boundary cause plus three stale expectations and one Node20-only timing family; therefore no universal single cause exists.

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

**Status:** Confirmed

**Theory:** The probe treats a non-zero command-wrapper result as evidence that `zip` exists, then invokes it again and maps the failure to the wrong product error.

**Supporting indicators:** The log contains `Command failed (exit 1): zip ...` and Windows command-not-recognized text.

**Would confirm:** `runSync` reports a spawn failure (`Command could not be run`, with no process exit code) and `toolAvailable` nevertheless returns true.

**Would refute:** Source returns false for spawn failure and true only for the distinct case where a process ran and exited non-zero.

**Resolution:** Initially Refuted from the wrapper's documented error shapes, then Confirmed by remediation run `32368788474`. The missing named command is wrapped through `cmd.exe`, so a defined exit code proves only that the command processor ran—not that ZIP exists. The raw probe reports spawn absence while both production logs report wrapper exit 1 and command-not-recognized stderr.

### Hypothesis 9: The ZIP unit helper collapses present-but-unusable and absent into one state

**Status:** Refuted

**Theory:** The test-only `has()` helper returns false for any `execFileSync` exception, causing a present-but-nonzero command to enter the absent-tool assertion branch.

**Supporting indicators:** The helper has an unqualified `catch { return false; }`; the selected test title says “when zip is absent,” but production reaches archive invocation and returns `zip failed` after a process exit.

**Would confirm:** Source shows one boolean false branch for both spawn failure and non-zero exit, and the log shows the production non-zero-exit path.

**Would refute:** The helper independently distinguishes no-process spawn failure from a process exit and selects an expectation for each.

**Resolution:** Historically Confirmed for the old boolean helper, which commit `8fe975d` replaced with an explicit three-state raw probe. At head `8920284`, the helper correctly selects `spawn-absent` and the test still fails because production Execa selects exit 1; the residual cause is launcher divergence, not helper state collapse.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | --- | --- |
| Whether the GitHub runner grants symlink creation privileges | No impact on this incident because production never attempts a symlink on `win32`; relevant only to a future policy change | Add an explicit runner probe only if the documented copy policy is reconsidered. |
| Prior passing Windows run | Prevents empirical regression pinpointing | Unavailable: no successful CI run exists in repository history. A future fixed run can become the baseline. |
| First-remediation Windows evidence | Resolved: run `32368788474` proves 280/284 prior failures closed and identifies the residual perimeter | Recorded in Follow-up #2. |
| Fully green residual-fix Windows run | Prevents proving the five residual corrections close both Windows jobs | Run the targeted red/green plan and full Node 20/22 matrix below. |

## Source Code Trace

| Element | Detail |
| --- | --- |
| Trigger | `.github/workflows/ci.yml:85` runs the full Vitest suite after install, type-check, lint/boundary enforcement, and build have passed. |
| Condition | `windows-latest`, Node 20 and Node 22, failing SHA `4547434117562bb79a9dfe0e670f66934a8034e4`. |
| Failure inventory | 284 tests in 41 files on each Node version; six source/caller mechanisms below sum exactly to 284. |
| Area boundary | No workflow, dependency-install, TypeScript, build, or forbidden-core-import failure occurred. The residual perimeter is three portable-output expectations, Windows ZIP availability across Execa/cmd, and integration-style packager tests running under the unit project's 5-second budget. |

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

### Mechanism 6 — Windows Execa/cmd misclassifies an absent ZIP command (1 test)

- **Raw probe:** `test/unit/adapters/packager.test.ts:28`-`test/unit/adapters/packager.test.ts:41` sees no numeric status and selects `spawn-absent`.
- **Production chain:** `src/util/shell.ts:44`-`src/util/shell.ts:92` uses Execa; `src/adapters/packager.ts:104`-`src/adapters/packager.ts:114` maps every `Command failed (exit …)` probe to present; `src/adapters/packager.ts:321`-`src/adapters/packager.ts:363` then returns typed `zip failed`.
- **Boundary crossing:** `node_modules/cross-spawn/lib/parse.js:27`-`node_modules/cross-spawn/lib/parse.js:60` rewrites unresolved Windows commands through `cmd.exe`; `node_modules/cross-spawn/lib/enoent.js:46`-`node_modules/cross-spawn/lib/enoent.js:49` can recover ENOENT, but Execa's sync path uses only `_parse` (`node_modules/execa/lib/arguments/options.js:19`-`:24`) before native `spawnSync` (`node_modules/execa/lib/methods/main-sync.js:115`-`:120`).
- **Condition/effect:** both new Windows logs show exit 1 plus `'zip' is not recognized`; the raw probe establishes that the underlying ZIP command is absent. The numeric exit belongs to the command processor.
- **Smallest correction boundary:** make production availability preserve Windows command absence through this wrapper seam, and make the test exercise the same launcher/classifier. Avoid localized stderr matching; preserve a separate resolved-tool/archive-invocation-failure test.

## Final Conclusion

**Confidence:** High

**Status:** Concluded

Run `32368788474` proves the first remediation closed 280 of 284 prior failures per Windows job. The residual union is seven unique tests across five mechanisms: Node 22 fails `2 + 1 + 1 = 4`; Node 20 fails the same four plus `2 + 1` real-subprocess timeouts, for `2 + 1 + 1 + 2 + 1 = 7`. Four mechanisms are Confirmed directly from logs and source; the observable ends of the ZIP mechanism are Confirmed and its exact Execa→cross-spawn→`cmd.exe` chain is Deduced from the locked dependency source. The earlier test-only ZIP conclusion is superseded: production availability must change at the wrapper boundary, and the test must use the same classifier.

## Recommended Next Steps

### Fix direction

Apply five corrections, preserving native paths for effects and portable POSIX paths only for logical/display results:

1. **Portable project-root output — two tests.** In `test/integration/cli.build.e2e.test.ts:919` and `test/integration/cli.project-reads.test.ts:93`, normalize only the expected displayed value with `toPosix`. Do not change `src/cli.ts:2947`-`src/cli.ts:2948`, which already implements the contract, or native filesystem joins.
2. **Portable skill-install output — one test.** In `test/integration/cli.skill-install.test.ts:58`, compare output with `toPosix(dest)` while retaining native `dest` for the passing `existsSync` checks. Do not change `src/core/operations/install-authoring-skill.ts:195`-`:211` or `src/cli.ts:3343`-`:3348`.
3. **Windows ZIP availability — one test.** Correct the product seam in `src/util/shell.ts` and/or `src/adapters/packager.ts:104`-`:114` so missing ZIP remains unavailable when Execa/cross-spawn wraps it through `cmd.exe`. Do not match localized stderr and do not erase the distinct case where a resolved tool passes its availability probe but the archive invocation fails. Update the packager test to use the production-equivalent launcher/classifier.
4. **Real tar/Git archive tests — two Node20 timeouts.** Reclassify the real-tool packager suite from `test/unit/adapters/packager.test.ts` to `test/integration/adapters/packager.test.ts`; it then inherits the existing serialized 60-second integration budget in `vitest.config.ts:39`-`:56`. This is preferable to weakening the global unit timeout.
5. **Real Git remote push — one Node20 timeout.** The same test-file reclassification fixes the minimal local-repository push test at current line 520. Its fixture is already small; retain the real init/commit/push/log proof.

If file reclassification is deferred, the bounded fallback is a shared 30-second timeout applied only to the three observed real-subprocess tests. Do not raise the global unit timeout: 1,277 other Node20 tests did not time out, and the unit project is explicitly defined as subprocess-free.

### Diagnostic

No further diagnostic expansion is required before implementation. The red/green ZIP proof must cover three semantic cases through the same product launcher: underlying command absent → unavailable guidance; usable probe → successful ZIP; resolved/usable probe followed by archive failure → typed `zip failed`. If implementation attempts to distinguish Windows command absence by stderr text, reject it as locale-dependent and instead preserve structured resolution/spawn information at the subprocess boundary.

## Reproduction Plan

The authoritative red baseline is run `32368788474` at `8920284`: Windows/Node 22 has four failures and no timeouts; Windows/Node 20 has the same four plus three timeouts at 5,561ms, 16,616ms, and 11,384ms. Both non-Windows OSes are green on both Node versions.

After applying the corrections:

1. **Targeted green:** build first, then run the three output suites and the reclassified packager integration suite on both Windows Node versions.

   ```text
   npm run build
   npx vitest run test/integration/cli.build.e2e.test.ts test/integration/cli.project-reads.test.ts test/integration/cli.skill-install.test.ts
   npx vitest run --project integration test/integration/adapters/packager.test.ts
   ```

   Require both project-root values and the skill destination to remain portable `/` output while all native filesystem checks pass. On a Windows host without ZIP, require unavailable/tarball guidance. Require the three real archive/Git tests to complete under the integration budget without retries.

2. **Subprocess regression:** prove a missing command, a successful version probe, and a post-probe archive failure independently. Keep stale-ZIP replacement coverage from commit `15b671e` green.

3. **Full gate:** on Windows, Ubuntu, and macOS with Node 20 and Node 22 run `npm run typecheck`, `npx biome ci .`, `npm run build`, and `npm test`. Require 1,286/1,286 tests accounted for, zero failures, only the two already expected Windows skips, no unexpected timeouts, and continued passes for core-boundary, Backlog, symlink-copy, and real-filesystem suites.

## Side Findings

- Confirmed: the explicit Biome/core-boundary lint step passed in both Windows jobs, so any claimed boundary failure must be a separate Vitest test rather than failure of the workflow lint command itself.
- Confirmed: the workflow itself calls out Windows symlink-to-copy fallback as expected matrix coverage at `.github/workflows/ci.yml:41`-`.github/workflows/ci.yml:43`.
- Missing evidence: no historical successful CI run exists, so claims that these failures are recent regressions cannot be established from CI history alone.
- Superseded by Follow-up #2: commit `15b671e` fixes stale Info-ZIP archive entries, but new Windows evidence proves the remaining availability correction is not confined to the test; production must preserve underlying command absence across Execa/cmd indirection.

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

Status remained Concluded with Medium confidence at that checkpoint. This conclusion is retained as history but superseded by Follow-up #2, whose direct Windows evidence refutes the claim that production `toolAvailable` requires no modification. The resolved `workflow.on_complete` hook was empty.

## Follow-up: 2026-08-20 #2

### New Evidence

- Run `32368788474` completed at head `8920284ea8c2bca93c84f9e0438cbac4cf4e6c5e`; all six jobs passed checkout, install, type-check, Biome/core-boundary lint, and build. Both Ubuntu and both macOS test jobs passed all 1,286 tests.
- Windows/Node 22 job `96424282263`: 95/99 files passed; 1,280 passed, four failed, two skipped; duration 1,119.98s; no timeouts.
- Windows/Node 20 job `96424281937`: 95/99 files passed; 1,277 passed, seven failed, two skipped; duration 1,523.80s. Its failure set is the same four deterministic tests plus three 5-second packager timeouts.
- The first remediation therefore closed 280/284 prior failures per Windows job (98.59%). The new union contains seven unique failed tests and 11 cross-job failure occurrences: `4 shared × 2 + 3 Node20-only`.

### Additional Findings

The residual set partitions exhaustively into five mechanisms:

| Mechanism | Unique tests | Node 20 | Node 22 | Grade | Correction boundary |
| --- | ---: | ---: | ---: | --- | --- |
| Portable `project root` output consumed by two stale native expectations | 2 | 2 | 2 | Confirmed | `cli.build.e2e.test.ts:919`; `cli.project-reads.test.ts:93` |
| Portable skill-install result consumed by one stale native expectation | 1 | 1 | 1 | Confirmed | `cli.skill-install.test.ts:58` |
| Missing ZIP crosses raw-Node versus Execa/cmd launchers with different result shapes | 1 | 1 | 1 | Observable classifications Confirmed; exact wrapper chain Deduced | `src/util/shell.ts`; `src/adapters/packager.ts:104`-`:114`; same-launcher test |
| Real tar/Git archive tests run under the unit project's 5-second budget | 2 | 2 | 0 | Confirmed | Reclassify packager suite as integration |
| Real Git remote push test runs under the same unit budget | 1 | 1 | 0 | Confirmed | Same suite reclassification |

Sum checks: Node 22 is `2 + 1 + 1 = 4`; Node 20 is `2 + 1 + 1 + 2 + 1 = 7`.

#### Source/caller trace

- **Project root:** `src/cli.ts:2935`-`src/cli.ts:2948` deliberately prints `toPosix(root)`; only `test/integration/cli.build.e2e.test.ts:915`-`:919` and `test/integration/cli.project-reads.test.ts:90`-`:93` retain native `join` expectations. Both commands exit zero.
- **Skill install:** `src/core/operations/install-authoring-skill.ts:195`-`:211` keeps native effect paths but returns POSIX scope/destination values; `src/cli.ts:3343`-`:3348` displays them. Native existence checks at `test/integration/cli.skill-install.test.ts:55`-`:57` pass; only line 58 expects native output.
- **ZIP:** raw `execFileSync` at `test/unit/adapters/packager.test.ts:28`-`:41` sees spawn absence. Execa at `src/util/shell.ts:44`-`:92` sees exit 1 because cross-spawn rewrites the unresolved Windows command through `cmd.exe`, while Execa's sync path bypasses `verifyENOENTSync`. `toolAvailable` at `src/adapters/packager.ts:104`-`:114` therefore reports present and `createZip` at `:321`-`:363` emits `zip failed`; both logs state that ZIP is not recognized.
- **Timeouts:** `test/unit/adapters/packager.test.ts` performs real tar/Git/filesystem work despite `vitest.config.ts:10`-`:13` and `:24`-`:25` defining unit tests as subprocess-free. The integration project already supplies serial execution and 60-second test/hook budgets at `vitest.config.ts:39`-`:56`.

| Timed-out Node20 test | Node 20 | Node 22 |
| --- | ---: | ---: |
| Tarball exact-set test, current line 65 | 5,561ms | 405ms |
| Git transformed-archive parity, current line 183 | 16,616ms | 1,290ms |
| Git bare-remote push, current line 520 | 11,384ms | 884ms |

A smaller fixture is not a coherent sole fix: the tar fixture already ships only three files and the Git remote is already a tiny local repository. Global timeout inflation is refuted because only these three real-subprocess tests time out while 1,277 other Node20 tests complete, and the integration project already owns the appropriate budget.

### Updated Hypotheses

#### Hypothesis 10: Windows command resolution can encode a missing underlying ZIP utility as a process exit

**Status:** Confirmed

**Theory:** Execa or a resolved Windows command shim may start a process that reports localized command-not-found text with exit 1, so `toolAvailable`'s generic spawn-failure-versus-exit-code distinction may be insufficient for this specific platform boundary.

**Would confirm:** The `zip -v` probe and archive invocation resolve through the same Windows indirection, both return a defined exit code with command-not-found stderr, and no usable ZIP executable exists.

**Would refute:** A real ZIP executable or intentional shim exists and the non-zero probe reflects a present-but-unusable tool rather than missing-command indirection.

**Resolution:** Confirmed at the observable boundaries: raw Node reports spawn absence, production reports `Command failed (exit 1)`, and both logs say the underlying ZIP command is not recognized. The exact `cmd.exe` wrapper chain is Deduced from Execa 9.6.1/cross-spawn 7.0.6 locked source. This refutes the prior test-only conclusion.

#### Hypothesis 11: The other three failures are stale native-path test expectations

**Status:** Confirmed

**Theory:** Product output remains intentionally portable POSIX while the three integration assertions still compare native `join(...)` strings on Windows.

**Would confirm:** The producers normalize output at the logical/display boundary and the failing assertions alone retain native joins.

**Would refute:** The product contract or sibling tests require native output, or a producer unexpectedly normalizes an effect path rather than only its returned/displayed value.

**Resolution:** Confirmed. All effects and exit codes succeed; the producers normalize only logical/display values and the three assertions alone compare native Windows strings.

#### Hypothesis 12: The Node20 timeouts are product hangs or require a global timeout increase

**Status:** Refuted

**Theory:** Archive behavior hangs on Node 20 or the entire unit suite needs more time.

**Would confirm:** The same operations fail functionally or time out across Node versions, or unrelated unit tests also exceed 5 seconds.

**Would refute:** The tests complete with correct behavior, only real subprocess tests cross the unit budget, and the integration project already provides a scoped budget.

**Resolution:** Refuted. The three tests finish in 5.561s, 16.616s, and 11.384s on Node 20 and pass in 0.405s, 1.290s, and 0.884s on Node 22. Reclassifying the file as integration is the coherent correction; a scoped 30-second timeout on only those tests is the fallback.

### Backlog Changes

- Done: inventoried and cross-compared both Windows jobs; exact `7` versus `4` sets recorded above.
- Done: traced raw Node → Execa → cross-spawn parse → `cmd.exe` → `runSync` → `toolAvailable` → `createZip`.
- Done: traced all three portable-output producers and stale assertions.
- Done: traced each timeout's real tar/Git operations and the Vitest project boundary.

### Updated Conclusion

Status is Concluded with High confidence. Five mechanisms exhaust the residual `7` versus `4` failure sets. Production ZIP availability must be corrected at `toolAvailable`/`runSync` and tested through the same launcher; the three portable-output fixes are expectation-only; the three timeouts are fixed coherently by moving the real-tool packager suite into the existing integration project. The completion hook resolved to an empty value, so no hook action was required.
