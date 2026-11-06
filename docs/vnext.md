# WPM vNext contract

This additive vertical slice implements portable operations, groups and optional worker setup, with plain sources and explicit pinned APM composition. It is exposed under `wpm vnext` while the legacy CLI and `manifest.yml` contract remain available. The namespace makes the source-format boundary explicit; promoting these commands to the prototype's `wpm package`/`wpm release` names requires a separate compatibility decision.

The implementation follows the latest `worker-setup-v1` prototype of September 2026. A worker is the recipient's existing agent. WPM neither installs an agent nor manages its identity. Repository development instructions, package-author instructions and recipient instructions have separate owners.

## Plain authoring journey

```sh
wpm vnext --root ./brief init brief
wpm vnext --root ./brief worker-setup create
wpm vnext --root ./brief operation add brief "Produce a brief" --ac "A readable brief describes the selected problem"
wpm vnext --root ./brief operation add review "Review the brief" --prerequisite brief --without-setup --ac "Every claim has been checked"
wpm vnext --root ./brief group set review --operation review
wpm vnext --root ./brief check
wpm vnext --root ./brief lock
wpm vnext --root ./brief build
wpm vnext --root ./brief test
```

Backlog.md is an explicit author-side prerequisite. Source tasks live in `.wpm-source/backlog/`, managed exclusively through the Backlog.md CLI. For richer descriptions, comments and acceptance criteria, run that CLI with `.wpm-source` as its working directory. The package records each task's identity plus a `wpm-operation:<slug>` label. WPM creates native tasks; it does not maintain a parallel task-content store.

```yaml
schemaVersion: 1
name: brief
version: 0.1.0
work:
  - operation: brief
    task: operation-1
  - operation: review
    task: operation-2
    setup: null
groups:
  review:
    operations: [review]
    groups: []
workerSetup:
  default: default
  setups:
    default:
      source: worker-setup/default
      backend: plain
files: []
```

`wpm vnext schema` prints the versioned JSON Schema without reading a workspace. The schema is closed: unexpected properties, duplicate identities, invalid versions, missing associations and group cycles fail validation. Additional payload files must be explicitly listed under `payload/`. Paths are portable, relative and confined. Case-folded/NFC collisions, including file/directory aliases, are rejected. Known development/private state and credential filenames are excluded, case-insensitively; `.env.example` and `.env.template` remain valid authored examples. Explicit payload registration does not replace secret scanning. Traversal, symlinks, Windows device aliases and development-only skill scopes are rejected.

An operation's prerequisites come from its native Backlog task dependencies. Group membership only selects work, including nested groups; selecting `review` never silently adds `brief` to the group. The recipient contract separately records the prerequisite. External unregistered tasks and prerequisite cycles block building. Every operation needs observable acceptance criteria.

## Worker setup

- `worker-setup create` creates `worker-setup/default/WORKER.md` and explicitly selects it as the package default.
- `worker-setup create research` creates a named definition and leaves the default unchanged.
- `worker-setup add ./shared/research --as research` references an existing local directory. A known `apm.yml` source remains APM; otherwise `WORKER.md` identifies plain source. Unknown formats fail explicitly. `--backend` can make the author’s format choice explicit. It performs no copying, network resolution, installation or launch. Repeating the same declaration is unchanged; reusing a name for a different definition fails.
- `worker-setup list` lists definitions. `view [name]` reads the selected source and planned representation. A missing name uses only the declared default. A lone named definition is never implicitly selected.
- `worker-setup remove <names...>` validates the complete batch before writing. Explicit and inherited work references block removal. An unused removed default is cleared. Authored source files are preserved and cannot subsequently be overwritten by `create`.

Omitted operation setup inherits the explicit package default. `--without-setup` records `setup: null`, which disables inheritance. `--setup <name>` selects a named definition and conflicts with `--without-setup` before effects.

`WORKER.md` is WPM source, not a universal native agent discovery filename. The built root bootloader points the recipient at the selected operation and its assigned setup. Built generic/Codex output contains `AGENTS.md`; Claude project output contains a thin `CLAUDE.md` import. A successful build does not prove an agent has loaded the instructions or authenticated a connection.

## Integrity and recipient artifacts

`check` validates real local content without modifying it. `lock` intentionally records logical source declarations and compiled-content integrity in `wpm.lock.json`. Plain packages have no dependency graph that needs APM, and building without a lock is permitted. If a lock exists, changed source invalidates it and blocks building until an intentional lock refresh.

`build` captures the authored bytes once and writes `builds/<name>-<version>.tgz`. It emits sorted portable USTAR entries with fixed owner, permissions and timestamps and a deterministic gzip header. The archive contains only explicit payload files, compiled operation Markdown, `contract.json`, the fixed recipient bootloader and plain setup instructions. It excludes native authoring Backlog state, repository developer skills, generated reports and global agent configuration. All output paths must fit USTAR's portable 100-byte filename field; oversized names fail before publication.

`--dry-run` on the vNext tree reports intended effects and creates no tasks, files, locks, archive, test report, session or network activity. Invalid selectors and unsafe paths fail before effects. Commands emit JSON; errors use the existing CLI's validation-error contract.

`test` performs a **static recipient artifact rehearsal**: it captures the package, writes an owned temporary archive, extracts it using the host `tar`, checks every captured byte, removes its temporary directory and records success or failure in `test-results/vnext-latest.json`. It never executes package instructions or starts a target agent. Real fresh-agent qualification remains separate evidence. Failure to find the extraction tool fails the rehearsal; it is not skipped.

## Concurrent changes and interrupted requests

WPM mutating commands reserve the workspace with an exclusive `.wpm-mutation.lock`. Another writer fails before changing native tasks or source. Read-only source inspection and dry runs do not create a reservation. A reservation left by a terminated process is preserved: inspect its request/PID and confirm that no writer remains before deliberately removing it. WPM does not guess that another process is dead or remove its ownership record automatically.

Native task creation and the package association are separate effects. If a concurrent external edit invalidates the manifest preimage after task creation, the native task remains available under its stable operation label. Retrying the same `operation add` reconciles that unique label and exact title, criteria and prerequisites, then associates the existing task. Conflicting or duplicate identities require inspection; retries never silently create another task. YAML updates preserve comments on unchanged nodes.

Setup and initialization use `.wpm-pending-setup.json` and `.wpm-pending-init.json` ownership records. A matching retry can reuse only the exact source created by that request. Changed source, another pending request or an ambiguous partial native initialization is preserved and reported for inspection. Successful completion retires ownership records. An arbitrary pre-existing source directory is never adopted just because it resembles a generated draft.

Source reads reject static symlinks and bind captured bytes to a regular file descriptor with identity, timestamp and canonical-path checks. These checks cover the tested replacement boundaries; they are not a claim of sandbox isolation against an adversary actively rewriting filesystem ancestors during every syscall. Use trusted, stable authoring workspaces for release qualification.

## Optional APM composition

APM is optional and is invoked only by explicit composition commands. `worker-setup add <local-directory> --as <name>` detects a known `apm.yml` source; `--backend apm` makes that choice explicit. Plain packages never invoke or require APM.

The supported external CLI is pinned to **APM 0.35.0**. Obtain and verify its distribution separately from the [upstream release](https://github.com/microsoft/apm/releases/tag/v0.35.0). Every invocation requires an absolute executable path plus its approved SHA-256. WPM checks that file and its reported version; it neither searches PATH nor installs a tool. The executable pin identifies the entry file. For multi-file distributions, verifying the release archive and preserving its companion files remains part of tool provisioning.

```sh
wpm vnext --root ./brief worker-setup apm lock research --executable /approved/apm --sha256 <approved-executable-digest>
wpm vnext --root ./brief worker-setup apm install research --target codex --executable /approved/apm --sha256 <approved-executable-digest>
wpm vnext --root ./brief worker-setup apm compile research --target codex --executable /approved/apm --sha256 <approved-executable-digest>
```

Use `--target claude-code` for Claude Code; the native APM target/project directory is named `claude`. There is no target auto-detection. WPM supplies project-local `APM_HOME`, `APM_CACHE_DIR` and `APM_TEMP_DIR`; it does not change HOME, global agent configuration or credentials.

The phases remain distinct. Native `lock` resolves `apm.lock.yaml` without target deployment. The first explicit install bootstraps the native deployment ledger in an owned target project. WPM compares the resolved graph with the source lock, excluding only native deployment metadata. Subsequent unchanged installs use APM's `--frozen` replay. `compile` generates instruction context into that existing project. This follows the separate responsibilities of [APM lock](https://microsoft.github.io/apm/reference/cli/lock/), [install](https://microsoft.github.io/apm/reference/cli/install/) and [compile](https://microsoft.github.io/apm/reference/cli/compile/).

The qualified primitive scope is instructions and skills. Root `scripts` and `lifecycle` declarations and other source primitive families fail explicitly. Every external invocation also sets `APM_NO_SCRIPTS=1`: the pinned 0.35.0 lifecycle firing boundary disables organization, user and project scripts before discovery. This is a version-specific integration seam, not a general guarantee supplied by `--only apm` or `--no-trust-bin`; an APM upgrade requires renewed qualification. Generated agent definitions are outside the output allowlist. Install uses `--only apm` and `--no-trust-bin`; it does not configure MCP/LSP services or launch agents. Authenticated connections, remote dependency resolution and fresh-agent behavior require separate qualification.

Composition receipts bind the tool pin/version, source closure, native lock and complete generated inventory. Source/lock changes, edited outputs and newly added outputs invalidate the prepared context. Failed installs retain owned partial targets and a failed receipt for explicit retry; such targets cannot enter a release. Foreign or unrecorded changes block replacement.

The built package contains each prepared target under `worker-setup/<name>/targets/<target>/`, plus `WORKER.md` explaining its use. WPM never merges every named setup into global package instructions. Opening a prepared target project or loading its instructions is an explicit host action. A separate generated-output allowlist permits native rules/skills while continuing to exclude repository development skills and tool state. WPM build/check read the bound output and do not implicitly run APM.

For reproducible live integration qualification after the caller has built WPM:

```sh
node scripts/qualify-apm.mjs --executable /approved/apm --sha256 <approved-executable-digest>
```

The qualifier creates a disposable local package with a local dependency, instructions and a skill; runs the real native phases for Codex and Claude Code; verifies both prepared projects enter the archive; and checks repeated WPM builds produce identical bytes. It records success/failure under `.quality/`, cleans its temporary context, and performs no remote-dependency or agent execution. An explicitly requested `--keep-on-failure` retains the failed fixture for diagnosis. The script never builds or deletes shared `dist/` itself.

The official Linux arm64 v0.35.0 distribution passed this local qualification in the current environment. The verified release archive digest was `ada8901ce1b29e5d188629eeed64e8499853a8cb5f047630ebedbde24008508e`; the entry executable digest was `9d2f7cf34ec2fa0b3d806a4711abd223ee429839ec96787279f1c5d82abd25b8`. This is local integration evidence, not a claim that a target agent loaded or executed the generated context.

The current vNext tree has no publication command. It does not activate npm or GitHub distribution. Candidate qualification and publication approval belong to the repository release process, with the exact artifact digest as their boundary.

## Executable evidence

`test/unit/vnext/model.test.ts` checks schema/association boundaries, removal preflight, selection, canonical serialization and generated path/roundtrip properties. `test/integration/vnext-workspace.test.ts` checks real filesystem effects, archive determinism, stale locks, no-effects dry runs, source preservation, symlink rejection and recorded rehearsals. `test/integration/vnext-apm.test.ts` checks adapter argv, graph/receipt boundaries and isolated phase behavior with an explicit command stub; the separate live qualifier exercises the real CLI. `test/integration/vnext-packed.test.ts` runs the plain journey from a fresh npm tarball installation using real Backlog.md, with no APM invocation. The installed-consumer test requires a preceding build and fails if it is missing.
