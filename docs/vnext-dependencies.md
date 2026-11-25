# Local package workspaces and dependency graphs

The package graph surface is additive under `wpm vnext`. A workspace registers local source directories explicitly; each retains its own native authoring Backlog. Existing standalone schemaVersion 1 sources and short authoring commands remain supported.

```sh
wpm vnext --root ./suite workspace init
wpm vnext --root ./suite package create app
wpm vnext --root ./suite package create common
wpm vnext --root ./suite --package common package version 1.0.0
wpm vnext --root ./suite --package app package deps add 'common@^1.0.0'
wpm vnext --root ./suite --package app package deps list --tree
wpm vnext --root ./suite --package app lock --check
wpm vnext --root ./suite --package app build
wpm vnext --root ./suite --package app test
```

`workspace.yml` has `schemaVersion: 1` and a `packages` array of workspace-relative directories. `workspace add <directory>` registers existing source; it never copies it. `workspace view/check` inspect registrations and graph locks. Package selection uses `--package` and, when several versions are registered, `--package-version`. An exact current package directory or a workspace with only one package may supply unambiguous context. WPM never selects an arbitrary first package. A root package can be registered as `.`.

`package create <name> --directory <path>` creates and registers a fresh source with its native Backlog. Existing directories are preserved. Creation keeps an ownership journal and a complete file/directory inventory after initialization. A matching retry resumes registration only when that inventory remains exact. A crash before the inventory is persisted leaves an ambiguous source for explicit inspection rather than adopting a similar foreign directory. Workspace metadata changes are serialized, and pending creation blocks conflicting registration/version changes.

## Declarations and source versioning

The first dependency edit intentionally upgrades the selected source to schemaVersion 2, preserving its authored comments. Version 1 is not migrated on read. Version 2 adds these optional maps:

```yaml
schemaVersion: 2
# Existing name/version/work/groups/workerSetup/files remain unchanged.
dependencies:
  common: { source: workspace, range: '^1.0.0' }
devDependencies:
  author-tools: { source: workspace, range: '^1.0.0' }
optionalDependencies:
  extras: { source: 'file:../../archives/extras.tgz', range: '^2.0.0' }
```

Names remain portable WPM slugs. A name belongs to exactly one dependency map. Supported sources are `workspace` and `file:<path>`; archive paths resolve relative to their declaring package and must remain inside the workspace. There is no implicit Git, registry, network resolution, script execution or tool installation.

`package deps add <name@range>` accepts `--source`, `--dev`, `--optional`, and `--manifest-only`. `--dev` and `--optional` conflict. Remove takes the declared name and preserves package source. Add/remove reconcile the graph lock unless manifest-only was requested; manifest-only deliberately leaves any existing lock stale. Dry runs perform reads/preflight without ownership, cache, source, lock or output writes.

## Resolution, versions and cycles

Each dependency edge resolves its own compatible package version. Different branches can retain different versions. An identical source instance is shared; separate source locators remain separate identities, including copied archives. Simultaneous same-name/same-version workspace registrations are rejected. Equal-priority candidate versions are ambiguous instead of being selected by registration order.

SemVer ranges use the pinned `semver` library, including normal prerelease exclusion. Package `version` reads, sets an exact version, or applies a semantic increment; `--preid` applies to prerelease increments. Updates are explicit: WPM does not bump dependants or silently rewrite their ranges. A changed version or captured source content invalidates affected graph locks, even when other package versions remain unchanged. Workspace reservations keep uniqueness checks and version writes together.

Package cycles are finite graph references. The tree display marks repeated instances instead of expanding them forever. This differs from operation prerequisites, which must remain acyclic. Including a dependency includes its entire runtime work package; it does not create hidden operation prerequisites or execute work.

Only the selected root's dev dependencies are resolved for authoring. Dev dependencies declared by transitive packages are ignored. Runtime releases exclude dev edges and nodes that are reachable only through them.

An unavailable optional dependency, or a missing required descendant reached exclusively through that optional branch, records an omission and discards the unavailable branch. Nodes also required by another branch remain. Invalid source, archive corruption, private paths, unsafe output, metadata drift and digest mismatches always fail, including in optional branches.

## Reproducible locks and recovery

`wpm.dependencies.lock.json` stores the exact instance graph, source locators, versions, content digests, declared edges and explicit optional omissions. It complements the existing standalone `wpm.lock.json` and native APM locks; they have different ownership and are not interchangeable.

- `lock` preserves matching decisions and recorded optional omissions, resolving declarations that changed.
- `lock --upgrade` permits newer matching versions and retries omitted optional branches.
- `lock --check` is read-only and fails on missing or stale graph evidence.
- `--check` conflicts with `--upgrade`.

A dependency edit binds exact before/after manifest and lock bytes in `.wpm-pending-dependencies.json`. Retries must match the original request and semantic source transition. Changed files or dependencies block replay and preserve evidence. Other package mutations and transitive capture reject pending edits; only the matching root edit may resume its journal. An interrupted writer reservation is retained for explicit inspection, as in standalone authoring.

## Portable graph releases

SchemaVersion 2 source builds require a current graph lock. Build reads captured bytes and never resolves new versions or refreshes locks. Graph releases use contract version 2 with a table of full instance identities and edges. Each instance's compiled contract, operations, groups, setup and payload live under `packages/<16-hex-prefix>/`. Full identities remain in `contract.json`; prefix collisions fail. The bootloader asks the recipient to select an instance and its work explicitly. WPM and Backlog are not required on the recipient machine.

Local version 1 archives import as complete leaf packages. Version 2 archives import their frozen runtime graph without re-resolving its internal declarations against the current workspace. Imported identities bind the actual archive bytes and source locator. Actual file inventories, prerequisite references/cycles, declared graph edges and allowed native target paths are checked before use; private or development files cannot enter through an archive import.

Imports and graph generation support regular-file USTAR gzip archives up to 64 MiB uncompressed, with the existing 100-byte portable path limit. Build rejects unsupported output before writing. No authoring Backlog, dev-only content or global agent configuration is included.

`test` rehearses the same graph representation using an owned temporary archive and host `tar`, checks all extracted bytes and records its digest. It acquires the root reservation before shared report writes. This remains static rehearsal, not recipient-agent execution or fresh-session behavioral qualification. Public distribution remains inactive.
