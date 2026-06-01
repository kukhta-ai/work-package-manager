# Story cli-bundle-scripts — `bundle <id> scripts add` / `list` / `remove` (tasks 71 + 72 + 73)

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"command tree → per-bundle operations" + row 169 (`scripts add|list|remove <path>` →
> literally "Same as `files`, against `installer-scripts/` (install-time tooling; NOT delivered to user);
> `remove` deregisters and leaves the file, printing where"), doc 10 line 34 (implicit re-render), doc 06 lines
> 77/96 + doc 07 line 51 (`installer-scripts/` is install-time TOOLING — probes, smoke tests — NOT delivered;
> on disk a SIBLING of `payload/`), doc 13 §5/§8 (lifecycle) + §1/§7 (core purity / error model)). This is
> **per-bundle family N** in the CLI epic-2, the THIRD and final payload-reference family. It is a **pure reuse**
> of Families L (`files`) and M (`templates`): the GENERIC, descriptor-driven payload-reference operation
> (`src/core/operations/payload-refs.ts`) and the generalised completion factories
> (`payloadOnDiskSource`/`payloadRegisteredSource`) already exist — N adds **a new descriptor + a model category
> + a schema branch + a CLI module + a completion bind + a create-bundle init**, nothing else. The operation
> itself does NOT change.

## Acceptance criteria (verbatim from the backlog)

### TASK-71 — `bundle <id> scripts add <path>` (a MUTATION; doc-10 row 169 = "Same as `files`")
1. When the path exists under the bundle `installer-scripts`, the reference is registered and no file content is
   written or modified.
2. Registering a path that does not exist on disk fails with a typed error and a non-zero exit, registering
   nothing.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the path completes from files present under `installer-scripts`.
4. Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.

### TASK-72 — `bundle <id> scripts list` (a READ; doc-10 row 169)
1. The command enumerates the registered installer-scripts for the bundle.
2. The command reads and reports only, with no change on disk, and exits 0 on success.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id completes from enabled bundles.
4. Help output is substantive (description, synopsis, an example).

### TASK-73 — `bundle <id> scripts remove <path>` (a MUTATION; doc-10 row 169)
1. The reference is deregistered and the command prints that the file was left at `installer-scripts` for the
   author to delete deliberately.
2. The file content is left untouched on disk: deregister, not delete.
3. Deregistering a path that is not registered fails with a typed not-found error and a non-zero exit.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the path completes from registered installer-scripts.
5. Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.

## doc-10 contract (cite the row)
> `bundle <id> scripts add|list|remove <path>` (row 169) → "**Same as `files`**, against `installer-scripts/`
> (install-time tooling; NOT delivered to user); `remove` deregisters and leaves the file, printing where". The
> `files` rows it inherits from: add (165) = "Validate `bundles/<id>/installer-scripts/<path>` exists on disk;
> register reference in `bundle.yml` payload list or equivalent; CLI does NOT write file content"; list (166) =
> "Enumerate registered installer-scripts (or scan `installer-scripts/`)"; remove (167) = "Deregister the
> reference; leave the file on disk; print 'deregistered; file left at `installer-scripts/<path>` — delete it
> yourself if you meant to'". [Source: docs/10 §command tree + §Per-command actions row 169 (delegating to rows
> 165/166/167 with `installer-scripts/` substituted).] Auto-rerender: per-bundle mutations "carry this implicit
> re-render." [docs/10 line 34.]

> doc-06/07 — what `installer-scripts/` IS: doc-06 line 77 "`installer-scripts/ [OPT]` — install-time TOOLING —
> runs DURING install (probes, smoke tests); not delivered"; doc-07 line 51 "`installer-scripts/` … install-time
> tooling (probes, smoke tests); not delivered (as in 06)". doc-06 line 96 names the bundle shape
> "`payload/{files,templates,agent-skills} installer-scripts/ install-backlog/ …`" — confirming
> `installer-scripts/` is a SIBLING of `payload/` ON DISK (both at the same depth under the bundle dir), NOT a
> child of it. [Source: docs/06 lines 77/96; docs/07 line 51.]

## No DIVERGENCE for N (the contract is unchanged)
L introduced the `payload:` registry (recorded as L's divergence — the doc-permitted "or equivalent"). M added
`payload.templates`. **N adds a THIRD category (`payload.scripts`) under the same already-accepted `payload:`
mapping** — exactly the extension L's story predicted ("the SAME `payload.<category>` shape generalises to … N
(`payload.scripts` ← `installer-scripts/`)"). There is NO new contract change and NO user gate. The only N-
specific subtlety is the on-disk-dir vs registry-key relationship, recorded next.

## Key-name decision (record this — the one N-specific nuance)
**On-disk directory `installer-scripts/` (a SIBLING of `payload/`, NOT under it), registry key `payload.scripts`
(under the `payload:` map, alongside `files`/`templates`).** This intentional asymmetry is correct and grounded:

- **The on-disk dir is `installer-scripts`, not `payload/installer-scripts`.** doc-06:96/77 + doc-07:51 place
  `installer-scripts/` as a sibling of `payload/` on disk — it is install-time TOOLING (probes, smoke tests),
  **NOT delivered to the user**, deliberately separated from the delivered `payload/`. So the descriptor's
  `onDiskDir` is `"installer-scripts"` (the existence check + the `remove` "left at …" message both reference
  `installer-scripts/<path>`). L/M used `payload/files` / `payload/templates`; N breaks that prefix —
  the descriptor decouples on-disk dir from yml key precisely so this is a one-field change.
- **The registry key stays `payload.scripts`** (under the `payload:` map), for representational consistency with
  `files`/`templates`. Rationale: the `payload:` mapping in `bundle.yml` is the CLI's **reference REGISTRY** —
  a list of registered reference paths per category — **not a claim that every category is delivered**. The
  delivered-vs-install-time distinction is a downstream BUILD/PACKAGING concern (tasks 82–84: what goes into the
  shipped artifact), decided by WHICH on-disk directory a category maps to, NOT by where its reference list is
  recorded. Keeping all three reference lists together under one `payload:` map keeps the registry uniform and
  self-describing (one place to read "what has this bundle registered"); fragmenting `scripts` into a separate
  top-level key would buy nothing and complicate the model/schema/serializer for no contract benefit. doc-10
  row 169 says "register reference in `bundle.yml` payload list **or equivalent**" — it does not mandate a
  separate key, so `payload.scripts` is within contract.
- **If a doc reason emerges to use a different top-level key**, it would have to be grounded in doc-10; absent
  that, default to `payload.scripts`. (This story uses `payload.scripts`; the decision is recorded in the
  Completion Notes too.)

## All three are project-BOUND + per-bundle-routed (NO new routing)
`<id>` is resolved + enabled-guarded by the EXISTING per-bundle routing (`isPerBundleInvocation` /
`dispatchPerBundle` → `resolveContext` → `requireEnabledBundle`), satisfying 71#3 / 72#3 / 73#4 (the
`NO_PROJECT_MESSAGE` names `manifest.yml` + `init` + `-C`). The resolved `root` + `id` are threaded into
`bundleScriptsModule.register`. **This story adds ZERO routing/dispatch/guard code** — `bundleScriptsModule` is
appended to `PER_BUNDLE_MODULES`.

---

## REVIEWER NIT TO HONOR (carried from L's review, applied in M): descriptor genericises the OPERATION, not the SCHEMA
Adding the `scripts` category is **four touches**, not one (the `parsePayloadCategory` helper M introduced makes
(2)/(3) trivial):
1. a `scripts: readonly string[]` field on `BundlePayload` (the model),
2. a `parsePayload` call to `parsePayloadCategory(raw.scripts, "payload.scripts", ctx)` (absent ⇒ `[]`),
3. `serializeBundleManifest` emitting `scripts: [...]`,
4. `SCRIPTS_DESCRIPTOR` beside `FILES_DESCRIPTOR`/`TEMPLATES_DESCRIPTOR`.
Plus the CLI module, the completion binds, and `create-bundle` init. Missing any of (1)–(3) breaks `scripts
list` (the parser is on the LOAD path for every command).

---

## PART 1 — THE MODEL + SCHEMA EXTENSION (add the `scripts` category) — minimal, absent ⇒ empty

### `src/core/model/bundle.ts` — add `scripts` to `BundlePayload`
```ts
export interface BundlePayload {
  /** Registered `payload/files/` reference paths (relative to `payload/files/`), in registration order. */
  readonly files: readonly string[];
  /** Registered `payload/templates/` reference paths (relative to `payload/templates/`), in registration order. */
  readonly templates: readonly string[];
  /** Registered `installer-scripts/` reference paths (relative to `installer-scripts/`), in registration order. */
  readonly scripts: readonly string[];
}
```
Update the interface JSDoc to note `scripts` references `installer-scripts/` (install-time tooling, NOT
delivered — a sibling of `payload/` on disk) while still being recorded in the `payload:` reference registry.

### `src/core/services/schema/bundle.ts` — round-trip `payload.scripts` (absent ⇒ empty)
- Extend `BundleManifestData.payload` to add `readonly scripts: readonly string[]`.
- In `parsePayload`, add the third category line using the EXISTING `parsePayloadCategory` helper M introduced:
  ```ts
  const scripts = parsePayloadCategory(raw.scripts, "payload.scripts", ctx);
  if (!scripts.ok) return scripts;
  return ok({ files: files.value, templates: templates.value, scripts: scripts.value });
  ```
  and extend the `raw === undefined` short-circuit to `{ files: [], templates: [], scripts: [] }`.
- In `serializeBundleManifest`, emit `scripts: [...bundle.payload.scripts]` in the `payload` object.

> **Compatibility (HARD, unchanged from L/M):** an OLD bundle.yml with NO `payload:` key, or a partial one (only
> `files`/`templates`), MUST still parse — the missing `scripts` becomes `[]`. Extend the schema unit tests for
> "absent payload ⇒ scripts empty", "files+templates-only payload ⇒ scripts empty", and "populated scripts
> round-trips".

### `src/core/operations/create-bundle.ts` — init `scripts: []` for a NEW bundle
Extend the `manifest: BundleManifest` literal's payload to `payload: { files: [], templates: [], scripts: [] }`
so a fresh bundle.yml carries `payload:\n  files: []\n  templates: []\n  scripts: []`.

---

## PART 2 — THE DESCRIPTOR (`src/core/operations/payload-refs.ts`, ADD `SCRIPTS_DESCRIPTOR` — the op is UNCHANGED)

Add ONE export beside `FILES_DESCRIPTOR`/`TEMPLATES_DESCRIPTOR`. DO NOT touch the generic specs.
```ts
/**
 * The `scripts` descriptor (Family N) — `installer-scripts/` ↔ `bundle.yml`'s `payload.scripts` (doc 10 row 169,
 * "Same as `files`, against `installer-scripts/`"). NOTE the asymmetry (recorded in the story's Key-name
 * decision): the ON-DISK directory is `installer-scripts` — a SIBLING of `payload/`, install-time tooling NOT
 * delivered to the user (doc 06 line 77 / doc 07 line 51) — while the REGISTRY key stays under `payload.scripts`
 * for representational consistency with files/templates (the `payload:` map is the reference registry, not a
 * delivery claim; delivery is a downstream build concern). The descriptor decouples the two, so this is a
 * one-field change.
 */
export const SCRIPTS_DESCRIPTOR: PayloadRefDescriptor = {
  onDiskDir: "installer-scripts",
  ymlPath: ["payload", "scripts"],
  select: (bundle) => bundle.payload.scripts,
  noun: "script",
};
```
This makes `remove`'s summary read "deregistered; script left at `installer-scripts/<path>` — delete it
yourself if you meant to" (73#1) and the add error name `installer-scripts` (71#2) — both fall out of the
descriptor's `onDiskDir`/`noun`. **Verify**: the `onDiskDir` is `installer-scripts`, NOT `payload/installer-
scripts` — the CLI add existence check joins `bundles/<id>/installer-scripts/<path>` and the `remove` message
prints `installer-scripts/<path>`.

---

## PART 3 — THE CLI MODULE (`src/cli.ts`, add ONE `bundleScriptsModule`)

Copy `bundleTemplatesModule` (just merged for M), substituting `SCRIPTS_DESCRIPTOR`, the noun "script(s)", and
the `installer-scripts` wording in descriptions/examples. The EXISTENCE CHECK for `add` stays in the CLI layer.

```ts
const bundleScriptsModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const scripts = sub
      .command("scripts")
      .description(
        "register or inspect this bundle's installer-scripts (install-time tooling; not delivered) (doc 10)",
      );

    // ── scripts add <path> ─────────────────────────────────────────────────────────────────────────────────
    const addLeaf = scripts
      .command("add")
      .argument(
        "<path>",
        "a path the agent has already placed under installer-scripts (relative to installer-scripts)",
      )
      .description(
        "register an install-time script the agent placed under installer-scripts (doc 10)",
      )
      .action((path: string) => {
        // 71#2: the file MUST exist on disk under installer-scripts/<path>; else a typed NotFound (exit 1) with
        // nothing registered. The pure operation `check` has no ports, so the existence probe lives here.
        const onDisk = join(root, "bundles", id, SCRIPTS_DESCRIPTOR.onDiskDir, path);
        if (!ctx.deps.fs.exists(onDisk)) {
          throw new NotFoundError(
            `no file at bundles/${id}/${SCRIPTS_DESCRIPTOR.onDiskDir}/${path} — place the file there first, then register it`,
          );
        }
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          addPayloadRefSpec(SCRIPTS_DESCRIPTOR),
          { id, path },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(addLeaf, [
      {
        command: "wpm bundle web-handoff scripts add probe.sh",
        note: "register installer-scripts/probe.sh the agent placed (install-time, not delivered)",
      },
    ]);

    // ── scripts list ───────────────────────────────────────────────────────────────────────────────────────
    const listLeaf = scripts
      .command("list")
      .description("list this bundle's registered installer-scripts references (doc 10)")
      .action(() => {
        const { value } = runRead(ctx.deps.fs, { root }, listPayloadRefsSpec(SCRIPTS_DESCRIPTOR), {
          id,
        });
        ctx.io.out.write(formatPayloadList(value, SCRIPTS_DESCRIPTOR.noun));
      });
    withExamples(listLeaf, [
      { command: `wpm bundle ${id} scripts list`, note: "list registered installer-scripts" },
    ]);

    // ── scripts remove <path> ──────────────────────────────────────────────────────────────────────────────
    const removeLeaf = scripts
      .command("remove")
      .argument(
        "<path>",
        "the registered installer-scripts reference to deregister (the file is left on disk)",
      )
      .description("deregister an installer-scripts reference, leaving the file on disk (doc 10)")
      .action((path: string) => {
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          removePayloadRefSpec(SCRIPTS_DESCRIPTOR),
          { id, path },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [
      {
        command: "wpm bundle web-handoff scripts remove probe.sh",
        note: "deregister installer-scripts/probe.sh (the file stays on disk)",
      },
    ]);
  },
};
```
Append `bundleScriptsModule` to `PER_BUNDLE_MODULES` (after `bundleTemplatesModule`). `formatPayloadList(value,
SCRIPTS_DESCRIPTOR.noun)` → `(no scripts)` when empty.

**Imports to add in `src/cli.ts`:** add `SCRIPTS_DESCRIPTOR` to the existing `./core/operations/payload-refs.js`
import.

## PART 4 — COMPLETION (`PER_BUNDLE_COMPLETION_SPECS` + the generalised factories)
71#3 `<path>` (add) completes from files PRESENT under `installer-scripts/`; 73#4 `<path>` (remove) completes
from the REGISTERED scripts. Reuse the M factories — NO new completion-source files:
- In `defaultRegistry()`, register `payload-scripts-on-disk` → `payloadOnDiskSource("installer-scripts")` and
  `payload-scripts-registered` → `payloadRegisteredSource(b => b.payload.scripts)`.
- In `PER_BUNDLE_COMPLETION_SPECS`:
  ```ts
  "scripts add": { args: ["payload-scripts-on-disk"] },
  "scripts remove": { args: ["payload-scripts-registered"] },
  ```

> The factory `payloadOnDiskSource(onDiskDir)` takes the on-disk dir, so `installer-scripts` (a non-`payload/`
> dir) works with no change — this is exactly why M generalised it. Confirm the on-disk completion walks
> `bundles/<id>/installer-scripts/` (NOT `payload/installer-scripts/`).

## PART 5 — TEST PLAN (unit in-process + real-binary E2E; every AC mapped)

### Schema unit (`test/unit/schema/bundle.test.ts`, EXTEND the payload block)
- absent `payload` ⇒ `payload.scripts` is `[]` (alongside files/templates empty).
- a `payload` with `files`+`templates` only ⇒ `payload.scripts` is `[]` (partial-payload compatibility).
- a populated `payload: { scripts: [a, b] }` parses to `["a","b"]`; round-trips via serialize→parse.
- `serialize` always emits `payload.scripts` (empty ⇒ `[]`) — update the "serialize always emits" assertion to
  `{ files: [], templates: [], scripts: [] }`.
- `payload.scripts` not a list / an entry not a string → rejected naming `payload.scripts`.

### Unit (`test/unit/cli/bundle-scripts-commands.test.ts`, NEW — mirror `bundle-templates-commands.test.ts`)
Seed `/proj` with bundle `a` (comment + known key order, NO payload key) and PLACE real files under
`${PROJ}/bundles/a/installer-scripts/` (NOT under payload/ — e.g. `probe.sh`, `sub/smoke.sh`). Init the
authoring backlog + seed template snippets so ④ RERENDER resolves.
- **71#1** add existing `probe.sh` → `payload.scripts` on disk is `[probe.sh]`; the placed file's bytes
  UNCHANGED; comment + key order preserved (key order ends `…requires, payload`); exit 0.
- **71#1 idempotent** — add twice → still `[probe.sh]` (set-like).
- **71#1 second path** — add `probe.sh` then `sub/smoke.sh` → registration order.
- **71#2 not-on-disk** — `scripts add ghost.sh` → exit 1 (typed, names the path AND `installer-scripts`),
  bundle.yml byte-identical.
- **71#3 outside-project** — exit 1 naming `manifest.yml` + `init`.
- **71#3 completion (add)** — `__complete bundle a scripts add <tab>` → the on-disk paths under
  `installer-scripts/`.
- **71#4 help** — Usage + `<path>` + Example.
- **72#1/#2** list with two registered → exact stdout `probe.sh\nsub/smoke.sh\n`; manifest + bundle.yml unchanged
  (read-only).
- **72#1 empty** — list with none registered → `(no scripts)`.
- **72#3 outside-project** — exit 1 naming `manifest.yml`; **id completes from enabled bundles**.
- **72#4 help** — Usage + Example.
- **73#1** remove a registered `probe.sh` → gone from `payload.scripts`; SUMMARY contains `left at
  installer-scripts/probe.sh`; exit 0.
- **73#2 file-left-on-disk** — after remove, the file STILL exists under `installer-scripts/` with unchanged
  content.
- **73#3 not-registered** — `scripts remove not-there.sh` → exit 1 (NotFound), bundle.yml unchanged.
- **73#4 outside-project** — exit 1 naming `manifest.yml`. **73#4 completion (remove)** — register two;
  `__complete bundle a scripts remove <tab>` → exactly the registered refs.
- **73#5 help** — Usage + `<path>` + Example.
- **end-to-end in-process** — add → list (shows) → remove → list (`(no scripts)`) + file on disk + comment
  survives.
- **rerender** — after add, `${PROJ}/AGENTS.md` exists.
- **scripts group help** — lists add/list/remove.
- **on-disk location** — assert the placed file is under `bundles/a/installer-scripts/` and NOT under
  `bundles/a/payload/installer-scripts/` (locks the sibling-of-payload decision; a `scripts add` for a file
  placed under `payload/installer-scripts/` must FAIL the existence check).
- **three-category coexistence** — register a `files`, a `templates`, AND a `scripts` ref; all three appear in
  `bundle.yml`; removing the script leaves files + templates intact (the schema round-trips all three).

### Real-binary E2E (append to `test/integration/cli.bundle-id.e2e.test.ts`, `describeIfBuilt`)
Through `dist/cli.js` + real `NodeFileSystem` tmpdir + real `backlog`. Add a `placeInstallerScript(proj, bundle,
rel, content)` helper (mkdir `bundles/<bundle>/installer-scripts/` — NOT under payload/ — + writeFile).
- 71#1: place `probe.sh`; `bundle web scripts add probe.sh` → exit 0; `bundles/web/bundle.yml` gains `payload:`
  … `scripts:` … `- probe.sh` (real eemeli/yaml round-trip); the placed file's CONTENT unchanged.
- 71#2: `bundle web scripts add ghost.sh` (not placed) → exit 1; bundle.yml unchanged.
- 72#1: after add, `bundle web scripts list` → stdout contains `probe.sh`; a fresh bundle prints `(no scripts)`.
- 73#1/#2: `bundle web scripts remove probe.sh` → exit 0; stdout contains `left at installer-scripts/probe.sh`;
  the entry is gone from bundle.yml; the file is STILL on disk under `installer-scripts/` (existsSync).
- 73#3: `bundle web scripts remove nope.sh` (not registered) → exit 1; bundle.yml unchanged.
- completion: `__complete bundle web scripts add` (file placed under installer-scripts) → lists it; `__complete
  bundle web scripts remove` (registered) → lists it.
- help: `bundle web scripts add --help` → contains `bundle web scripts add` + `<path>` + Example.
- **OLD-bundle.yml compat (real binary)** — a `bundle.yml` with NO `payload:` key still drives `scripts list`
  (`(no scripts)`) and `scripts add` (adds the field) — absent ⇒ empty end-to-end.

---

## Dev Notes

### Files to ADD
- `test/unit/cli/bundle-scripts-commands.test.ts` — the unit suite (mirror `bundle-templates-commands.test.ts`).

### Files to CHANGE
- `src/core/model/bundle.ts` — add `scripts: readonly string[]` to `BundlePayload`.
- `src/core/services/schema/bundle.ts` — `parsePayload` `scripts` line (via `parsePayloadCategory`) +
  `serializeBundleManifest` + `BundleManifestData.payload` (absent/partial ⇒ empty).
- `src/core/operations/payload-refs.ts` — add `SCRIPTS_DESCRIPTOR` (`onDiskDir: "installer-scripts"`; the op is
  UNCHANGED).
- `src/core/operations/create-bundle.ts` — init `payload: { files: [], templates: [], scripts: [] }`.
- `src/cli.ts` — add `bundleScriptsModule`; append to `PER_BUNDLE_MODULES`; add the two completion specs; import
  `SCRIPTS_DESCRIPTOR`. (`formatPayloadList` already generic from M.)
- `src/completion/registry.ts` — register `payload-scripts-on-disk` + `payload-scripts-registered` via the
  factories.
- `test/unit/schema/bundle.test.ts` — extend the payload block with the `scripts` round-trip / absent- /
  partial-⇒-empty / malformed cases (+ update the "serialize always emits" assertion to include `scripts: []`).
- `test/integration/cli.bundle-id.e2e.test.ts` — append the scripts real-binary E2E block + a
  `placeInstallerScript` helper.
- **Test fixtures (BundleManifest literals)** — add `scripts: []` beside `files: []`/`templates: []` in every
  `BundleManifest`-typed fixture: `test/unit/model/aggregates.test.ts`, `test/unit/services/validate.test.ts`,
  `test/unit/services/validate.acceptance.test.ts`, `test/unit/services/version-constraint.acceptance.test.ts`,
  `test/unit/services/derived-artefacts.test.ts`, `test/unit/services/derived-artefacts.acceptance.test.ts`,
  `test/unit/operations/create-bundle.test.ts`. (The schema-test fixtures passing `payload` as untyped DATA into
  `parseBundleManifest` need NO change.)

### Architecture constraints (doc 13 — HARD, unchanged from L/M)
- **Core boundary**: `payload-refs.ts` stays pure — adding `SCRIPTS_DESCRIPTOR` introduces NO new import. The fs
  EXISTENCE CHECK for `add` lives in the CLI shell. Completion uses the factories under `src/completion/` reading
  via the fs port. (`core-boundary.test.ts` + Biome `noRestrictedImports` enforce this.)
- **Core is synchronous**; add/list/remove actions are sync.
- **Error model** (docs/13 §7): not-on-disk (add) and not-registered (remove) → `NotFoundError` (exit 1),
  registering/deregistering nothing. Outside-project → the routing's `NotFoundError`. No `UsageError` path.
- **Lifecycle**: add/remove ride `runMutation` (④ RERENDER auto; NO `materialise`); list rides `runRead`.
  Structure-not-content: add NEVER writes content; remove NEVER deletes the file.

### Reuse — do NOT reinvent
- The ENTIRE operation: `addPayloadRefSpec`/`listPayloadRefsSpec`/`removePayloadRefSpec`. N adds ONLY
  `SCRIPTS_DESCRIPTOR`.
- The CLI module shape: copy `bundleTemplatesModule` (just merged) verbatim, substituting descriptor + noun +
  `installer-scripts` wording.
- The completion factories: `payloadOnDiskSource` / `payloadRegisteredSource` (M) — N just binds two more names.
- `formatPayloadList` / `formatResult` / `withExamples` / `lifecycleDepsFor`.
- The `parsePayloadCategory` schema helper (M) — N adds one call.

### Project Structure Notes
- N is the SECOND proof the descriptor seam holds AND the FIRST proof it handles a non-`payload/` on-disk dir.
  If N is more than (descriptor + module + model field + schema line + completion binds + create-bundle init +
  tests), the generalisation is leaking.
- N is the LAST payload-reference family — after it, all of `files`/`templates`/`scripts` share one operation,
  one schema shape (three categories), and one completion factory pair. The build/packaging tasks (82–84) then
  consume `payload.{files,templates}` as DELIVERED and `payload.scripts` (← `installer-scripts/`) as install-
  time-only — the delivery distinction lives THERE, downstream, not in this reference registry.

### References
- [Source: docs/10-authoring-cli.md §command tree + §Per-command actions row 169 ("Same as `files`, against
  `installer-scripts/` (install-time tooling; NOT delivered)") delegating to rows 165/166/167; line 34 implicit
  re-render.]
- [Source: docs/06-project-skeleton.md lines 77 (`installer-scripts/ [OPT]` — install-time tooling, NOT
  delivered) + 96 (the `payload/{files,templates,agent-skills} installer-scripts/` bundle shape — sibling);
  docs/07-install-contract.md line 51.]
- [Source: docs/13-core-architecture.md §5/§8 (lifecycle) + §7 (error model) + §1 (core purity / ports).]
- [Source: src/core/operations/payload-refs.ts — the GENERIC op + `FILES_DESCRIPTOR`/`TEMPLATES_DESCRIPTOR` (the
  template for `SCRIPTS_DESCRIPTOR`); src/cli.ts `bundleTemplatesModule` + `PER_BUNDLE_MODULES` +
  `PER_BUNDLE_COMPLETION_SPECS`; src/completion/payload-files-on-disk.ts + payload-files-registered.ts (the
  factories to bind); src/core/services/schema/bundle.ts `parsePayloadCategory` (the helper to call).]
- [Source: _bmad-output/implementation-artifacts/stories/story-cli-bundle-files.md +
  story-cli-bundle-templates.md — Families L and M; N is their predicted extension.]

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — BMAD build worker. Skills actually run (Rule 3 evidence): `bmad-create-story` (this
story), `bmad-dev-story` (code + unit tests + schema tests), `bmad-qa-generate-e2e-tests` (the real-binary E2E
block).

### Completion Notes List
- **No DIVERGENCE.** N added a THIRD category (`payload.scripts`) under L's already-accepted `payload:` mapping —
  the extension L's story predicted. No contract change, no user gate.
- **Registry-key decision (recorded):** on-disk dir `installer-scripts/` (descriptor `onDiskDir:
  "installer-scripts"`, a SIBLING of `payload/` per doc-06:96/77 + doc-07:51 — install-time tooling NOT
  delivered) BUT registry key `payload.scripts` (under the `payload:` map, with files/templates). The `payload:`
  map is the CLI's reference REGISTRY, not a delivery claim; the delivered-vs-install-time distinction is a
  downstream build/packaging concern (tasks 82–84) decided by WHICH on-disk dir a category maps to, not by where
  its reference list lives. doc-10:169 permits "register reference in `bundle.yml` payload list or equivalent" —
  it does not mandate a separate key. Defaulted to `payload.scripts`; no doc reason to deviate.
- **Reviewer NIT honored (four touches):** `BundlePayload.scripts`; a `parsePayload` line via the existing M
  `parsePayloadCategory(raw.scripts, "payload.scripts", ctx)`; `serializeBundleManifest` emits scripts;
  `SCRIPTS_DESCRIPTOR`. Generic op UNCHANGED.
- **create-bundle** inits `payload: { files: [], templates: [], scripts: [] }`.
- **CLI**: `bundleScriptsModule` copied from `bundleTemplatesModule` (substituting `SCRIPTS_DESCRIPTOR` + the
  "script" noun + `installer-scripts` wording), appended to `PER_BUNDLE_MODULES`. The descriptor's
  `onDiskDir: "installer-scripts"` makes the add existence check join `bundles/<id>/installer-scripts/<path>`
  (NOT `payload/installer-scripts`) and `remove`'s message print `left at installer-scripts/<path>` (73#1).
- **Completion**: reused the M factories — `payload-scripts-on-disk` → `payloadOnDiskSource("installer-scripts")`
  and `payload-scripts-registered` → `payloadRegisteredSource(b => b.payload.scripts)`. NO new completion files
  (the factory takes the on-disk dir, so a non-`payload/` dir works unchanged — exactly why M generalised them).
- **Test fixtures**: every `BundleManifest`-typed literal gained `scripts: []` (7 files). Schema-test untyped
  DATA fixtures left as-is.
- **Sibling-of-payload test** (the N-specific nuance, made concrete): a file placed under
  `payload/installer-scripts/` (the WRONG dir) FAILS the existence check — only `installer-scripts/<path>`
  satisfies `scripts add`. Plus a **three-category coexistence test**: register files + templates + scripts; all
  three round-trip in `bundle.yml`; removing the script leaves files + templates intact.
- Gate (incremental, in-process): tsc clean; biome ci clean (153 files); scripts unit + schema + templates +
  files + completion = 123/123; FULL vitest after `npm run build` = 848/848 (73 files). Real-binary scripts E2E
  added in the qa step (separate).

### File List
- CHANGE `src/core/model/bundle.ts` — add `scripts: readonly string[]` to `BundlePayload` (+ JSDoc noting
  installer-scripts is install-time, not delivered, a sibling of payload/).
- CHANGE `src/core/services/schema/bundle.ts` — `parsePayload` scripts line (via `parsePayloadCategory`) +
  undefined short-circuit + `serializeBundleManifest` + `BundleManifestData.payload`.
- CHANGE `src/core/operations/payload-refs.ts` — add `SCRIPTS_DESCRIPTOR` (`onDiskDir: "installer-scripts"`;
  generic op UNCHANGED).
- CHANGE `src/core/operations/create-bundle.ts` — init `payload: { files: [], templates: [], scripts: [] }`.
- CHANGE `src/cli.ts` — `bundleScriptsModule` + append to `PER_BUNDLE_MODULES`; two completion specs; import
  `SCRIPTS_DESCRIPTOR`.
- CHANGE `src/completion/registry.ts` — register `payload-scripts-on-disk` + `payload-scripts-registered` via the
  M factories.
- ADD `test/unit/cli/bundle-scripts-commands.test.ts` — the unit suite (incl. sibling-of-payload + three-category
  coexistence).
- CHANGE `test/unit/schema/bundle.test.ts` — extend the payload block with scripts round-trip / absent / partial
  / both-/three-populated / malformed cases (+ update the "serialize always emits" assertion to all three).
- CHANGE (test fixtures, +`scripts: []`) `test/unit/model/aggregates.test.ts`,
  `test/unit/services/validate.test.ts`, `test/unit/services/validate.acceptance.test.ts`,
  `test/unit/services/version-constraint.acceptance.test.ts`, `test/unit/services/derived-artefacts.test.ts`,
  `test/unit/services/derived-artefacts.acceptance.test.ts`, `test/unit/operations/create-bundle.test.ts`.
- (qa step) CHANGE `test/integration/cli.bundle-id.e2e.test.ts` — append the scripts real-binary E2E block.
