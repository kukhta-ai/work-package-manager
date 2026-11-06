# Architecture navigation with Groma

WPM pins the published `groma.md` package to **0.7.8** and the TypeScript scanner to **@groma/scanner-typescript@0.2.4**. `groma/config.json` disables background automatic updates. Update pins in a reviewed PR, scan and inspect the resulting map, and rerun architecture tests. The published package's wrapper and the source tag's manifest differ; the npm lockfile's exact package is the executable authority.

Groma owns architecture records. Use its CLI to initialize, scan, move, describe and relate records. Read the shipped instructions before curation:

```sh
node node_modules/groma.md/cli.cjs agent-instructions
node node_modules/groma.md/cli.cjs agent-instructions inspect
node node_modules/groma.md/cli.cjs agent-instructions structure
```

For ordinary development:

```sh
npm run groma:view -- src/core/operations/init-project.ts
npm run groma:scan
npm run groma:check
# Inspect the exact staged version, even when the worktree differs:
npm run groma:check -- --snapshot index
```

`view` locates the owning element and file relationships. Inspect an element before changing its responsibilities. A directory is not automatically a C4 container: WPM is a CLI deployment unit, while core, ports and adapters are internal components. Development analyzers and Groma operate on WPM; they are not product-core dependencies. Unimplemented ideas belong in drafts rather than claims about code that exists.

After a structural change, scan and curate ownership, parent relationships, descriptions and affected flows. Preserve explanatory text through subsequent scans. Record paths on the Backlog task using its CLI. Backlog's `--modified-file` replaces the list: read the prior list and pass every retained path along with new ones. IDs and replacement relationships need explicit notes when modules move. Never hand-edit Backlog task files.

Run upstream `backlog ...` examples through `node node_modules/backlog.md/cli.js ...`. The pinned Backlog 1.45.2 exposes `--ref` to replace the complete reference list; preserve existing references when applying Groma's add/remove guidance. Consult `task edit --help` for the installed flags rather than assuming a newer upstream CLI surface.

`groma:check` exports its inputs to a disposable snapshot, including new unignored source files. `--snapshot index` instead exports exact staged bytes and rejects a corrupt staged map even when the worktree is correct. It never regenerates into the shared checkout. The check validates the local exact CLI pin, update policy and reviewed TypeScript scope, invokes the scanner package check, then requires a completed non-empty scan. The pinned scanner has no separate project-readiness probe; compatibility is established during that scan. Retained stale scanner data, error diagnostics, conflicting evidence and changes to committed map records fail the check. A missing scanner or CLI fails. Review scanner warnings as evidence limitations; Groma is not a substitute for type checking or the enforced dependency graph. Its duplicate-logic lint is a heuristic and is not the architecture gate.

Restore missing configured plugins explicitly:

```sh
node node_modules/groma.md/cli.cjs plugin install
```

Do not run `plugin update` inside CI. The upstream Action's automatic scan mode updates plugins, so this repository uses a small local CLI wrapper instead. Local `groma web` is optional; no website is published. Export exact committed snapshots for private review:

```sh
npm run groma:export -- /tmp/wpm-architecture HEAD
npm run groma:export -- /tmp/wpm-comparison HEAD main
```

Comparison export reads committed snapshots. It cannot include uncommitted curation. Exports contain source context and must stay local or in access-controlled CI artifacts. The workflow exports/uploads the map only when GitHub identifies the repository as private. They are retained for 14 days. Never use Pages or a public artifact host for this material without separate authorization.

Upstream references: [Groma source and guides](https://github.com/MrLesk/Groma.md/tree/v0.7.8), [TypeScript scanner manifest](https://github.com/MrLesk/Groma.md/blob/v0.7.8/plugins/scanners/typescript/package.json), [Action scan behavior](https://github.com/MrLesk/Groma.md/tree/v0.7.8/actions).

## Qualified map and scanner limits

The initial implementation was exercised with the published 0.7.8 CLI and scanner 0.2.4. The map combines the legacy domain contract, injected ports, descriptor codecs and shell completion into coherent responsibilities; preserves independent operation and service components; records authors, the external Backlog CLI, the existing recipient agent and a plain-authoring flow. Shared vNext tree validation remains an independent component because package assembly and APM inventories both use it. Two consecutive final rescans left all curated map bytes unchanged, followed by a successful disposable-snapshot check. A private working-tree export was generated and its overview image inspected.

The scanner does not match this repository's `bin: dist/cli.js` declaration to its TypeScript source runtime boundary. Its `accept wpm-cli` command reports `no scan match`. The truthful CLI container declaration therefore remains visibly **draft**, with scanned components placed beneath it, and the system overview records this gap. This does not mean the CLI implementation is absent. Scanner ownership covers supported production TypeScript; development JavaScript and declaration-only files are outside this scanner's qualified scope. Dependency-cruiser and typed lint enforce the executable boundary independently. Groma duplicate-logic findings remain review questions.
