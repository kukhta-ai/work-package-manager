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

Backlog.md is an explicit author-side prerequisite. Source tasks live in `.wpm-source/backlog/`, managed exclusively through the Backlog.md CLI. For richer descriptions, comments and acceptance criteria, run that CLI with `.wpm-source` as its working directory and bind per-process `BACKLOG_CWD` to the same absolute directory. Working directory alone is insufficient when an ambient override exists. The package records each task's identity plus a `wpm-operation:<slug>` label. WPM creates native tasks; it does not maintain a parallel task-content store.

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

## Saved work-package releases

The [release contract](vnext-releases.md) adds TGZ/ZIP/directory build, saved-artifact view and integrity verification, and digest-bound external static review requests/report import under `wpm vnext release`. It retains one root and its runtime closure; existing build/test commands remain compatible. No package code, reviewer agent or publication is launched.

## Multi-package workspaces

The additive [local package graph contract](vnext-dependencies.md) extends this surface with workspace registration, package selection, ordinary/dev/optional dependencies, multiple versions, finite package cycles, graph locks and namespaced release composition. Existing single-package source remains supported. See the [prototype coverage map](vnext-coverage.md) for remaining gaps.

## Complete single-package authoring

Backlog.md **1.57.4** is the pinned authoring CLI. Each adapter call pins per-process `BACKLOG_CWD` to its explicit root; an ambient override cannot redirect it to another workspace. Native edit references include both cwd and that environment binding. It replaces the former native sequence command with `task list --ready`; shipped author guidance reads the complete list separately and obtains exact direct dependencies from versioned JSON task views. Ready-list order is native ordering, never group-defined execution order. WPM keeps all task content native:

```sh
wpm vnext --root ./brief operation create brief "Produce a brief"
# Invoke the local Backlog.md CLI with both cwd and per-process BACKLOG_CWD
# bound to the absolute ./brief/.wpm-source directory:
# backlog task edit operation-1 --description "Produce a readable brief" --ac "The brief addresses the selected problem"
wpm vnext --root ./brief operation view brief
wpm vnext --root ./brief operation finalize brief
wpm vnext --root ./brief group set delivery --operation brief
wpm vnext --root ./brief group view delivery
wpm vnext --root ./brief version minor
wpm vnext --root ./brief check
wpm vnext --root ./brief lock
wpm vnext --root ./brief build
```

`operation create` creates an ordinary, CLI-editable native task marked `wpm-authoring:draft` and `wpm-authoring:v1`. This deliberately avoids native draft storage: the previously pinned CLI could not edit drafts through `task edit`, and promotion changed their IDs. A task-backed draft keeps one content owner and a stable native ID. `create` accepts the same prerequisites, criteria and setup options as `add`, but permits missing criteria while authoring. Existing `add` still creates an active operation under its previous contract.

`operation view <id>` and `list` read current native content, setup, prerequisites, group memberships, readiness and an argv/cwd edit reference. `finalize` requires instructions, criteria, identity and valid package relationships, then removes only the draft label. It leaves status, criteria checks, task content and native ID intact. It never means recipient work was executed. The persistent `wpm-authoring:v1` label identifies the stricter authoring contract, not cached readiness: removing instructions or criteria invalidates release readiness on the next check/build. Repeat finalization revalidates current content. Legacy `add` operations remain compatible without a mandatory migration.

`check` accepts structurally valid source containing drafts and reports `releaseReady: false` with current operation diagnostics. Invalid package structure, graph references, paths or payload still fail. Lock/build/static rehearsal require finalized, valid operations. No stored readiness flag substitutes for checking current content.

`operation set-setup <id>` requires exactly one of `--setup <name>`, `--inherit`, or `--without-setup`. It changes only the package association. Text, criteria and prerequisites remain editable through native Backlog.md.

`group view <name>` shows direct members, expanded selection and external prerequisites separately. `group add/remove <name>` accepts repeated `--operation` and `--group`; repeated additions and removal of absent references are unchanged. Unknown definitions and cycles fail before effects. `group set` continues replacing the full direct selection. `group delete <names...> --yes` removes definitions only and rejects references from retained groups.

`operation delete <ids...> --yes` preflights the whole batch, including retained native task dependencies and group references. It archives source through Backlog.md, never destroys authored task text, and retains existing built archives. Internal dependencies within a retired batch are allowed. True native drafts in `backlog/drafts` block retirement until explicitly reconciled, because the qualified task-edit surface cannot inspect them as ordinary tasks; archived historical source does not block it. Dry runs need no `--yes` and create no ownership records. An interrupted batch retains `.wpm-pending-retirement.json`: retry the identical ID set to continue. Other mutations and artifact capture are blocked until that request is resolved. Changed manifest/task preimages, missing or ambiguous native entries and new external references cause a conflict, preserving evidence; native archival and manifest update are explicitly separate effects.

`version` without an argument reads the package version. An exact SemVer or `major`, `minor`, `patch`, `premajor`, `preminor`, `prepatch`, `prerelease` changes only `package.yml`; `--preid` requires a prerelease increment. No lock refresh, build, tag or publication occurs. As with other authored changes, an existing integrity lock becomes stale.

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

Native task creation and the package association are separate effects. If a concurrent external edit invalidates the manifest preimage after task creation, the native task remains available under its stable operation label. Retrying the same `operation add` reconciles that unique label and exact title, criteria and prerequisites, then associates the existing task. Conflicting or duplicate identities require inspection; retries never silently create another task. YAML updates retain operation and group-member nodes by stable identity, preserving their comments through deletion, replacement and reorder. Semantic no-op requests preserve the original source bytes. Selection aliases that cannot be edited independently and aliases that would change unrelated declarations fail explicitly; make those selections concrete before retrying. Setup creation validates the transition before creating owned files.

Setup and initialization use `.wpm-pending-setup.json` and `.wpm-pending-init.json` ownership records. A matching retry can reuse only the exact source created by that request. Changed source, another pending request or an ambiguous partial native initialization is preserved and reported for inspection. Successful completion retires ownership records. An arbitrary pre-existing source directory is never adopted just because it resembles a generated draft.

Source reads reject static symlinks and bind captured bytes to a regular file descriptor with identity, timestamp and canonical-path checks. These checks cover the tested replacement boundaries; they are not a claim of sandbox isolation against an adversary actively rewriting filesystem ancestors during every syscall. Use trusted, stable authoring workspaces for release qualification.

## Optional APM composition

APM **0.39.0** provides explicitly pinned instruction/skill composition for Codex and Claude Code. WPM adds secret-free MCP project declarations, exact local/remote dependency capture, verified prepared-image offline replay and separate project/session support inspection. Native phases remain explicit; ordinary builds never invoke APM.

See [APM worker contexts](vnext-apm.md) for source formats, tool distribution approval, command examples, ownership/recovery, migration from 0.35.0 and real qualification boundaries. Plain packages continue working without APM.

## Executable evidence

`test/unit/vnext/model.test.ts` checks schema/association boundaries, removal preflight, selection, canonical serialization and generated path/roundtrip properties. `test/integration/vnext-workspace.test.ts` checks real filesystem effects, archive determinism, stale locks, no-effects dry runs, source preservation, symlink rejection and recorded rehearsals. `test/integration/vnext-apm.test.ts` checks adapter argv, graph/receipt boundaries and isolated phase behavior with an explicit command stub; the separate live qualifier exercises the real CLI. `test/integration/vnext-packed.test.ts` runs the plain journey from a fresh npm tarball installation using real Backlog.md, with no APM invocation. The installed-consumer test requires a preceding build and fails if it is missing.
