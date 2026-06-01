# Story cli-bundle-version — `bundle <id> version` / `version bump` / `version set` (tasks 59 + 60 + 61)

Status: review

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"command tree → per-bundle operations" + rows 159 (`bundle <id> version`) / 160
> (`bundle <id> version bump`) / 161 (`bundle <id> version set`), doc 10 line 34 (implicit re-render), doc 11
> §version-bump task catalog, doc 13 §4 (semver logic) + §5/§8 (the mutation lifecycle)). This is **per-bundle
> family J** in the CLI epic-2 — it REUSES two already-established, mechanically-guarded patterns: (a) the
> **VERSION pattern** `src/core/operations/version.ts` (the PROJECT version; tasks 39/40/41) and (b) the
> **per-bundle registry** in `src/cli.ts` (the `bundle <id>` routing the task-57/58 story established). It adds
> ONE `bundleVersionModule` to `PER_BUNDLE_MODULES` — **no routing change**. This reuses vetted patterns; a
> focused-LIGHT review follows.

## Acceptance criteria (verbatim from the backlog)

### TASK-59 — `bundle <id> version` (a READ; doc-10 row 159)
1. The command prints the value of the bundle `bundle.yml` version to stdout.
2. The command reads and reports only, with no change on disk, and exits 0 on success.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the
   `-C` override; the id completes from enabled bundles.
4. Help output is substantive (description, synopsis, an example) and documents the `bump` and `set`
   subcommands.

### TASK-60 — `bundle <id> version bump <major|minor|patch>` (a MUTATION + MATERIALISE; doc-10 row 160)
1. Given a level of `major`, `minor`, or `patch`, the command computes the next semver from the bundle's
   current version, writes it back preserving comments, and prints the new version.
2. The bump materialises the state-task review, the migration-consideration task, and the simulate-upgrade task
   for the bundle, plus a review-version-constraint task for every bundle whose `requires` map names this one,
   idempotent by title.
3. A missing or invalid level fails as a usage error with exit code 2 and changes nothing.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the
   `-C` override; the id completes from enabled bundles and the level from `major`, `minor`, `patch`.
5. Help output is substantive (description, synopsis, the level positional and its values, an example); on
   success exits 0.

### TASK-61 — `bundle <id> version set <v>` (a MUTATION; doc-10 row 161)
1. Given an explicit version that is valid semver, the command writes it to the bundle `bundle.yml` version
   preserving comments and prints it.
2. A value that is not valid semver fails as a usage error with exit code 2 and changes nothing.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the
   `-C` override; the id completes from enabled bundles.
4. Help output is substantive (description, synopsis, the version positional, an example); on success exits 0.

## doc-10 contract (cite the rows)
> `bundle <id> version` (row 159) → "1. Read `bundle.yml.version` 2. Print".
> `bundle <id> version bump <major|minor|patch>` (row 160) → "1. Compute next per semver 2. Update
> `bundle.yml.version` 3. **Task-driven**: materialise authoring tasks — `Review state-tasks for <id> at
> <new-version>`, `Consider migration tasks for <id> <prev>→<new>`, `Simulate upgrade for <id> from <prev> to
> <new>`, and for each bundle whose `requires` map names `<id>`: `Review version constraint on <id> at
> <new-version>` 4. Print new version".
> `bundle <id> version set <v>` (row 161) → "1. Validate semver 2. Update `bundle.yml.version` 3. Print".
> Command tree: "── per-bundle operations (after `bundle <id>`, a fresh subcommand space on that bundle): `<id>`
> enters per-bundle context → `show`, `meta`, **`version`** (bare = show; `bump <level>`; `set <v>`), `requires
> …`, `files …`, …". [Source: docs/10 §command tree + §Per-command actions rows 159/160/161.] Auto-rerender:
> the per-bundle mutations "carry this implicit re-render." [docs/10 line 34.]

## All three are project-BOUND + per-bundle-routed (NO new routing)
`<id>` is resolved + enabled-guarded by the EXISTING per-bundle routing the task-57/58 story established:
`run()`-level `isPerBundleInvocation` / `dispatchPerBundle` (before commander) → `resolveContext` (→
`NotFoundError(NO_PROJECT_MESSAGE)`, exit 1, naming `manifest.yml` + `init` — satisfying 59#3 / 60#4 / 61#3) →
`requireEnabledBundle(ctx, root, id)` (NotFound exit 1 for a non-enabled id) → the per-bundle sub-program parses
the `version …` tail NATIVELY. The resolved `root` + `id` are threaded INTO `bundleVersionModule.register`; it
re-resolves nothing. **This story adds ZERO routing/dispatch/guard code** — it only adds one module to
`PER_BUNDLE_MODULES` and (for the `<level>` enum) one entry to `PER_BUNDLE_COMPLETION_SPECS`.

---

## PART 1 — THE OPERATION (`src/core/operations/bundle-version.ts`, NEW — pure over the FileSystem port)

Mirror `src/core/operations/version.ts` (the PROJECT VERSION pattern), but the structural effect edits
`bundles/<id>/bundle.yml`'s `version` instead of `manifest.yml`'s `project.version`. Three exports, mirroring
`readVersionSpec` / `bumpVersionSpec` / `setVersionSpec`:

**Imports (pure — the import-boundary rule on `src/core/operations/` MUST hold):** `node:path` (join), the
task-13 `editYaml` (`../../util/yaml.js`), the model (`Project`, `SemVer`, `BundleManifest`, `AuthoringTaskSpec`,
`BundleId`, `VersionRange`), `bumpSemVer` + `BumpLevel` (`../services/version-constraint.js`), the lifecycle
types (`ApplyContext`/`ApplyOutcome`/`OperationSpec`/`ReadSpec`). NEVER `node:fs`/`commander`/`execa`. (Verified
this is exactly `version.ts`'s import set plus the model types the materialise plan needs.)

### Shared helper — write the bundle version comment-preservingly
```ts
/** A bundle's manifest filename, under `bundles/<id>/`. */
const BUNDLE_MANIFEST_FILE = "bundle.yml";

/** Write `version` into `bundles/<id>/bundle.yml`'s top-level `version`, comment-preservingly; return the path. */
function writeBundleVersion(ctx: ApplyContext, id: string, version: SemVer): ApplyOutcome {
  const path = join(ctx.root, "bundles", id, BUNDLE_MANIFEST_FILE);
  const next = editYaml(ctx.fs.read(path), (doc) => {
    doc.setIn(["version"], version);
  });
  ctx.fs.write(path, next);
  return { changedPaths: [path] };
}
```
`editYaml`'s eemeli/yaml `Document.setIn` REPLACES the scalar in place (it does not re-serialise the document),
so comments + key order survive (60#1 / 61#1 "preserving comments"). The key is the TOP-LEVEL `version` (a
bundle.yml has `id/version/summary/confirmation/requires` at the root — verified against `bundle-meta.ts`'s
`setIn(["version"], …)` and the real `bundle.yml` schema). This is the SAME field `bundle <id> meta --version`
writes — the two stay consistent because both go through `setIn(["version"], <SemVer>)`.

### 59 — `readBundleVersionSpec()` (a READ)
```ts
/** The input selecting which enabled bundle to read. */
export interface BundleVersionReadInput { readonly id: string; }

/**
 * `bundle <id> version` (doc 10 row 159), a read. Projects `bundles/<id>/bundle.yml`'s `version`; the command
 * prints it. Changes nothing on disk (59#2).
 */
export function readBundleVersionSpec(): ReadSpec<BundleVersionReadInput, SemVer> {
  return {
    summary: (_project, { id }) => `bundle ${id} version`,
    project: (project, { id }) => requireBundle(project, id).version,
  };
}
```
`requireBundle(project, id)` is a tiny shared helper: `const b = (project.bundles as ReadonlyMap<string,
BundleManifest>).get(id); if (b === undefined) throw new NotFoundError(\`bundle "${id}" is not an enabled
bundle\`); return b;`. (The routing's `requireEnabledBundle` already guards this, but the operation stays
total/defensive — exactly as `bundle-meta.ts`'s `check` does. Import `NotFoundError` from `../errors.js`.)

### 61 — `setBundleVersionSpec()` (a MUTATION, no materialise)
```ts
/** The input to set: the target id + the already-parsed explicit version (the CLI validated `<v>` at the boundary). */
export interface SetBundleVersionInput { readonly id: string; readonly version: SemVer; }

/**
 * `bundle <id> version set <v>` (doc 10 row 161), a mutation. ② CHECK the id is enabled; ③ APPLY writes the
 * (already-validated) explicit version to `bundle.yml.version` comment-preservingly; ④ RERENDER (the harness)
 * re-renders the front-door. No materialise (setting a version queues no per-bundle work). `summary` reports the
 * POST-APPLY version, so the command prints it (61#1).
 */
export function setBundleVersionSpec(): OperationSpec<SetBundleVersionInput> {
  return {
    // The harness resolves `summary` against the POST-APPLY (reloaded) project, whose bundle.version is the value
    // just written — report it directly (the bundle.yml stays the single source of what is printed).
    summary: (project, { id }) => `${requireBundle(project, id).version}`,
    check: (project, { id }) => { requireBundle(project, id); },
    apply: (ctx, _project, { id, version }) => writeBundleVersion(ctx, id, version),
  };
}
```

### 60 — `bumpBundleVersionSpec()` (a MUTATION + MATERIALISE) — the load-bearing leaf
```ts
/** The input to bump: the target id + the (commander-validated) level to advance. */
export interface BumpBundleVersionInput { readonly id: string; readonly level: BumpLevel; }
```
**THE PREV-VERSION PROBLEM (the one real subtlety) and its clean resolution.** doc-10:160 + 60#2 require the
materialised titles to name BOTH `<prev>` and `<new>` (`Consider migration tasks for <id> <prev>→<new>`,
`Simulate upgrade for <id> from <prev> to <new>`). But the lifecycle gives `materialise(postApplyProject, input)`
the POST-APPLY project — whose `bundle.version` is already `<new>` — so the prev is gone there. Resolve it
**without any closure/mutable state** (which would not fit the stateless `OperationSpec` and would break across
the harness's reload) by computing BOTH versions from the SAME inputs in EACH beat, because both are pure
functions of the project's bundle version + the level:

- In `apply` (sees the PRE-apply project): `prev = bundle.version`, `next = bumpSemVer(prev, level)`, write
  `next`.
- In `materialise` (sees the POST-APPLY project, where `bundle.version === next`): the post-apply version IS
  `<new>` directly; recover `<prev>` by **inverting one level is NOT possible** (bump is not invertible: a
  `minor` bump zeroes patch). So instead, **materialise must derive prev from new differently** — and the
  cleanest correct way is: *do not recompute prev from new at all.* Recompute from a STABLE source. Two equally
  pure options — pick (A), it is simplest and matches the harness contract:

  **(A) Compute new from the post-apply project's OWN version; the post-apply version already equals `<new>`.**
  For `<prev>`, note the post-apply project still carries every bundle's data; but its target bundle no longer
  knows its old version. THEREFORE: compute the prev/new PAIR in `apply` and **carry them via the materialise
  reading the post-apply version as `<new>` and reconstructing `<prev>` is unsafe.** ⇒ Use option (B).

  **(B) `materialise` recomputes `<new>` from the POST-APPLY bundle version (which is already `<new>`) and gets
  `<prev>` by reading it back off the post-apply project's bundle — IMPOSSIBLE (overwritten).** ⇒ neither A-recon
  nor B-recon yields prev from the post-apply project alone.

  **THE ACTUAL RESOLUTION — make `bumpBundleVersionSpec` a closure that captures the pre/post pair computed once,
  keyed by reading the version at `apply` time into a spec-local box that `materialise` reads.** A per-invocation
  spec instance (each `run()` builds a fresh `bumpBundleVersionSpec()`), so a tiny private `let` inside the
  factory is safe and not shared across invocations:
```ts
/**
 * `bundle <id> version bump <level>` (doc 10 row 160), a mutation. ③ APPLY computes `next = bumpSemVer(current,
 * level)` from the bundle's CURRENT version and writes it comment-preservingly; ④ RERENDER (the harness)
 * re-renders the front-door; ⑤ MATERIALISE the doc-11 bump task set (idempotent by title), including a
 * version-constraint review for every OTHER enabled bundle whose `requires` map names `<id>`. `summary` reports
 * the POST-APPLY version (60#1 prints the new version).
 *
 * The prev→new pair is captured in ③ (the only beat that sees the pre-apply version) into a per-invocation box
 * the ⑤ plan reads — each call builds a FRESH spec, so this local is not shared across invocations and is the
 * pure-functional bridge across the harness's post-apply reload.
 */
export function bumpBundleVersionSpec(): OperationSpec<BumpBundleVersionInput> {
  // Per-invocation capture of the version transition (③ sets it; ⑤ reads it). A fresh spec per run() ⇒ safe.
  let transition: { prev: SemVer; next: SemVer } | undefined;

  return {
    // Report the POST-APPLY bundle version directly (it is `next`). Re-running bumpSemVer here would DOUBLE-bump
    // (the task-40 lesson): the post-apply project already holds the advanced version.
    summary: (project, { id }) => `${requireBundle(project, id).version}`,

    check: (project, { id }) => { requireBundle(project, id); },

    apply: (ctx, project, { id, level }) => {
      const prev = requireBundle(project, id).version;
      const next = bumpSemVer(prev, level);
      transition = { prev, next };
      return writeBundleVersion(ctx, id, next);
    },

    materialise: (project, { id }) => {
      // `transition` is set by ③ APPLY, which always runs before ⑤ for a mutation (lifecycle order). Fall back to
      // the post-apply version for `next` defensively (it equals `transition.next`); `prev` has no post-apply
      // source, so a missing transition is an internal invariant violation, not a normal path.
      const next = transition?.next ?? requireBundle(project, id).version;
      const prev = transition?.prev ?? next;
      return bumpAuthoringTasks(project, id, prev, next);
    },
  };
}
```
> **Design note for the reviewer (record in `--notes`):** the per-invocation `let transition` is the deliberate,
> minimal bridge for the prev→new pair across the harness's post-apply reload. It is NOT shared module state — a
> fresh `bumpBundleVersionSpec()` is constructed per `run()` (the CLI calls the factory in the action), so two
> concurrent/successive bumps never alias. The alternative (threading prev through the lifecycle API) would change
> `OperationSpec` for one operation — rejected as over-reach. The operation stays pure-over-ports (no I/O in the
> closure; `apply` does the only effect, via the port). If a future refactor makes the lifecycle pass the
> pre-apply project to `materialise`, drop the closure. (bump is non-invertible — a `minor`/`major` bump zeroes
> lower fields — so `<prev>` genuinely cannot be reconstructed from `<new>`; capturing it in ③ is necessary.)

### The materialise plan (doc-11 catalog) — INCLUDING the cross-bundle requirer scan (60#2)
```ts
/**
 * The authoring tasks a bundle version bump materialises (doc 10 row 160; doc 11 §version-bump catalog): the
 * three per-bundle review tasks, PLUS — for every OTHER enabled bundle whose `requires` map names `<id>` — a
 * version-constraint review (so a dependant re-checks its pin against the new version). Title-stable (the
 * harness de-dupes by title — 60#2 idempotent).
 *
 * The requirer scan walks the POST-APPLY project's bundles (the loader reads EVERY enabled bundle's `bundle.yml`,
 * so `project.bundles` holds all of them with their `requires` maps) and includes those whose `requires` map has
 * `<id>` as a key. The bumped bundle is skipped (`other.id !== id`) — a bundle reviewing its own constraint on
 * itself is meaningless.
 */
function bumpAuthoringTasks(
  project: Project,
  id: string,
  prev: SemVer,
  next: SemVer,
): AuthoringTaskSpec[] {
  const tasks: AuthoringTaskSpec[] = [
    {
      title: `Review state-tasks for ${id} at ${next}`,
      acceptanceCriteria: [
        `the install-backlog state-tasks (kind:state) for ${id} are correct for version ${next}`,
      ],
    },
    {
      title: `Consider migration tasks for ${id} ${prev}→${next}`,
      acceptanceCriteria: [
        `decide whether ${id} needs migration tasks (kind:migration) for the ${prev}→${next} upgrade, and add them if so`,
      ],
    },
    {
      title: `Simulate upgrade for ${id} from ${prev} to ${next}`,
      acceptanceCriteria: [
        `simulate a user upgrading ${id} from ${prev} to ${next}; confirm the install-backlog + payload behave correctly`,
      ],
    },
  ];
  // For every OTHER enabled bundle that depends on `<id>` (its `requires` map names `<id>`): a constraint review.
  for (const other of (project.bundles as ReadonlyMap<BundleId, BundleManifest>).values()) {
    if (other.id !== id && (other.requires as ReadonlyMap<BundleId, VersionRange>).has(id as BundleId)) {
      tasks.push({
        title: `Review version constraint on ${id} at ${next}`,
        acceptanceCriteria: [
          `bundle ${other.id}'s requires-constraint on ${id} still admits ${next}; update the range if needed`,
        ],
      });
    }
  }
  return tasks;
}
```
> **Title shape — match doc-10:160 EXACTLY.** The doc gives the titles literally: `Review state-tasks for <id> at
> <new-version>`, `Consider migration tasks for <id> <prev>→<new>`, `Simulate upgrade for <id> from <prev> to
> <new>`, and (per requirer) `Review version constraint on <id> at <new-version>`. Use these strings verbatim
> (with the real id/version substituted). The `→` in the migration title is the literal arrow doc-10 uses (U+2192,
> the same glyph already in the source for the project — keep it). The requirer-constraint title is keyed on `<id>`
> + `<new-version>` (NOT on the requirer's id), per the doc — so multiple requirers each materialise the same-titled
> task and the harness de-dupes to ONE (idempotent-by-title is correct here: the work is "re-check pins against
> <id>@<new>", surfaced once). Confirm against doc-11's catalog wording; if doc-11 phrases an AC differently, the
> DOC wins — match it and note the divergence.

> **VERIFY doc-11 for the exact catalog wording** before finalizing the titles/AC — open `docs/11*.md`, find the
> version-bump task catalog, and conform the four titles to it. doc-10:160 is the authority for the title strings;
> doc-11 for the acceptance-criteria phrasing. Keep titles STABLE (they are the de-dup key).

---

## PART 2 — THE CLI LEAF (`bundleVersionModule`, a `PerBundleCommandModule` in `src/cli.ts`)

ADD ONE module and append it to `PER_BUNDLE_MODULES` — mirror `bundleShowModule`/`bundleMetaModule`, and the
`version`-group SHAPE from the PROJECT `version` group (`src/cli.ts` ~lines 978-1042): a `version` command WITH a
bare action (the read) AND `bump`/`set` subcommands.

```ts
/**
 * `bundle <id> version` (+ `bump`/`set`) (doc 10 rows 159/160/161), the per-bundle VERSION family — the
 * bundle-`<id>` analogue of the project `version` group. The bare `version` action is a READ (`runRead`); `bump`
 * and `set` are mutations (`runMutation`, so ④ RERENDER + ⑤ MATERIALISE are automatic). The `<id>` is already
 * resolved + enabled-guarded by the per-bundle routing and threaded in; no leaf re-resolves it.
 */
const bundleVersionModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    // ── bundle <id> version (bare = READ) ────────────────────────────────────────────────────────────────────
    const version = sub
      .command("version")
      .description("this bundle's version: print it, or bump/set it (doc 10)")
      .action(() => {
        const { value } = runRead(ctx.deps.fs, { root }, readBundleVersionSpec(), { id });
        ctx.io.out.write(`${value}\n`);
      });
    withExamples(version, [
      { command: `wpm bundle ${id} version`, note: "print this bundle's version" },
    ]);

    // ── bundle <id> version bump <major|minor|patch> ─────────────────────────────────────────────────────────
    // `.choices([...BUMP_LEVELS])` makes a bad value AND a missing required arg a commander USAGE error (exit 2,
    // changing nothing — 60#3) with no hand-rolled check; BUMP_LEVELS is the model's single source (the same set
    // the "bump-levels" completion enum uses).
    const bumpLeaf = version
      .command("bump")
      .addArgument(
        new Argument("<level>", "the semver level to advance the version by").choices([...BUMP_LEVELS]),
      )
      .description("advance this bundle's version by a semver level (major, minor, or patch) (doc 10)")
      .action((level: (typeof BUMP_LEVELS)[number]) => {
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, bumpBundleVersionSpec(), {
          id,
          level,
        });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(bumpLeaf, [
      { command: `wpm bundle ${id} version bump minor`, note: "advance the minor version (e.g. 0.1.0 → 0.2.0)" },
    ]);

    // ── bundle <id> version set <v> ──────────────────────────────────────────────────────────────────────────
    // A non-semver `<v>` is a bad CLI argument ⇒ a USAGE error (exit 2, changing nothing — 61#2; doc 13 §7).
    // Validate at the boundary via `parseSemVer` and raise `UsageError` (NOT `ValidationError`, which is exit 1)
    // so the operation receives an already-valid `SemVer`.
    const setLeaf = version
      .command("set")
      .argument("<version>", "the explicit semver to set as this bundle's version")
      .description("set this bundle's version to an explicit semver value (doc 10)")
      .action((versionRaw: string) => {
        const parsed = parseSemVer(versionRaw);
        if (!parsed.ok) {
          throw new UsageError(parsed.problem.message);
        }
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, setBundleVersionSpec(), {
          id,
          version: parsed.value,
        });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(setLeaf, [
      { command: `wpm bundle ${id} version set 1.0.0`, note: "pin this bundle's version to 1.0.0" },
    ]);
  },
};
```
- **Register it:** `const PER_BUNDLE_MODULES = [bundleShowModule, bundleMetaModule, bundleVersionModule];`. That
  is the ONLY routing-area change. (The routing, `dispatchPerBundle`, `requireEnabledBundle`,
  `buildPerBundleProgram`, and the per-bundle help/`-C` handling are unchanged — they already build the
  sub-program from `PER_BUNDLE_MODULES`.)
- **Imports in `cli.ts`:** add `bumpBundleVersionSpec`, `readBundleVersionSpec`, `setBundleVersionSpec` from
  `./core/operations/bundle-version.js`. `Argument`, `BUMP_LEVELS`, `parseSemVer`, `UsageError`, `withExamples`,
  `runMutation`, `runRead`, `lifecycleDepsFor`, `formatResult` are ALL already imported (the project `version`
  group + the per-bundle modules use them). Verify — add nothing redundant.
- **Why the bare `version` read prints raw (no `formatResult`):** the PROJECT `version` read prints `${value}\n`
  (the bare version string), so 59#1 ("prints the value of the version") matches and the read/bump/set output is
  consistent with the project family. `bump`/`set` print via `formatResult(result)` (the summary line is the new
  version — 60#1/61#1), exactly as the project `bump`/`set` do.

### Completion — ONE entry (the `<level>` enum; the `<id>` already completes)
`PER_BUNDLE_COMPLETION_SPECS` is keyed by the subcommand path WITHIN `bundle <id>` (verified: `commandPath` in
`src/completion/complete.ts` returns the space-joined chain from the per-bundle sub-program root, so the bump leaf
is `"version bump"`). Add:
```ts
const PER_BUNDLE_COMPLETION_SPECS: CompletionSpecs = {
  meta: { options: { "--confirmation-level": "confirmation-levels" } },
  "version bump": { args: ["bump-levels"] }, // <level> — the fixed major/minor/patch enum (the built-in source)
};
```
- The `<id>` position already completes from enabled bundles via the `bundle <tab>` id-position handling the
  task-57/58 story built (`COMPLETION_SPECS["bundle"]` unions verbs ∪ `bundle-ids`) — so 59#3 / 60#4 / 61#3 ("the
  id completes from enabled bundles") are ALREADY satisfied by the routing; this story adds no id-completion code.
- `set`'s `<version>` is a free value → no completion source (mirrors `project version set`, which has none).
- 60#4's "the level from major, minor, patch" is the `"version bump": { args: ["bump-levels"] }` entry above.

---

## Files to change
- **ADD** `src/core/operations/bundle-version.ts` — `readBundleVersionSpec` / `bumpBundleVersionSpec` /
  `setBundleVersionSpec` (+ the input types + `requireBundle`/`writeBundleVersion`/`bumpAuthoringTasks` helpers).
- **CHANGE** `src/cli.ts` — add `bundleVersionModule` (a `PerBundleCommandModule`); append it to
  `PER_BUNDLE_MODULES`; add `"version bump"` to `PER_BUNDLE_COMPLETION_SPECS`; import the three new specs.
- **ADD** `test/unit/cli/bundle-version-commands.test.ts` — the in-process AC tests (mirror
  `bundle-id-commands.test.ts` + `version-commands.test.ts`).
- **CHANGE/ADD** `test/integration/cli.bundle-id.e2e.test.ts` (extend it — same per-bundle E2E file) OR a new
  `test/integration/cli.bundle-version.e2e.test.ts` — the real-binary / real-backlog case (`bundle <id> version
  bump minor` on a real init'd project → the new version + the materialised tasks land in `.authoring-backlog`).
- (No `docs/`/`templates/`/`package.json`/`.bmad/`/`backlog/` change. No routing/dispatch/guard change in
  `cli.ts` beyond the one module + one completion entry.)

## Tests (AC-driven, in-process via `run()` + `MemoryFileSystem` fixtures; mirror the per-bundle + version tests)
Seed a realistic project at `/proj` (copy the seed shape from `bundle-id-commands.test.ts`): `manifest.yml` with
`bundles: [<list>]`; each `bundles/<id>/bundle.yml` (full schema — id/version/summary/confirmation/requires) — and
for the comment-preservation tests, seed the target bundle's `bundle.yml` WITH a leading comment + a known key
order; the project template snippets at the builtin root so ④ RERENDER resolves; `installer-skills/` exists;
FakeBacklog `init`'d at `.authoring-backlog`. **Crucially: seed TWO bundles where bundle-B `requires` bundle-A**
(e.g. `bundles/b/bundle.yml` with `requires:\n  a: ^0.1.0`), so bumping A materialises the requirer-constraint
task for B. Drive via `run(["bundle", <id>, "version", …, "-C", "/proj"], deps, io)`.

### `bundle <id> version` (task-59 — a READ)
- **AC#1/#2** — `bundle a version -C /proj` → exit 0; stdout trimmed === the bundle's `version` (e.g. `0.1.0`);
  the manifest AND `bundles/a/bundle.yml` are byte-identical after (read-only).
- **AC#3** — cwd a no-manifest dir, no `-C` → exit 1; `io.err` contains `manifest.yml` + `init`. **completion**:
  `bundle <tab>` includes the enabled ids (already handled by the routing; assert via the same `complete()`
  helper as `bundle-id-commands.test.ts`).
- **AC#4 help** — `bundle a version --help` → exit 0; has `Usage:` / `Example` / lists the `bump` AND `set`
  subcommands (commander renders them under "Commands:").

### `bundle <id> version bump` (task-60 — a MUTATION + MATERIALISE)
- **AC#1** — `it.each` over `[patch,0.1.0→0.1.1] [minor,0.1.0→0.2.0] [major,0.1.0→1.0.0] [minor,0.0.3→0.1.0]`:
  `bundle a version bump <level> -C /proj` → exit 0; stdout contains the NEW version; re-parse
  `bundles/a/bundle.yml` → `version === <new>`; the seeded leading comment SURVIVED (comment preservation).
- **AC#2 the materialise (incl the cross-bundle requirer-constraint task)** — after `bundle a version bump minor`
  (0.1.0→0.2.0), assert the FakeBacklog's `.authoring-backlog` tasks include the FOUR titles:
  `Review state-tasks for a at 0.2.0`, `Consider migration tasks for a 0.1.0→0.2.0`, `Simulate upgrade for a from
  0.1.0 to 0.2.0`, AND `Review version constraint on a at 0.2.0` (because B requires A). Assert via
  `backlog.listTasks(".authoring-backlog")` titles (the FakeBacklog records created tasks) AND/OR
  `result.materialisedTaskTitles`. **Idempotency**: run the bump AGAIN with a fresh bump from the same start (or
  re-run the materialise path) — re-materialising the SAME titles creates no duplicates (assert the count of each
  title stays 1). **Negative**: bump a bundle that NOTHING requires → the requirer-constraint task is ABSENT (only
  the 3 per-bundle tasks). **No-requirer-self**: bumping A does not materialise a constraint task FOR A about A.
- **AC#3** — `bundle a version bump sideways -C /proj` → exit 2; `bundles/a/bundle.yml` unchanged. AND a MISSING
  level `bundle a version bump -C /proj` → exit 2; unchanged.
- **AC#4** — no-project (no `-C`) → exit 1 naming `manifest.yml`. **completion**: `completeArgv` for the
  `version bump` `<level>` → `["major","minor","patch"]` (drive the per-bundle sub-program directly, mirroring
  `version-commands.test.ts`'s bump-completion test with `PER_BUNDLE_COMPLETION_SPECS`, OR assert via the
  real-binary `__complete`).
- **AC#5 help** — `bundle a version bump --help` → exit 0; has `Usage:` / `<level>` / `major` / `minor` / `patch`
  / `Example`.
- **rerender** — after a bump, `bundles/a/bundle.yml`'s new version flows to the front-door menu (the harness
  re-derived `AGENTS.md` from the post-apply project — assert `AGENTS.md` exists / reflects the bundle, mirroring
  the meta rerender test). NOTE: the menu shows the bundle summary line; the version flows per doc-10:34 — assert
  what the deriver actually renders (check the seed's snippet; if the menu line includes the version, assert it;
  else assert `AGENTS.md` was re-rendered / `result.changedPaths` includes it).

### `bundle <id> version set` (task-61 — a MUTATION)
- **AC#1** — `bundle a version set 2.5.0 -C /proj` → exit 0; stdout contains `2.5.0`; `bundles/a/bundle.yml`
  `version === "2.5.0"`; the seeded comment survived; ④ re-rendered (`AGENTS.md` exists).
- **AC#2** — `bundle a version set not-a-version -C /proj` → exit 2; `io.err` matches `/semantic version/i`;
  `bundles/a/bundle.yml` unchanged. AND a PARTIAL `1.2` → exit 2, unchanged.
- **AC#3** — no-project → exit 1 naming `manifest.yml`.
- **AC#4 help** — `bundle a version set --help` → exit 0; has `Usage:` / `<version>` / `Example`.

### Cross-cutting
- the task-28 help-completeness guard (`help-contract.test.ts`) — the per-bundle leaves live on the sub-program
  the top-level guard does not walk (verified: 57/58 added `show`/`meta` the same way with no guard change), so
  this should not trip; CONFIRM the guard stays green. Every new leaf carries a `withExamples` regardless.
- the task-29 completion tests stay green (the per-bundle recursion already exists; this adds one spec entry).
- a `bumpSemVer`-over-the-bundle unit check is OPTIONAL (the service is already unit-tested in
  `version-constraint.test.ts`); the operation-level bump tests cover the wiring.
- **real-binary / real-backlog** (`describeIfBuilt` + `execFileSync`, the `cli.bundle-id.e2e.test.ts` pattern):
  on a REAL init'd project with a real bundle (`init demo` → `bundle new a` → `bundle new b`, then make B require
  A — set it via `bundle b requires add a` if that command exists yet, ELSE write `requires` into
  `bundles/b/bundle.yml` directly in the test setup since `requires add` is family K, NOT yet built), run `node
  dist/cli.js bundle a version bump minor` → stdout has the new version; re-read `bundles/a/bundle.yml` → version
  advanced; AND the materialised tasks LAND in the REAL `.authoring-backlog` (assert via `node dist/cli.js`'s
  output `materialised: N authoring task(s)` AND/OR by listing the real backlog dir / running `backlog task list`
  in `.authoring-backlog`). Also: `bundle a version` prints the version; `bundle a version set 2.0.0` writes it;
  `bundle a version bump bogus` exits 2; `__complete bundle a version bump ""` → `major`/`minor`/`patch`. This is
  the loop-closure proof the foundation retro flagged (test the real binary + real backlog). Requires `npm run
  build` before the gate.
  - **NOTE on the requirer test on the real binary:** family K (`bundle <id> requires add`) is NOT built yet, so
    to make B require A on the real project, WRITE the `requires` map into `bundles/b/bundle.yml` in the test's
    setup (a plain file write — the test owns the fixture), then bump A and assert the `Review version constraint
    on a at <new>` task materialised. Keep this explicit in the test so a reviewer sees why the fixture is hand-set.

## DoD (the backlog DoD for tasks 59/60/61)
- `tsc --noEmit` clean; `biome check src test` clean **0/0** (run `--write` first). `vitest run` green (SINGLE
  process). `npm ci` clean. **Core import-boundary intact** — `bundle-version.ts` imports nothing effectful (the
  `bundle.yml` edit goes through the FileSystem port; `editYaml`/`bumpSemVer`/the model are pure; the per-invocation
  `let transition` is in-memory, not I/O). No dead code; the three specs + the `bundleVersionModule` documented.
  **Run `npm run build` before the final gate** so the real-binary + real-backlog tests execute (else
  `describeIfBuilt` SILENTLY SKIPS them — the cold-E2E lesson).

## Previous-story intelligence (carried forward)
- **Family I (per-bundle `show`/`meta`, just merged) established THE PER-BUNDLE REGISTRY this story plugs into:**
  `PerBundleCommandModule.register(sub, ctx, root, id)`, `PER_BUNDLE_MODULES`, `buildPerBundleProgram`,
  `requireEnabledBundle`, `PER_BUNDLE_COMPLETION_SPECS`, and the `run()`-level routing (`isPerBundleInvocation` /
  `dispatchPerBundle`, before commander — so per-bundle leaf `--help`/`-C` are NOT shadowed by the group). Adding a
  family = ONE module + (if completable opts) one completion entry. The seed shape + `complete()` helper (cwd=PROJ)
  come from `bundle-id-commands.test.ts`; the real-binary `describeIfBuilt` shape from `cli.bundle-id.e2e.test.ts`.
- **Family D (PROJECT version, merged) is the VERSION pattern this MIRRORS:** `version.ts`'s
  `readVersionSpec`/`bumpVersionSpec`/`setVersionSpec` + the `version`-group CLI shape (bare read + `bump`/`set`
  subcommands) + the bump/set tests in `version-commands.test.ts`. The KEY lesson: `summary` reports the
  POST-APPLY version directly — re-running `bumpSemVer` in `summary` DOUBLE-bumps (task-40). The ONLY delta vs the
  project family: edit `bundles/<id>/bundle.yml`'s `version` (not the manifest's `project.version`), bump
  MATERIALISES (the project version does not), and the prev→new pair is captured in ③ for the materialise titles.
- **task-25 `runMutation`/`runRead`**: ① LOAD reads `manifest.yml` + each ENABLED bundle's `bundle.yml` → so
  `project.bundles` holds EVERY enabled bundle (with its `requires` map) — that is what the requirer scan walks. ④
  RERENDER re-derives the front-door from the POST-APPLY (reloaded) project; ⑤ MATERIALISE the plan idempotently by
  title into `join(root, AUTHORING_BACKLOG_DIR)` (`.authoring-backlog`, NOT the project root — the materialise-root
  fix). `materialise`/`summary` thunks see the POST-APPLY project (the prev-version subtlety this story resolves).
- **task-13 `editYaml(text, doc => doc.setIn(["version"], value))`** is comment-AND-key-order preserving (eemeli/yaml
  `Document`; `setIn` replaces a scalar in place) — the mechanism for 60#1/61#1. `parseSemVer` validates `<v>` at
  the boundary (UsageError → exit 2). `bumpSemVer(current, level)` is the semver maths (doc 13 §4; `BUMP_LEVELS` +
  the `bump-levels` completion source already exist). `formatResult` renders the summary line + a `materialised: N
  authoring task(s)` line when tasks were created.
- **doc-10:160 is the authority for the four materialised titles; doc-11 for the AC phrasing** — VERIFY both before
  finalizing the titles. Keep titles byte-stable (the de-dup key). The `→` in the migration title is literal (U+2192).

## Boundaries (do NOT do here)
- Implement ONLY the `version` family (`version` bare / `bump` / `set`) for tasks 59/60/61. Do NOT touch the
  routing/dispatch/`requireEnabledBundle`/`buildPerBundleProgram` (you ADD one module + one completion entry — no
  more). Do NOT build family K `requires` (the requirer-constraint task scans existing `requires` maps; it does NOT
  add a `requires add` command). Do NOT re-implement `bumpSemVer` or `parseSemVer` (reuse). Do NOT re-run
  `bumpSemVer` in `summary` (double-bump). Do NOT let the `bundle.yml` edit re-serialise the whole document (use
  `setIn` → comments + key order preserved). Do NOT import `node:fs`/`commander`/`execa` under `src/core/**`. Do
  NOT edit `docs/`, the repo-root `AGENTS.md`/`CLAUDE.md`, `.bmad/`, `templates/`, or the dev `backlog/`. If
  doc-10/doc-11 specify something this sketch omits (esp. the title/AC wording), the DOC wins — conform + note the
  divergence in `--notes`.

## Dev Agent Record
### Agent Model Used
Opus 4.8 (1M) — bmad-create-story → bmad-dev-story → bmad-qa-generate-e2e-tests (Rule 3: the real skills ran).

### Completion Notes List
- **The operation (`src/core/operations/bundle-version.ts`, NEW) mirrors the project VERSION pattern** with the
  doc-mandated divergences: it edits `bundles/<id>/bundle.yml`'s top-level `version` (via the task-13
  comment-preserving `editYaml` `setIn(["version"], …)`), `bump` MATERIALISES the doc-11 task set, `set` does not.
  Three exports — `readBundleVersionSpec` (READ), `bumpBundleVersionSpec` (MUTATION+MATERIALISE),
  `setBundleVersionSpec` (MUTATION). Pure over the FileSystem port (imports only `node:path`, `editYaml`, the
  model, `version-constraint`'s `bumpSemVer`, `errors`, and lifecycle types — verified by the biome
  `noRestrictedImports` rule on `src/core/**`, 0 violations). `summary` reports the POST-APPLY version directly
  (no `bumpSemVer` re-run — the task-40 double-bump lesson). A `requireBundle` helper keeps each spec total
  (defense-in-depth with the routing's `requireEnabledBundle`).
- **The prev→new pair (the one real subtlety, resolved cleanly).** The materialised titles must name BOTH
  `<prev>` and `<new>` (doc-11 §76/§77), but the harness gives `materialise` the POST-APPLY project (where the
  version is already `<new>`), and a bump is non-invertible (a `minor`/`major` bump zeroes lower fields), so
  `<prev>` cannot be reconstructed from the post-apply state. Resolution: ③ APPLY (the only beat that sees the
  pre-apply version) captures `{ prev, next }` into a **per-invocation `let transition`** inside the
  `bumpBundleVersionSpec()` factory; ⑤ MATERIALISE reads it. This is NOT shared module state — the CLI builds a
  FRESH spec per `run()` (the action calls the factory), so successive/concurrent bumps never alias; the closure
  does no I/O (the only effect is `apply`'s port write); the lifecycle always runs ③ before ⑤. Documented inline
  + flagged for the reviewer. (Alternative — threading the pre-apply project through the lifecycle API — rejected
  as over-reach for one operation; if a future refactor passes the pre-apply project to `materialise`, drop the
  closure.)
- **The cross-bundle requirer scan (60#2)** walks the POST-APPLY `project.bundles` (the loader reads EVERY
  enabled bundle's `bundle.yml` with its `requires` map), including every OTHER bundle (`other.id !== id`) whose
  `requires` map names `<id>`, and emits `Review version constraint on <id> at <new>` — keyed on `<id>+<new>`
  (NOT the requirer's id, per doc-11), so multiple requirers de-dupe to ONE task. The four materialised titles +
  their AC are doc-11 §75-78 verbatim (the `→` in the migration title is the literal U+2192). Idempotent by title
  (the harness de-dupes) — tested: a re-bump to the same version creates no duplicates; a bundle nothing requires
  gets only the 3 per-bundle tasks; no self-constraint.
- **The CLI leaf is ONE `PerBundleCommandModule` (`bundleVersionModule`) appended to `PER_BUNDLE_MODULES` — NO
  routing change.** It registers `version` (bare action = the READ, prints `${value}\n`) + `bump` (`new
  Argument("<level>").choices([...BUMP_LEVELS])` → exit 2 on bad/missing; prints `formatResult`, whose summary is
  the new version + a `materialised: N` line) + `set` (`parseSemVer` → `UsageError` exit 2 on bad; prints
  `formatResult`), each with a `withExamples`. The routing, `dispatchPerBundle`, `requireEnabledBundle`,
  `buildPerBundleProgram`, and the per-bundle help/`-C` handling (the task-57/58 spine) are untouched. The only
  other change: one `PER_BUNDLE_COMPLETION_SPECS` entry `"version bump": { args: ["bump-levels"] }` for the
  `<level>` enum (the `<id>` already completes on `bundle <tab>`).
- **doc-11 conformance:** the AC wording was conformed to doc-11 §75-78 (more specific than the original story
  sketch — the DOC won, per AGENTS.md). doc-11:202 confirms the bump prints "Materialised N authoring tasks",
  consistent with `formatResult`'s materialised line.
- **Tests:** 26 in-process AC tests (`bundle-version-commands.test.ts`) over `MemoryFileSystem` + `FakeBacklog`
  with a TWO-bundle fixture (b requires a) — covering every AC for 59/60/61, the materialise (3 + the requirer
  task), idempotency, the negative + no-self-constraint cases, comment+key-order preservation, exit codes, help,
  the read-only invariant, no-project errors, the id completion, and the `<level>` completion (via the public
  `run()` `__complete` dispatch — no private-symbol imports). PLUS 5 real-binary/real-backlog E2E cases (extending
  `cli.bundle-id.e2e.test.ts`, `describeIfBuilt`): the loop-closure proof — `bundle a version bump minor` on a
  real init'd project advances `bundles/a/bundle.yml` AND lands the four bump tasks (incl `Review version
  constraint on a at 0.2.0`, proving the requirer scan over the REAL loaded project) in the REAL `.authoring-backlog`
  (asserted via `backlog task list --plain`); plus version/set/bad-level/completion/help/round-trip. (The requirer
  fixture is hand-set on disk in the test — `bundle <id> requires add` is family K, not yet built — with an
  explicit comment.)
- **Gate (cold, CI order):** `tsc --noEmit` 0 / `biome check src test` 0 errors 0 warnings (139 files, 3
  auto-formatted by `--write`) / `npm run build` 0 / `vitest run` **713 passed (69 files)** — up from the 682/68
  baseline (+26 unit + 5 E2E; the real-binary + real-backlog E2E executed against fresh `dist/`, NOT skipped) /
  `npm ci` 0 vulnerabilities. Core import-boundary intact (`bundle-version.ts` imports nothing effectful — the
  per-invocation `let` is in-memory, not I/O).

### File List
- ADD `src/core/operations/bundle-version.ts` — `readBundleVersionSpec` / `bumpBundleVersionSpec` /
  `setBundleVersionSpec` (+ `BundleVersionReadInput`/`BumpBundleVersionInput`/`SetBundleVersionInput` +
  `requireBundle`/`writeBundleVersion`/`bumpAuthoringTasks` helpers).
- CHANGE `src/cli.ts` — `bundleVersionModule` (a `PerBundleCommandModule`: `version` bare read + `bump` + `set`);
  appended to `PER_BUNDLE_MODULES`; `"version bump"` added to `PER_BUNDLE_COMPLETION_SPECS`; imported the three
  new specs from `./core/operations/bundle-version.js`. (No routing/dispatch/guard change.)
- ADD `test/unit/cli/bundle-version-commands.test.ts` — 26 in-process AC + routing + materialise + completion tests.
- CHANGE `test/integration/cli.bundle-id.e2e.test.ts` — added the version-family `describeIfBuilt` block (5 real-
  binary/real-backlog E2E cases) + the `authoringTaskTitles` / `projectWithRequirer` helpers + the `writeFileSync`
  import.

### Status
review
