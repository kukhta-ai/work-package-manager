# Architecture navigation with Groma

WPM uses the reviewed [Groma security fork](https://github.com/kukhta-ai/Groma.md), based on upstream `9f2590feda13e47cb91b589f07d868715242fe52`. Its executable authority is the complete commit, source inventory, frozen dependency lock, build recipe and platform tool hashes in `quality/groma-runtime.json`. A pending or mismatched pin fails closed. There is no fallback to an npm or globally installed Groma. The TypeScript scanner remains **@groma/scanner-typescript@0.2.4**; the Groma-only Backlog client is separate from WPM's development and product Backlog contracts.

`npm run quality:setup` builds the fork and restores the SDKs from committed package-manager recipes with lifecycle scripts disabled. `npm run quality:doctor` checks their complete content before use. Setup approvals live outside Git in the owned runtime directory; project configuration cannot approve executable code for itself. Update these pins in a reviewed PR, scan and inspect the resulting map, and rerun architecture tests. `groma/config.json` disables background automatic checks. Even when enabled explicitly, those checks do not install or approve updates.

Groma owns architecture records. Use its CLI to initialize, scan, move, describe and relate records. Read the shipped instructions before curation:

```sh
npm run groma:cli -- agent-instructions
npm run groma:cli -- agent-instructions inspect
npm run groma:cli -- agent-instructions structure
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

`groma:check` exports its inputs to a disposable snapshot, including new unignored source files. `--snapshot index` instead exports exact staged bytes and rejects a corrupt staged map even when the worktree is correct. It never regenerates into the shared checkout. The check validates the verified fork, external plugin approvals, update policy and reviewed TypeScript scope, invokes the scanner package check, then requires a completed non-empty scan. The pinned scanner has no separate project-readiness probe; compatibility is established during that scan. Retained stale scanner data, error diagnostics, conflicting evidence and changes to committed map records fail the check. A missing scanner or CLI fails. Review scanner warnings as evidence limitations; Groma is not a substitute for type checking or the enforced dependency graph. Its duplicate-logic lint is a heuristic and is not the architecture gate.

Restore missing configured plugins explicitly:

```sh
npm run groma:cli -- plugin install
```

Restore requires the exact approved content, including its frozen dependency closure. A matching version label alone is insufficient. Adding or updating a plugin requires explicit approval of the staged source, exact version or commit, and content hash. Web proposals are bound to the authenticated session and expire; confirmation runs those staged bytes. CLI and TUI entry points use the same approval boundary. Do not run `plugin update` inside CI. The upstream Action's automatic scan mode updates plugins, so this repository uses its verified local wrapper instead.

The native web interface remains available:

```sh
npm run groma:cli -- web
# On a headless host, open the private launcher file printed by this command:
npm run groma:cli -- web --no-open
```

The server binds `127.0.0.1`, checks its exact Host and Origin, and requires an instance-specific HttpOnly session for private reads and editing. Writes also require session CSRF protection. The one-use browser launch secret travels in the URL fragment and is removed before exchange; it is never printed or stored in browser storage. A headless launcher is a credential: its directory is `0700`, its file is `0600` on POSIX, and it is removed after consumption, expiry or server shutdown. The ordinary printed loopback address grants no access by itself. Restart to obtain another launcher. Do not expose the port through a proxy or tunnel.

WPM runs Groma with private user/cache directories and an allowlisted environment. Production credentials, agent configuration and SSH agent sockets are not inherited. This reduces ambient exposure; approved native plugins still have the operating-system authority of the developer process. No website is published. Export exact committed snapshots for private review:

```sh
npm run groma:export -- --ack-source-export /tmp/wpm-architecture HEAD
npm run groma:export -- --ack-source-export /tmp/wpm-comparison HEAD main
```

Choose a new destination outside the checkout whose parent already exists. The explicit flag acknowledges inclusion of full source. The WPM wrapper captures it in owned private staging, and checks both decoded source inventories and the rendered site with the pinned Gitleaks defaults before delivery. A secret in either selected revision blocks delivery and removes staging. Existing destinations are never replaced. Native `groma export` requires `--ack-source-export`; use the WPM wrapper for mandatory secret inspection.

Comparison export reads committed snapshots, including historical source that may have since been deleted or redacted. It cannot include uncommitted curation. Passing a secret detector does not make an export public: full source remains confidential and must stay local or in access-controlled artifacts. The workflow exports/uploads the map only when GitHub identifies the repository as private. They are retained for 14 days. Never use Pages or a public artifact host for this material without separate authorization. Session credentials and plugin approval records do not belong in exports.

Upstream references: [audited source](https://github.com/MrLesk/Groma.md/tree/9f2590feda13e47cb91b589f07d868715242fe52), [TypeScript scanner manifest](https://github.com/MrLesk/Groma.md/blob/v0.7.8/plugins/scanners/typescript/package.json), [Action scan behavior](https://github.com/MrLesk/Groma.md/tree/v0.7.8/actions).

## Qualified map and scanner limits

The initial map qualification used the published 0.7.8 CLI and scanner 0.2.4. The map combines the legacy domain contract, injected ports, descriptor codecs and shell completion into coherent responsibilities; preserves independent operation and service components; records authors, the external Backlog CLI, the existing recipient agent and a plain-authoring flow. Shared vNext tree validation remains an independent component because package assembly and APM inventories both use it. Two consecutive final rescans left all curated map bytes unchanged, followed by a successful disposable-snapshot check. A private working-tree export was generated and its overview image inspected.

The scanner does not match this repository's `bin: dist/cli.js` declaration to its TypeScript source runtime boundary. Its `accept wpm-cli` command reports `no scan match`. The truthful CLI container declaration therefore remains visibly **draft**, with scanned components placed beneath it, and the system overview records this gap. This does not mean the CLI implementation is absent. Scanner ownership covers supported production TypeScript; development JavaScript and declaration-only files are outside this scanner's qualified scope. Dependency-cruiser and typed lint enforce the executable boundary independently. Groma duplicate-logic findings remain review questions.
