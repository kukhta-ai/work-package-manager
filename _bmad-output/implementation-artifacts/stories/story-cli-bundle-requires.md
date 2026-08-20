# Story cli-bundle-requires — `bundle <id> requires add` / `list` / `remove` (tasks 62 + 63 + 64)

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"command tree → per-bundle operations" + rows 162 (`requires add`) / 163 (`requires
> list`) / 164 (`requires remove`), doc 10 line 34 (implicit re-render), doc 11 §"Materialised by `wpm bundle
> <id> requires add/remove`", doc 06 line 137 (`bundle.yml` holds the `requires` map / dependency contract), doc
> 08 (npm-style constraints; constraint-validation-not-resolution), doc 13 §4 (version-constraint service) +
> §5/§8 (the mutation lifecycle)). This is **per-bundle family K** in the CLI epic-2. It REUSES three
> already-established, mechanically-guarded patterns: (a) the **per-bundle mutation + materialise** template
> `src/core/operations/bundle-version.ts` (family J; tasks 59/60/61), (b) the **LIST-MGMT** exemplar
> `src/core/operations/targets.ts` (add/list/remove + the warnings channel + NotFound-on-remove; tasks 42/43/44),
> and (c) the **per-bundle registry** in `src/cli.ts` (the `bundle <id>` routing). It adds ONE
> `bundleRequiresModule` to `PER_BUNDLE_MODULES` — **no routing change**. The model + schema ALREADY carry
> `requires` (a `Map<BundleId, VersionRange>` / `Record<string,string>`), so **K needs no model/schema change**.

## Acceptance criteria (verbatim from the backlog)

### TASK-62 — `bundle <id> requires add <dep-bundle-id> [<constraint>]` (a MUTATION + MATERIALISE; doc-10 row 162)
1. When the dependency id is an enabled bundle, an entry is appended or overwritten in this bundle `bundle.yml`
   `requires` map with the given constraint, or a caret range on the dependency current version when no
   constraint is given.
2. When the new edge would introduce a dependency cycle, the command warns.
3. An authoring task to adapt this bundle install-backlog and payload to use the dependency is materialised,
   idempotent by title.
4. A dependency id that is not an enabled bundle fails with a typed not-found error and a non-zero exit.
5. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id and dependency id complete from enabled bundles.
6. Help output is substantive (description, synopsis, the dependency and constraint positionals, an example); on
   success exits 0.

### TASK-63 — `bundle <id> requires list` (a READ; doc-10 row 163)
1. The command prints each entry of this bundle `bundle.yml` `requires` map as a dependency id and its version
   constraint.
2. The command reads and reports only, with no change on disk, and exits 0 on success.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id completes from enabled bundles.
4. Help output is substantive (description, synopsis, an example).

### TASK-64 — `bundle <id> requires remove <dep-bundle-id>` (a MUTATION + MATERIALISE; doc-10 row 164)
1. The named dependency entry is removed from this bundle `bundle.yml` `requires` map.
2. An authoring task to verify this bundle no longer references the dependency in install-backlog tasks or
   payload is materialised, idempotent by title.
3. Removing a dependency not present in the `requires` map fails with a typed not-found error and a non-zero
   exit.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the dependency id completes from this bundle current `requires` entries.
5. Help output is substantive (description, synopsis, the dependency positional, an example); on success exits 0.

## doc-10 contract (cite the rows)
> `bundle <id> requires add <dep-bundle-id> [<constraint>]` (row 162) → "1. Validate `<dep-bundle-id>` is in
> `manifest.yml.bundles` (enabled) 2. Default constraint `^<dep's current version>` if not given 3.
> Append/overwrite entry in this `bundle.yml.requires` map 4. Warn if it introduces a cycle 5. **Task-driven**:
> materialise an authoring task `Adapt <id>'s install-backlog and payload to use <dep-bundle-id>`".
> `bundle <id> requires list` (row 163) → "1. Read and print this bundle's `requires` map (dep-id + constraint
> per line)".
> `bundle <id> requires remove <dep-bundle-id>` (row 164) → "1. Remove the entry from this `bundle.yml.requires`
> map 2. **Task-driven**: materialise an authoring task `Verify <id> no longer references <dep-bundle-id> in
> install-backlog tasks or payload`".
> Command tree row: "`requires add|list|remove  <dep-bundle-id> [<version-constraint>]  dependency on another
> bundle by id + npm-style version constraint   e.g. add core "^0.3.0"`". [Source: docs/10 §command tree +
> §Per-command actions rows 162/163/164.] Auto-rerender: per-bundle mutations "carry this implicit re-render."
> [docs/10 line 34.]

> doc-11 materialise titles (VERBATIM — the `<id>` / `<dep>` substitutions are the only variables):
> - **Add**: `Adapt <id>'s install-backlog and payload to use <dep>` — AC: "the bundle's tasks actually reference
>   and use the new dependency (rather than the requires entry being aspirational)."
> - **Remove**: `Verify <id> no longer references <dep>` — AC: "no install-backlog task in `<id>` references
>   `<dep>`'s services; payload doesn't assume `<dep>` is installed." [Source: docs/11 §"Materialised by `wpm
>   bundle <id> requires add/remove`".]

> doc-06 — the `requires` map's meaning: "each `bundle.yml` holds … the `requires` map (the dependency contract,
> with npm-style version constraints)." [Source: docs/06 line 137.]

## All three are project-BOUND + per-bundle-routed (NO new routing)
`<id>` is resolved + enabled-guarded by the EXISTING per-bundle routing: `run()`-level `isPerBundleInvocation` /
`dispatchPerBundle` (before commander) → `resolveContext` (→ `NotFoundError(NO_PROJECT_MESSAGE)`, exit 1, naming
`manifest.yml` + `init` — satisfying 62#5 / 63#3 / 64#4) → `requireEnabledBundle(ctx, root, id)` (NotFound exit 1
for a non-enabled HOST id) → the per-bundle sub-program parses the `requires …` tail NATIVELY. The resolved
`root` + `id` are threaded INTO `bundleRequiresModule.register`; it re-resolves nothing. **This story adds ZERO
routing/dispatch/guard code** — it adds one module to `PER_BUNDLE_MODULES` and (for completion) entries to
`PER_BUNDLE_COMPLETION_SPECS` + small id-aware completion sources.

> NOTE the two distinct ids: the **host** `<id>` (the bundle whose `requires` map we edit — already routed +
> enabled-guarded) and the **dependency** `<dep-bundle-id>` (the positional we validate in ② CHECK against the
> enabled set — 62#4). Do NOT confuse them. A non-enabled HOST id → exit 1 from `requireEnabledBundle` (routing).
> A non-enabled DEPENDENCY id → exit 1 from the operation's `check` (62#4).

---

## PART 1 — THE OPERATION (`src/core/operations/bundle-requires.ts`, NEW — pure over the FileSystem port)

Mirror `src/core/operations/bundle-version.ts` (family J): a per-bundle mutation that edits `bundles/<id>/
bundle.yml` via `editYaml` and declares a `materialise` plan. The structural effect edits the `requires`
**mapping** (not the `version` scalar). Three exports: `addRequiresSpec` / `removeRequiresSpec` (mutations) +
`listRequiresSpec` (read).

**Imports (pure — the import-boundary rule on `src/core/operations/` MUST hold):** `node:path` (join), the
task-13 `editYaml` (`../../util/yaml.js`), `NotFoundError` (`../errors.js`), the model (`Project`, `BundleId`,
`BundleManifest`, `SemVer`, `VersionRange`, `AuthoringTaskSpec`), `resolve` + `BundleNode`
(`../services/version-constraint.js` — for cycle detection), the lifecycle types
(`ApplyContext`/`ApplyOutcome`/`OperationSpec`/`ReadSpec`). NEVER `node:fs`/`commander`/`execa`. (This is
`bundle-version.ts`'s import set + `resolve`/`BundleNode` for the graph.) **Do NOT import `parseVersionRange`
here** — range validation is a CLI-boundary concern (UsageError exit 2), so it lives in `src/cli.ts`, not the
pure op (which receives an already-valid `VersionRange` or `undefined`).

### Shared helper — require the HOST bundle (defense-in-depth, like bundle-version.ts)
```ts
const BUNDLE_MANIFEST_FILE = "bundle.yml";

/** Resolve the enabled HOST bundle from the loaded project, or raise NotFoundError. */
function requireBundle(project: Project, id: string): BundleManifest {
  const bundle = (project.bundles as ReadonlyMap<string, BundleManifest>).get(id);
  if (bundle === undefined) {
    throw new NotFoundError(`bundle "${id}" is not an enabled bundle`);
  }
  return bundle;
}
```

### 62 — `addRequiresSpec()` (a MUTATION + MATERIALISE)

```ts
/** The input to addRequiresSpec: the host id, the dependency id, and the (already-validated) constraint or undefined. */
export interface AddRequiresInput {
  readonly id: string;          // host bundle (routed + enabled-guarded)
  readonly dep: string;         // dependency bundle id (a positional)
  readonly constraint?: VersionRange;  // already parseVersionRange-validated at the CLI boundary; undefined ⇒ caret default
}
```

**② CHECK (raises before any effect — 62#4):**
- `requireBundle(project, id)` (host present — defensive).
- Validate `dep` is an ENABLED bundle: `const depBundle = (project.bundles as ReadonlyMap<string,
  BundleManifest>).get(dep); if (depBundle === undefined) throw new NotFoundError(\`bundle "${dep}" is not an
  enabled bundle — run \\\`wpm bundle list\\\` to see enabled bundles, or \\\`wpm bundle enable ${dep}\\\`\`);`
  This is the 62#4 typed not-found (exit 1), and because it is in `check`, **nothing is written** (the harness
  aborts before ③ APPLY). Cite doc-10 row 162 step 1.
  - Edge case: `dep === id` (a bundle requiring itself). doc-10 does not special-case this; `id` IS in the
    enabled set, so `check` passes and the edge is written — then the **cycle detector** flags it (a self-loop is
    a cycle) and the command **warns** (62#2). This is the correct doc behavior: warn, don't reject. Add a unit
    test asserting the self-require warns and still writes.

**③ APPLY (write the `requires` entry, comment-preservingly — 62#1):**
```ts
apply: (ctx, project, { id, dep, constraint }) => {
  const path = join(ctx.root, "bundles", id, BUNDLE_MANIFEST_FILE);
  // The constraint string to WRITE: the caller's validated range string if given, else a LITERAL caret on the
  // dep's current version (doc-10:163 "Default constraint ^<dep's current version>"). The caret is written
  // verbatim (NOT semver-normalized) so bundle.yml stays human-readable (`^0.3.0`, not `>=0.3.0 <0.4.0`).
  const depBundle = requireBundle(project, dep);              // present (CHECK validated)
  const rangeStr = constraint !== undefined ? (constraint as string) : `^${depBundle.version as string}`;
  const next = editYaml(ctx.fs.read(path), (doc) => {
    doc.setIn(["requires", dep], rangeStr);  // append OR overwrite the dep key in the requires map
  });
  ctx.fs.write(path, next);

  // CYCLE CHECK (62#2): build the graph from EVERY enabled bundle's {id, version, requires} PLUS the new edge,
  // call resolve(), and if cyclic, WARN (data — the edge stays written; doc says "warn", not "reject").
  const warnings = cycleWarnings(project, id, dep, rangeStr);
  return { changedPaths: [path], ...(warnings.length > 0 ? { warnings } : {}) };
},
```
- `editYaml`'s `Document.setIn(["requires", dep], rangeStr)` creates the `dep` key under the existing `requires:`
  map if absent, or replaces its value if present (append-or-overwrite — 62#1). Comments + key order survive
  (eemeli/yaml edits in place). **Verify** `setIn` on a `requires: {}` (empty flow map) promotes it to a block
  map with the new key (the `bundle new` canonical `bundle.yml` has `requires: {}`); if the round-trip on an
  empty flow map is awkward, the E2E against the REAL `bundle.yml` will catch it — handle in dev-story.
- The caret string is LITERAL `^x.y.z`. Do **not** route it through `parseVersionRange` (which would normalize
  to comparators). The default's *validity* is guaranteed (a caret on a valid `SemVer` is always a valid range).

**Cycle-warning helper (pure):**
```ts
/**
 * Build the dependency graph from the post-... wait: use the PRE-apply project's enabled bundles, OVERLAYING the
 * new/updated edge on <id> (since CHECK/APPLY run before the harness reloads). For each enabled bundle make a
 * BundleNode {id, version, requires}; for the host <id>, use a requires map = its current requires with `dep`
 * set to the new range. resolve() → if cycles.length > 0, return one warning naming the cycle path.
 */
function cycleWarnings(project: Project, id: string, dep: string, rangeStr: string): string[] {
  const nodes: BundleNode[] = [];
  for (const b of (project.bundles as ReadonlyMap<BundleId, BundleManifest>).values()) {
    if ((b.id as string) === id) {
      const requires = new Map(b.requires as ReadonlyMap<BundleId, VersionRange>);
      requires.set(dep as BundleId, rangeStr as VersionRange);   // overlay the new edge
      nodes.push({ id: b.id, version: b.version, requires });
    } else {
      nodes.push({ id: b.id, version: b.version, requires: b.requires });
    }
  }
  const report = resolve(nodes);
  if (report.cycles.length === 0) return [];
  const path = report.cycles[0]!.map((n) => n as string).join(" -> ");
  return [`adding "${dep}" to "${id}" introduces a dependency cycle (${path}) — the edge was written; review the requires graph`];
}
```
- `resolve()` returns `cycles: BundleId[][]` (detection-not-enumeration — treat `cycles.length > 0` as cyclic;
  do not assume full enumeration; cite docs/13 §4 + the `ResolutionReport.cycles` JSDoc). Naming the first cycle
  path is enough for a human-readable warning (62#2).
- Why the PRE-apply project + overlay (not the post-apply reload): `check`/`apply` see the **pre-apply** project;
  the new edge isn't in `project.bundles[id].requires` yet, so we overlay it onto the node we build for `id`.
  (Equivalently we could reload in `apply` via the port, but the overlay keeps `apply` pure-on-data and matches
  how the materialise plan in bundle-version.ts reasons about post-state.)

**⑤ MATERIALISE (62#3) — one authoring task, doc-11 verbatim, title-idempotent:**
```ts
materialise: (_project, { id, dep }) => [{
  title: `Adapt ${id}'s install-backlog and payload to use ${dep}`,
  acceptanceCriteria: [
    `the bundle's tasks actually reference and use the new dependency (rather than the requires entry being aspirational)`,
  ],
}],
```
The harness materialises into `join(root, AUTHORING_BACKLOG_DIR)` idempotently by title (do NOT re-do the root or
the idempotency — that's the harness's ⑤; cite lifecycle.ts).

**`summary`:** `(_project, { id, dep }) => \`added requires ${dep} to ${id}\``. `formatResult` prints the summary
+ `changed: N path(s)` + `materialised: 1 authoring task(s)`; `writeWarnings` prints any cycle warning to stderr
and the exit stays 0 (62#2/62#6). (The warnings live on the result; the CLI prints them like
`bundle enable`/`targets remove` do.)

### 63 — `listRequiresSpec()` (a READ)
```ts
/** One entry projected for `requires list`: dep id + the range string. */
export interface RequiresEntry { readonly id: string; readonly range: string; }
export interface RequiresListInput { readonly id: string; }

export function listRequiresSpec(): ReadSpec<RequiresListInput, readonly RequiresEntry[]> {
  return {
    summary: (_project, { id }) => `bundle ${id} requires`,
    project: (project, { id }) => {
      const bundle = requireBundle(project, id);
      const out: RequiresEntry[] = [];
      for (const [depId, range] of bundle.requires) {
        out.push({ id: depId as string, range: range as string });
      }
      return out;   // declaration order (the Map preserves insertion order)
    },
  };
}
```
Read-only (63#2): rides `runRead`, touches nothing. The CLI formats it one-per-line (63#1). Mirror
`bundle-reads.ts`'s `requires` projection shape (it already maps `bundle.requires` to `{ id, range }`).

### 64 — `removeRequiresSpec()` (a MUTATION + MATERIALISE)
```ts
export interface RemoveRequiresInput { readonly id: string; readonly dep: string; }
```
**② CHECK (64#3 — typed not-found, changing nothing):** `const bundle = requireBundle(project, id); if (!(bundle.requires as ReadonlyMap<BundleId, VersionRange>).has(dep as BundleId)) throw new NotFoundError(\`bundle "${id}" does not require "${dep}" — nothing to remove\`);` (exit 1; in `check`, so no write — mirrors `targets.ts` `removeTargetSpec`'s NotFound-on-absent).

**③ APPLY (64#1):**
```ts
apply: (ctx, _project, { id, dep }) => {
  const path = join(ctx.root, "bundles", id, BUNDLE_MANIFEST_FILE);
  const next = editYaml(ctx.fs.read(path), (doc) => { doc.deleteIn(["requires", dep]); });
  ctx.fs.write(path, next);
  return { changedPaths: [path] };
},
```
`deleteIn(["requires", dep])` removes only that key, preserving comments + the rest of the map (mirrors
`targets.ts`'s `deleteIn(["targets", index])`). No warnings (removing an edge can't ADD a cycle).

**⑤ MATERIALISE (64#2) — doc-11 verbatim:**
```ts
materialise: (_project, { id, dep }) => [{
  title: `Verify ${id} no longer references ${dep}`,
  acceptanceCriteria: [
    `no install-backlog task in ${id} references ${dep}'s services; payload doesn't assume ${dep} is installed`,
  ],
}],
```
**`summary`:** `\`removed requires ${dep} from ${id}\``.

---

## PART 2 — THE CLI MODULE (`src/cli.ts`, add ONE `PerBundleCommandModule`)

Add `bundleRequiresModule` mirroring `bundleVersionModule` (a command WITH subcommands). Register
`requires` group → `add` / `list` / `remove` leaves. Append it to `PER_BUNDLE_MODULES` (after
`bundleVersionModule`).

```ts
const bundleRequiresModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const requires = sub
      .command("requires")
      .description("declare or inspect this bundle's dependencies on other bundles (doc 10)");

    // ── requires add <dep-bundle-id> [<constraint>] ─────────────────────────────────────────────────────────
    const addLeaf = requires
      .command("add")
      .argument("<dep-bundle-id>", "the bundle id this bundle depends on (must be enabled)")
      .argument("[constraint]", "an npm-style version range (default: a caret range on the dependency's current version)")
      .description("declare a dependency on another bundle by id + npm-style version constraint (doc 10)")
      .action((dep: string, constraintRaw: string | undefined) => {
        // Validate the constraint at the boundary: a bad range is a USAGE error (exit 2), like `version set`.
        let constraint: VersionRange | undefined;
        if (constraintRaw !== undefined) {
          const parsed = parseVersionRange(constraintRaw);
          if (!parsed.ok) throw new UsageError(parsed.problem.message);
          constraint = parsed.value;
        }
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, addRequiresSpec(), {
          id, dep, ...(constraint !== undefined ? { constraint } : {}),
        });
        ctx.io.out.write(formatResult(result));
        writeWarnings(ctx, result.warnings);   // prints the cycle warning to stderr; exit stays 0 (62#2)
      });
    withExamples(addLeaf, [
      { command: "wpm bundle web-handoff requires add core ^0.3.0", note: "depend on core ^0.3.0" },
      { command: "wpm bundle web-handoff requires add core", note: "depend on core's current version (caret default)" },
    ]);

    // ── requires list ───────────────────────────────────────────────────────────────────────────────────────
    const listLeaf = requires
      .command("list")
      .description("print this bundle's requires map (one dependency id + constraint per line) (doc 10)")
      .action(() => {
        const { value } = runRead(ctx.deps.fs, { root }, listRequiresSpec(), { id });
        ctx.io.out.write(formatRequires(value));
      });
    withExamples(listLeaf, [
      { command: `wpm bundle ${id} requires list`, note: "list this bundle's dependencies" },
    ]);

    // ── requires remove <dep-bundle-id> ─────────────────────────────────────────────────────────────────────
    const removeLeaf = requires
      .command("remove")
      .argument("<dep-bundle-id>", "the dependency id to remove from this bundle's requires map")
      .description("remove a dependency entry from this bundle's requires map (doc 10)")
      .action((dep: string) => {
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, removeRequiresSpec(), { id, dep });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [
      { command: "wpm bundle web-handoff requires remove core", note: "drop the dependency on core" },
    ]);
  },
};
```

**`formatRequires` (a tiny shell formatter near `formatBundleView`):**
```ts
function formatRequires(entries: readonly { id: string; range: string }[]): string {
  if (entries.length === 0) return "(no requires)\n";   // a bundle with an empty requires map
  return `${entries.map((e) => `${e.id} ${e.range}`).join("\n")}\n`;  // 63#1: one "dep-id constraint" per line
}
```

**Imports to add in `src/cli.ts`:** `parseVersionRange` + `VersionRange` from the model (already importing
`parseSemVer`/`SemVer` there), and the three new specs (`addRequiresSpec`, `listRequiresSpec`,
`removeRequiresSpec`) from `./core/operations/bundle-requires.js`. (`UsageError`, `runMutation`, `runRead`,
`lifecycleDepsFor`, `formatResult`, `writeWarnings`, `withExamples` are already imported/defined.)

**Help-completeness (62#6/63#4/64#5 + the task-28 guard):** every leaf has a description, commander renders
Usage + the positionals (declared via `.argument(...)` with descriptions), and `withExamples` adds the worked
example. The task-28 completeness guard walks every registered command and FAILS the build if any command with
options/args lacks an example — so `add`/`list`/`remove` MUST each carry one (done above). The bare `requires`
group has no own options/args → it needs only description + Usage (the guard does not demand an example for it),
but commander auto-renders Usage + lists its subcommands.

---

## PART 3 — COMPLETION (`PER_BUNDLE_COMPLETION_SPECS` + small id-aware sources)

doc-10 completion contract: 62#5 `<dep-bundle-id>` (add) completes from ENABLED bundles; 64#4 `<dep-bundle-id>`
(remove) completes from THIS bundle's CURRENT requires entries. The host `<id>` already completes on `bundle
<tab>` (the existing routing). The per-bundle completion specs are keyed by the subcommand path WITHIN `bundle
<id>` (e.g. `"requires add"`), positional index 0 → a source name.

```ts
const PER_BUNDLE_COMPLETION_SPECS: CompletionSpecs = {
  meta: { ... },                                   // existing
  "version bump": { args: ["bump-levels"] },       // existing
  "requires add": { args: ["bundle-ids"] },        // dep completes from enabled bundles — the EXISTING source
  "requires remove": { args: ["bundle-requires"] },// dep completes from THIS bundle's current requires (NEW source)
};
```

**`requires add` → `"bundle-ids"`** works AS-IS: the existing `bundleIds` source completes enabled-bundle ids
from the resolved project (it doesn't need the host id). [Source: `src/completion/bundle-ids.ts`.]

**`requires remove` → `"bundle-requires"` (NEW source)** must list THIS bundle's current `requires` keys — which
needs the HOST `<id>`. **The seam gap:** the per-bundle completion recursion in `computeCompletions`
(`src/cli.ts`) builds the sub-program with a PLACEHOLDER root and passes only `stripped.slice(2)` (the post-id
tail), and a `CompletionSource` receives only `CompletionContext` (fs/env/projectOverride/partial) — so the
source cannot see `<id>` today. **The clean fix (minimal, principled):**
1. Add an OPTIONAL `bundleId?: string` to `CompletionContext` (`src/completion/sources.ts`).
2. In `computeCompletions`'s per-bundle branch (the one that detects `stripped[0]==="bundle"` && a dynamic id and
   recurses into `buildPerBundleProgram(ctx, "", id)`), thread the resolved `id` into the `CompleteDeps` so
   `completeArgv` puts it on the `CompletionContext`. Concretely: extend `CompleteDeps` with an optional
   `bundleId`, set `bundleId: id` in that branch's `completeArgv(sub, stripped.slice(2), { ...ctxDeps, specs:
   PER_BUNDLE_COMPLETION_SPECS, bundleId: id })` call, and in `completeArgv` copy `deps.bundleId` onto the
   `CompletionContext` it builds. (One field through one already-special-cased branch — no new dispatch path.)
3. Add `src/completion/bundle-requires.ts`:
```ts
import { resolveContext } from "../core/services/context.js";
import { parseManifest, parseBundleManifest } from "../core/services/schema/index.js";
import { parseYaml } from "../util/yaml.js";
import { type CompletionContext, prefixFilter } from "./sources.js";

/** Completes a dependency id from the HOST bundle's CURRENT requires map (for `requires remove`). */
export function bundleRequires(ctx: CompletionContext): string[] {
  if (ctx.bundleId === undefined) return [];
  const context = resolveContext({ fs: ctx.fs, env: ctx.env },
    ctx.projectOverride !== undefined ? { projectOverride: ctx.projectOverride } : undefined);
  if (!context.found) return [];
  const parsed = parseBundleManifest(parseYaml(ctx.fs.read(`${context.root}/bundles/${ctx.bundleId}/bundle.yml`)));
  if (!parsed.ok) return [];
  return prefixFilter([...parsed.value.requires.keys()].map((k) => k as string), ctx.partial);
}
```
4. Register it in `defaultRegistry()` (`src/completion/registry.ts`): `registry.register("bundle-requires",
   bundleRequires);`.

All completion sources degrade to `[]` on any failure (never throw in a shell) — the registry already wraps
`resolve` in try/catch. [Source: `src/completion/sources.ts` `CompletionRegistry.resolve`.]

---

## PART 4 — TEST PLAN (unit in-process + real-binary E2E; every AC mapped)

### Unit (`test/unit/cli/bundle-requires-commands.test.ts`, NEW — mirror `bundle-version-commands.test.ts`)
Drive `run()` in-process over in-memory ports (`MemoryFileSystem` + `FakeBacklog` + `FakeEnvironment` +
`FixedClock`), against a project at `/proj` with bundles `a`, `b`, `c` (so add/remove/cycle are exercisable).
Seed `bundle.yml`s with a leading comment + known key order (to assert preservation). Seed the project template
snippets so ④ RERENDER resolves (copy the `seed()` helper from `bundle-version-commands.test.ts`). Init the
authoring backlog (`backlog.init(AUTHORING, { taskPrefix: "authoring" })`).

- **62#1** add `core`-style dep with explicit constraint → the entry lands in `a`'s `bundle.yml.requires` with
  the exact range string; the leading comment + key order survive. Assert via `parseBundleManifest` AND a raw
  `fs.read` substring for the literal range + the comment.
- **62#1 caret default** — add a dep with NO constraint → `requires.<dep>` is the LITERAL `^<dep-version>` (assert
  the raw bundle.yml contains `^0.1.0`, NOT a normalized comparator like `>=0.1.0`).
- **62#1 overwrite** — add the same dep twice with different constraints → the second value REPLACES the first
  (one key, the latest range).
- **62#2 cycle warn** — two bundles `a`,`b` where `b` already requires `a`; `requires add b ...` on `a` (closing
  a 2-cycle a→b→a) → exit 0, the entry IS written, AND stderr contains the cycle warning naming the path.
- **62#2 self-require** — `a requires add a` → exit 0, entry written, cycle warning (a self-loop is a cycle).
- **62#3 materialise** — after add, the authoring backlog holds `Adapt a's install-backlog and payload to use b`
  exactly once; `formatResult` prints `materialised: 1 authoring task(s)`. Re-run add (overwrite) → still ONE
  task (idempotent by title).
- **62#4 dep-not-enabled** — `requires add ghost` (ghost not in manifest) → exit 1 (NotFound, stderr names ghost),
  and `a`'s `bundle.yml` is BYTE-FOR-BYTE unchanged (nothing written — CHECK aborted).
- **62#5 outside-project** — from cwd `/nowhere` → exit 1, stderr contains `manifest.yml` + `init`.
- **62#5 completion (add)** — `__complete bundle a requires add <tab>` → enabled ids (`a`,`b`,`c`).
- **62#6 help** — `bundle a requires add --help` → exit 0, Usage, `<dep-bundle-id>`, `[constraint]`, an Example.
- **63#1** list with two requires entries → stdout is exactly `dep1 range1\ndep2 range2\n` (declaration order).
- **63#1 empty** — list with an empty requires map → `(no requires)` (or the chosen empty marker); exit 0.
- **63#2 read-only** — manifest + every bundle.yml byte-identical before/after list.
- **63#3 outside-project** — exit 1 naming `manifest.yml`.
- **63#4 help** — Usage + Example.
- **64#1 remove** — seed `a` requiring `b`; remove `b` → the key is gone from `requires`; OTHER keys + comments
  survive; exit 0.
- **64#2 materialise** — after remove, backlog holds `Verify a no longer references b` once; re-run remove →
  64#3 fires (now absent) — so test idempotency by removing a DIFFERENT pre-seeded dep twice via two bundles, OR
  assert the single materialise on the first remove.
- **64#3 not-present** — `requires remove ghost` (not in `a`'s requires) → exit 1 (NotFound), bundle.yml
  unchanged.
- **64#4 completion (remove)** — seed `a` requiring `b`,`c`; `__complete bundle a requires remove <tab>` →
  `b`,`c` (THIS bundle's current requires — proves the id-aware `bundle-requires` source + the `bundleId`
  threading). Drive via the PUBLIC `run(["__complete", ...])` so the real recursion + specs resolve.
- **64#5 help** — Usage + `<dep-bundle-id>` + Example.
- **rerender** — after add/remove, `${PROJ}/AGENTS.md` exists (④ ran).
- **end-to-end in-process** — add → list (shows it) → remove → list (gone), asserting the bundle.yml is the
  single source of truth and the author's comment survives every write.

### Real-binary E2E (append to `test/integration/cli.bundle-id.e2e.test.ts`, the `describeIfBuilt` block)
Through the BUILT `dist/cli.js` over a REAL `NodeFileSystem` tmpdir + the real `backlog` CLI (the materialise
path). Reuse `projectWithWeb` / `projectWithRequirer` / `wpm` / `cli` / `authoringTaskTitles` helpers already in
that file. (`projectWithRequirer` currently hand-writes `b`'s requires because K wasn't built — once K lands,
the E2E can also drive `requires add` to CREATE that edge; keep the existing helper but ADD a test that uses the
real `requires add`.)
- `bundle a requires add b ^0.1.0` → exit 0; `bundles/a/bundle.yml` gains `requires:\n  b: ^0.1.0`
  (assert the LITERAL caret survived the real eemeli/yaml round-trip); `id: a` untouched.
- `bundle a requires add core` (caret default) on a project where `core` exists at e.g. 0.1.0 → bundle.yml has
  `core: ^0.1.0`.
- **materialise into the REAL `.authoring-backlog`** — after `requires add b`, `authoringTaskTitles(proj)`
  contains `Adapt a's install-backlog and payload to use b` (this catches the materialise-root + binary-routing
  bug classes the brief calls out).
- **2-bundle cycle warning (real binary)** — make `b` require `a` (via `requires add` or the existing helper),
  then `bundle a requires add b` → exit 0, stdout/stderr contains the cycle warning, AND `a`'s bundle.yml DID
  gain the `b` entry (warn-not-reject through the real binary).
- `bundle a requires list` → prints the entries one per line.
- `bundle a requires remove b` → exit 0; the key is gone from bundle.yml; `authoringTaskTitles` contains `Verify
  a no longer references b`.
- `bundle a requires remove ghost` → exit 1, bundle.yml unchanged.
- `bundle a requires add ghost` (ghost not enabled) → exit 1, bundle.yml unchanged.
- completion through the binary: `__complete bundle a requires add` → enabled ids; `__complete bundle a requires
  remove` (with `a` requiring `b`) → `b`. (Run with `cwd: proj`.)
- help through the binary: `bundle web requires add --help` → contains `bundle web requires add` (the LEAF usage)
  + `<dep-bundle-id>` + an Example.

---

## Dev Notes

### Files to ADD
- `src/core/operations/bundle-requires.ts` — `addRequiresSpec` / `listRequiresSpec` / `removeRequiresSpec` (pure
  over the FileSystem port; the cycle-warning helper).
- `src/completion/bundle-requires.ts` — the `bundleRequires` id-aware completion source.
- `test/unit/cli/bundle-requires-commands.test.ts` — the unit suite above.

### Files to CHANGE
- `src/cli.ts` — add `bundleRequiresModule`; append it to `PER_BUNDLE_MODULES`; add the two
  `PER_BUNDLE_COMPLETION_SPECS` entries; add `formatRequires`; import `parseVersionRange`/`VersionRange` + the
  three specs; thread `bundleId` into the per-bundle completion recursion (the `computeCompletions` branch +
  `CompleteDeps`).
- `src/completion/sources.ts` — add optional `bundleId?: string` to `CompletionContext`.
- `src/completion/complete.ts` — add optional `bundleId?: string` to `CompleteDeps`; copy it onto the
  `CompletionContext` in `completeArgv`.
- `src/completion/registry.ts` — register `"bundle-requires"` → `bundleRequires`.
- `test/integration/cli.bundle-id.e2e.test.ts` — append the real-binary `requires` E2E block.

### Architecture constraints (doc 13 — HARD)
- **Core boundary**: `src/core/operations/bundle-requires.ts` imports ONLY `node:path` + the model + errors + the
  version-constraint service + the lifecycle types — never `node:fs`/`commander`/`execa`. The Biome
  `noRestrictedImports` rule + `test/integration/core-boundary.test.ts` enforce it. The completion sources live
  under `src/completion/` (the impure shell), so they may use `resolveContext`/parsers + the ports, but still not
  `node:fs`/`commander` directly (they read via the injected `fs` port).
- **Core is synchronous**: the specs are sync; only the CLI `action`s that already are async stay async. `add` /
  `remove` actions are sync (like `version set`); commander handles them.
- **Error model** (`src/core/errors.ts`): dep-not-enabled / not-present → `NotFoundError` (exit 1). A bad
  constraint range → `UsageError` (exit 2) at the CLI boundary. A cycle is a normal outcome → returned as a
  WARNING (data), never thrown (62#2). [Source: docs/13 §7.]
- **Lifecycle**: `addRequiresSpec`/`removeRequiresSpec` ride `runMutation` (six beats; ④ RERENDER + ⑤ MATERIALISE
  arranged by the harness); `listRequiresSpec` rides `runRead`. Do NOT re-arrange currency/materialisation.
  [Source: docs/13 §5; `src/core/operations/lifecycle.ts`.]

### Reuse — do NOT reinvent
- The per-bundle mutation+materialise SHAPE is `src/core/operations/bundle-version.ts`. Copy it.
- The LIST-MGMT add/list/remove + warnings-channel + NotFound-on-remove SHAPE is `src/core/operations/targets.ts`.
- The `editYaml` comment-preserving edit (`setIn`/`deleteIn` on a path) is `src/util/yaml.js` — used by
  `bundle-version.ts` (`setIn(["version"], …)`) and `targets.ts` (`addIn`/`deleteIn(["targets", index])`).
- The `resolve()` cycle detector is `src/core/services/version-constraint.ts` — reuse `resolve` + `BundleNode`;
  do NOT write a new graph walker.
- The completion source pattern is `src/completion/bundle-ids.ts` (resolveContext → parse → prefixFilter, `[]` on
  failure). Mirror it for `bundle-requires.ts`.
- `formatResult` / `writeWarnings` / `withExamples` already exist in `src/cli.ts` — use them.

### Project Structure Notes
- New op file sits beside `bundle-version.ts` / `targets.ts` / `bundle-reads.ts` in `src/core/operations/`.
- New completion source sits beside `bundle-ids.ts` in `src/completion/`.
- Tests follow the established split: in-process unit under `test/unit/cli/`, real-binary E2E appended to the
  existing `test/integration/cli.bundle-id.e2e.test.ts` `describeIfBuilt` block.
- No model/schema change (K reuses the existing `requires` field) — so NO change to `src/core/model/bundle.ts` or
  `src/core/services/schema/bundle.ts`. (Family L will extend those for payload files; K must not.)

### References
- [Source: docs/10-authoring-cli.md §command tree + §Per-command actions rows 162/163/164; line 34 implicit re-render.]
- [Source: docs/11-authoring-process.md §"Materialised by `wpm bundle <id> requires add/remove`".]
- [Source: docs/06-project-skeleton.md line 137 — bundle.yml holds the requires map / dependency contract.]
- [Source: docs/08-versioning-and-migrations.md — npm-style constraints; constraint-validation, not resolution.]
- [Source: docs/13-core-architecture.md §4 (version-constraint service) + §5/§8 (the mutation lifecycle) + §7 (error model).]
- [Source: src/core/operations/bundle-version.ts — the per-bundle mutation+materialise template.]
- [Source: src/core/operations/targets.ts — the LIST-MGMT add/list/remove + warnings + NotFound-on-remove exemplar.]
- [Source: src/core/services/version-constraint.ts — resolve()/BundleNode/ResolutionReport.cycles.]
- [Source: src/cli.ts — PerBundleCommandModule / PER_BUNDLE_MODULES / PER_BUNDLE_COMPLETION_SPECS / requireEnabledBundle / buildPerBundleProgram / computeCompletions.]
- [Source: src/completion/bundle-ids.ts + sources.ts + complete.ts + registry.ts — the completion seam.]

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — BMAD build worker. Skills actually run (Rule 3 evidence): `bmad-create-story` (this
story), `bmad-dev-story` (code + unit tests), `bmad-qa-generate-e2e-tests` (the real-binary E2E block).

### Completion Notes List
- Implemented `src/core/operations/bundle-requires.ts` (pure: `node:path` + model + errors +
  version-constraint + lifecycle types; core-boundary clean) with `addRequiresSpec` / `removeRequiresSpec` /
  `listRequiresSpec`, mirroring `bundle-version.ts` (mutation+materialise) and `targets.ts` (LIST-MGMT +
  warnings + NotFound-on-remove). Cycle detection reuses `resolve()`/`BundleNode`; the new edge is overlaid onto
  the host node of the PRE-apply project, and `cycles.length > 0` yields a non-fatal `ApplyOutcome.warning`
  naming the cycle path (the edge is still written — doc 10 row 162 "Warn").
- **Realization refinement recorded (raw range, not normalized).** `parseVersionRange` (and thus
  `parseBundleManifest`) NORMALIZES an npm range (`^0.3.0` → `>=0.3.0 <0.4.0-0`; the committed convention, see
  `test/unit/schema/bundle.test.ts`). To honor doc-10 row 162's example (`add core "^0.3.0"` stores `^0.3.0`),
  the CLI validates the constraint at the boundary (a bad range = `UsageError` exit 2) but passes the **raw
  validated string** to the operation, which writes it VERBATIM via `editYaml.setIn(["requires", dep], rawOrCaret)`.
  The caret default is the literal `^<dep-version>`. So `bundle.yml` stays human-readable (literal caret), while
  reads (`requires list`, `bundle show`) display the model's normalized form (consistent with the existing
  `bundle show` behavior). This is a refinement of the story's first sketch (which typed `constraint:
  VersionRange`), not a doc/goal change — flagged for the gate.
- Completion seam extended minimally: added optional `bundleId` to `CompletionContext` (`sources.ts`) +
  `CompleteDeps` (`complete.ts`), threaded the resolved host id through the one per-bundle completion recursion
  branch in `computeCompletions` (`cli.ts`), and added the id-aware `bundle-requires` source (`requires remove`
  completes from THIS bundle's current requires keys). `requires add` reuses the existing `bundle-ids` source.
- E2E learnings baked into the tests: (a) assert the RAW caret against file TEXT, the normalized form against
  parsed/printed values (via a `normalizedRange()` helper); (b) `bundle new` scaffolds `requires: {}` as an
  INLINE flow map, so the first add lands as `requires: { b: ^0.1.0 }` (flow, not block) — the E2E matches the
  literal caret regardless of layout.
- Gate: tsc clean, biome clean (formatter applied), unit 26/26, real-binary requires E2E 11/11.

### File List
- ADD `src/core/operations/bundle-requires.ts`
- ADD `src/completion/bundle-requires.ts`
- ADD `test/unit/cli/bundle-requires-commands.test.ts`
- CHANGE `src/cli.ts` (bundleRequiresModule + PER_BUNDLE_MODULES + PER_BUNDLE_COMPLETION_SPECS + formatRequires +
  imports + bundleId threading in the per-bundle completion recursion)
- CHANGE `src/completion/sources.ts` (optional `bundleId` on CompletionContext)
- CHANGE `src/completion/complete.ts` (optional `bundleId` on CompleteDeps; copied onto CompletionContext)
- CHANGE `src/completion/registry.ts` (register `bundle-requires` source)
- CHANGE `test/integration/cli.bundle-id.e2e.test.ts` (appended the requires real-binary E2E block + `spawnSync`
  import + `wpmFull`/`projectWithAB` helpers)
