# Story cli-bundle-templates — `bundle <id> templates add` / `list` / `remove` (tasks 68 + 69 + 70)

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"command tree → per-bundle operations" + row 168 (`templates add|list|remove <path>` →
> literally "Same as `files`, against `payload/templates/`; `remove` deregisters and leaves the file, printing
> where"), doc 10 line 34 (implicit re-render), doc 06 lines 77/96 (`payload/templates/` delivers to the
> environment — parameterized content), doc 07 lines 46-65 (the payload layout), doc 13 §5/§8 (the lifecycle) +
> §1/§7 (core purity / error model)). This is **per-bundle family M** in the CLI epic-2. It is a **pure reuse**
> of the just-merged **Family L** (`bundle <id> files`): L built the GENERIC, descriptor-driven
> payload-reference operation (`src/core/operations/payload-refs.ts`) precisely so M (templates) and N (scripts)
> are each just **a new descriptor + a near-identical CLI module + one model category + one schema branch**. The
> operation itself does NOT change.

## Acceptance criteria (verbatim from the backlog)

### TASK-68 — `bundle <id> templates add <path>` (a MUTATION; doc-10 row 168 = "Same as `files`")
1. When the path exists under the bundle `payload/templates`, the reference is registered and no file content is
   written or modified.
2. Registering a path that does not exist on disk fails with a typed error and a non-zero exit, registering
   nothing.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the path completes from files present under `payload/templates`.
4. Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.

### TASK-69 — `bundle <id> templates list` (a READ; doc-10 row 168)
1. The command enumerates the registered payload templates for the bundle.
2. The command reads and reports only, with no change on disk, and exits 0 on success.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id completes from enabled bundles.
4. Help output is substantive (description, synopsis, an example).

### TASK-70 — `bundle <id> templates remove <path>` (a MUTATION; doc-10 row 168)
1. The reference is deregistered and the command prints that the file was left at `payload/templates` for the
   author to delete deliberately.
2. The file content is left untouched on disk: deregister, not delete.
3. Deregistering a path that is not registered fails with a typed not-found error and a non-zero exit.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the path completes from registered payload templates.
5. Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.

## doc-10 contract (cite the row)
> `bundle <id> templates add|list|remove <path>` (row 168) → "**Same as `files`**, against `payload/templates/`;
> `remove` deregisters and leaves the file, printing where". The `files` rows it inherits from: add (165) =
> "Validate `bundles/<id>/payload/templates/<path>` exists on disk; register reference in `bundle.yml` payload
> list or equivalent; CLI does NOT write file content"; list (166) = "Enumerate registered payload templates (or
> scan `payload/templates/`)"; remove (167) = "Deregister the reference; leave the file on disk; print
> 'deregistered; file left at `payload/templates/<path>` — delete it yourself if you meant to'". [Source: docs/10
> §command tree + §Per-command actions row 168 (which delegates to rows 165/166/167 with `payload/templates/`
> substituted).] Auto-rerender: per-bundle mutations "carry this implicit re-render." [docs/10 line 34.]

> doc-06/07 — what `payload/templates/` IS: doc-06 line 77 lists `payload/templates/ [OPT]` as
> "parameterized/fill-in content — DELIVERED to the environment"; doc-06 line 96 names the bundle shape
> "`payload/{files,templates,agent-skills} installer-scripts/ install-backlog/ …`" — confirming `templates/` is a
> sibling of `files/` UNDER `payload/` (unlike `installer-scripts/`, family N's dir, which is a sibling OF
> `payload/`). [Source: docs/06 lines 77/96; docs/07 lines 46-65 — payload layout.] So M's on-disk dir is
> `payload/templates` — directly parallel to L's `payload/files`.

## No DIVERGENCE for M (L already paid the cost)
L introduced the `payload:` registry into `bundle.yml` (recorded as L's divergence — the doc-permitted "or
equivalent", flagged at L's gate). **M adds nothing novel to the contract**: it adds a SECOND category
(`payload.templates`) under the same already-accepted `payload:` mapping. There is therefore NO new
divergence to flag and NO user gate — M is exactly the extension L's story predicted ("the SAME
`payload.<category>` shape generalises to M (`payload.templates`)").

## Key-name decision (inherited from L — no new decision for M)
- On-disk dir `payload/templates/` ↔ `bundle.yml` sub-key `payload.templates` — the sub-key is exactly the
  on-disk subdirectory name, identical to L's `payload.files ↔ payload/files/`. No alternative reconsidered: L
  fixed "the sub-key is the on-disk `payload/<sub>/` directory name"; M follows it mechanically.

## All three are project-BOUND + per-bundle-routed (NO new routing)
`<id>` is resolved + enabled-guarded by the EXISTING per-bundle routing (`isPerBundleInvocation` /
`dispatchPerBundle` → `resolveContext` → `requireEnabledBundle`), satisfying 68#3 / 69#3 / 70#4 (the
`NO_PROJECT_MESSAGE` names `manifest.yml` + `init` + `-C`). The resolved `root` + `id` are threaded into
`bundleTemplatesModule.register`. **This story adds ZERO routing/dispatch/guard code** — `bundleTemplatesModule`
is just appended to `PER_BUNDLE_MODULES`.

---

## REVIEWER NIT TO HONOR (carried from L's review): the descriptor genericises the OPERATION, not the SCHEMA
The `PayloadRefDescriptor` makes `addPayloadRefSpec`/`listPayloadRefsSpec`/`removePayloadRefSpec` reusable, but
the **model** and the **schema** are NOT descriptor-driven — `parsePayload` reads named keys and
`serializeBundleManifest` writes named keys. So adding the `templates` category is **four touches**, not one:
1. a `templates: readonly string[]` field on `BundlePayload` (the model),
2. a `parsePayload` BRANCH that reads `payload.templates` (absent ⇒ `[]`) and validates it as a string list,
3. `serializeBundleManifest` emitting `templates: [...]` (so a round-trip preserves it),
4. `TEMPLATES_DESCRIPTOR` beside `FILES_DESCRIPTOR` (the only "one descriptor" piece).
Plus the CLI module, the completion wiring, and `create-bundle` init. Missing any of (1)–(3) means `templates`
either won't type-check or won't round-trip — the parser is on the LOAD path for **every** command, so a
half-extended schema breaks `templates list` (and silently drops the field on any write through `add`/`remove`
of OTHER categories).

---

## PART 1 — THE MODEL + SCHEMA EXTENSION (add the `templates` category) — minimal, absent ⇒ empty

### `src/core/model/bundle.ts` — add `templates` to `BundlePayload`
```ts
export interface BundlePayload {
  /** Registered `payload/files/` reference paths (relative to `payload/files/`), in registration order. */
  readonly files: readonly string[];
  /** Registered `payload/templates/` reference paths (relative to `payload/templates/`), in registration order. */
  readonly templates: readonly string[];
}
```
(`BundlePayload` is already exported from `src/core/model/index.ts` — no export change.)

### `src/core/services/schema/bundle.ts` — round-trip `payload.templates` (absent ⇒ empty)
- Extend `BundleManifestData.payload` to `{ readonly files: readonly string[]; readonly templates: readonly
  string[] }`.
- In `parsePayload`, add a `templates` branch MIRRORING the existing `files` branch (absent ⇒ `[]`; present ⇒
  must be a string list else reject naming `payload.templates`). Keep the existing `raw === undefined ⇒ all
  categories empty` short-circuit but extend it to `{ files: [], templates: [] }`. (Both branches read off the
  SAME validated `raw` mapping; don't early-return after `files`.)
- In `serializeBundleManifest`, emit `payload: { files: [...bundle.payload.files], templates:
  [...bundle.payload.templates] }` (each empty list serialises as `[]`).

> **Compatibility (HARD, unchanged from L):** an OLD bundle.yml with NO `payload:` key, or a partial one (only
> `payload.files`), MUST still parse — the missing category becomes `[]`. Extend the schema unit tests for
> "absent payload ⇒ templates empty", "files-only payload ⇒ templates empty", and "populated templates
> round-trips".

### `src/core/operations/create-bundle.ts` — init `templates: []` for a NEW bundle
The `apply` builds the canonical `bundle.yml` via `serializeBundleManifest(manifest)`; its `manifest:
BundleManifest` literal currently has `payload: { files: [] }`. Extend to `payload: { files: [], templates: []
}` so a fresh bundle.yml carries `payload:\n  files: []\n  templates: []`.

---

## PART 2 — THE DESCRIPTOR (`src/core/operations/payload-refs.ts`, ADD `TEMPLATES_DESCRIPTOR` — the op is UNCHANGED)

Add ONE export beside `FILES_DESCRIPTOR`. The generic `addPayloadRefSpec`/`listPayloadRefsSpec`/
`removePayloadRefSpec` already accept any descriptor — DO NOT touch them.
```ts
/**
 * The `templates` descriptor (Family M) — `payload/templates/` ↔ `bundle.yml`'s `payload.templates`. Same generic
 * op as `files`; only the on-disk dir, the yml key path, the model selector, and the message noun differ.
 */
export const TEMPLATES_DESCRIPTOR: PayloadRefDescriptor = {
  onDiskDir: "payload/templates",
  ymlPath: ["payload", "templates"],
  select: (bundle) => bundle.payload.templates,
  noun: "template",
};
```
This makes `remove`'s summary read "deregistered; template left at `payload/templates/<path>` — delete it
yourself if you meant to" (70#1) and the add error name `payload/templates` — both fall out of the descriptor's
`onDiskDir`/`noun`, no per-family code.

---

## PART 3 — THE CLI MODULE (`src/cli.ts`, add ONE `bundleTemplatesModule`)

Copy `bundleFilesModule` verbatim, substituting `TEMPLATES_DESCRIPTOR`, the noun "template(s)", and the
`payload/templates` wording in descriptions/examples. The EXISTENCE CHECK for `add` stays in the CLI layer
(the pure `check` has no fs port), raising `NotFoundError` BEFORE `runMutation` so nothing is registered (68#2).

```ts
const bundleTemplatesModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const templates = sub
      .command("templates")
      .description("register or inspect this bundle's payload/templates reference files (doc 10)");

    // ── templates add <path> ───────────────────────────────────────────────────────────────────────────────
    const addLeaf = templates
      .command("add")
      .argument(
        "<path>",
        "a path the agent has already placed under payload/templates (relative to payload/templates)",
      )
      .description(
        "register a parameterised template the agent placed under payload/templates (doc 10)",
      )
      .action((path: string) => {
        // 68#2: the file MUST exist on disk under payload/templates/<path>; else a typed NotFound (exit 1) with
        // nothing registered. The pure operation `check` has no ports, so the existence probe lives here.
        const onDisk = join(root, "bundles", id, TEMPLATES_DESCRIPTOR.onDiskDir, path);
        if (!ctx.deps.fs.exists(onDisk)) {
          throw new NotFoundError(
            `no file at bundles/${id}/${TEMPLATES_DESCRIPTOR.onDiskDir}/${path} — place the file there first, then register it`,
          );
        }
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          addPayloadRefSpec(TEMPLATES_DESCRIPTOR),
          { id, path },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(addLeaf, [
      {
        command: "wpm bundle web-handoff templates add agents.md.tmpl",
        note: "register payload/templates/agents.md.tmpl the agent placed",
      },
    ]);

    // ── templates list ─────────────────────────────────────────────────────────────────────────────────────
    const listLeaf = templates
      .command("list")
      .description("list this bundle's registered payload/templates references (doc 10)")
      .action(() => {
        const { value } = runRead(ctx.deps.fs, { root }, listPayloadRefsSpec(TEMPLATES_DESCRIPTOR), {
          id,
        });
        ctx.io.out.write(formatPayloadList(value, TEMPLATES_DESCRIPTOR.noun));
      });
    withExamples(listLeaf, [
      { command: `wpm bundle ${id} templates list`, note: "list registered payload templates" },
    ]);

    // ── templates remove <path> ────────────────────────────────────────────────────────────────────────────
    const removeLeaf = templates
      .command("remove")
      .argument(
        "<path>",
        "the registered payload/templates reference to deregister (the file is left on disk)",
      )
      .description("deregister a payload/templates reference, leaving the file on disk (doc 10)")
      .action((path: string) => {
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          removePayloadRefSpec(TEMPLATES_DESCRIPTOR),
          { id, path },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [
      {
        command: "wpm bundle web-handoff templates remove agents.md.tmpl",
        note: "deregister payload/templates/agents.md.tmpl (the file stays on disk)",
      },
    ]);
  },
};
```
Append `bundleTemplatesModule` to `PER_BUNDLE_MODULES` (after `bundleFilesModule`).

### `formatPathList` → generalise to `formatPayloadList(paths, noun)`
L's `formatPathList` hard-codes `(no files)`. The list empty-marker must read `(no templates)` / `(no scripts)`
per family. Generalise the existing helper to take the descriptor noun (this is a DRY refactor — also threads
the noun for N):
```ts
/** Render a registered-payload-reference list — one path per line, or `(no <noun>s)` when empty. */
function formatPayloadList(paths: readonly string[], noun: string): string {
  return paths.length === 0 ? `(no ${noun}s)\n` : `${paths.join("\n")}\n`;
}
```
Update `bundleFilesModule`'s `list` action to call `formatPayloadList(value, FILES_DESCRIPTOR.noun)` (→ `(no
files)`, unchanged behaviour — the existing L unit + E2E assertions on `(no files)` still hold). Remove the now
unused `formatPathList`.

**Imports to add in `src/cli.ts`:** add `TEMPLATES_DESCRIPTOR` to the existing
`./core/operations/payload-refs.js` import (the three specs are already imported).

## PART 4 — COMPLETION (`PER_BUNDLE_COMPLETION_SPECS` + the on-disk/registered sources)
68#3 `<path>` (add) completes from files PRESENT under `payload/templates/`; 70#4 `<path>` (remove) completes
from the REGISTERED templates. Both need the host `<id>` via `ctx.bundleId` (reuse L's threading).

**Decision — GENERALISE the two completion sources (preferred, keeps it DRY), do NOT add parallel variants.**
L's `payloadFilesOnDisk` / `payloadFilesRegistered` are hard-coded to `payload/files` / `payload.files`.
Generalise each to take the category, then bind named registry sources per family:
- `src/completion/payload-files-on-disk.ts` → make the walk root parameterised by an on-disk dir (default keeps
  `payload/files`); export a factory `payloadRefsOnDisk(onDiskDir)` returning a `CompletionSource`, OR add an
  internal `payloadRefsOnDiskFor(ctx, onDiskDir)` and keep thin named wrappers. The cleanest: a factory
  `payloadOnDiskSource(onDiskDir: string): CompletionSource`.
- `src/completion/payload-files-registered.ts` → factory `payloadRegisteredSource(select: (b: BundleManifest)
  => readonly string[]): CompletionSource` (or keyed by category name) that reads the chosen category off the
  parsed manifest.
- In `defaultRegistry()`, register: `payload-templates-on-disk` → `payloadOnDiskSource("payload/templates")` and
  `payload-templates-registered` → `payloadRegisteredSource(b => b.payload.templates)`, beside the existing
  `payload-files-*`. Keep the L `payload-files-*` names working (rebind them through the same factory so L's
  completion tests still pass).
- In `PER_BUNDLE_COMPLETION_SPECS`:
  ```ts
  "templates add": { args: ["payload-templates-on-disk"] },
  "templates remove": { args: ["payload-templates-registered"] },
  ```

> Generalising (vs. copy-pasting two more files) is the right call for the SAME reason the operation is
> descriptor-driven: files/templates/scripts differ ONLY by an on-disk dir and a category selector. A factory
> keeps the project-resolution + walk + degrade-to-`[]` logic in ONE place. Record this generalisation in the
> Completion Notes. (If the factory refactor proves to churn L's tests excessively, the stated fallback is
> parallel `payload-templates-on-disk.ts`/`-registered.ts` files mirroring L's — note which path was taken.)

## PART 5 — TEST PLAN (unit in-process + real-binary E2E; every AC mapped)

### Schema unit (`test/unit/schema/bundle.test.ts`, EXTEND the Family-L payload block)
- absent `payload` ⇒ `payload.templates` is `[]` (alongside the existing `payload.files` empty case).
- a `payload` mapping with `files` only ⇒ `payload.templates` is `[]` (partial-payload compatibility).
- a populated `payload: { templates: [a, b] }` parses to `["a","b"]`; round-trips via serialize→parse.
- `serialize` always emits `payload.templates` (empty ⇒ `[]`).
- `payload.templates` not a list / an entry not a string → rejected naming `payload.templates`.

### Unit (`test/unit/cli/bundle-templates-commands.test.ts`, NEW — mirror `bundle-files-commands.test.ts`)
Seed `/proj` with bundle `a` (its `bundle.yml` carrying a comment + known key order, NO payload key) and PLACE
real files under `${PROJ}/bundles/a/payload/templates/` (e.g. `agents.md.tmpl`, `sub/x.json.tmpl`). Init the
authoring backlog + seed template snippets so ④ RERENDER resolves (copy L's `seed`).
- **68#1** add existing `agents.md.tmpl` → `payload.templates` on disk is `[agents.md.tmpl]`; the placed file's
  bytes are UNCHANGED; comment + key order preserved (key order now ends `…requires, payload`); exit 0.
- **68#1 idempotent** — add twice → still `[agents.md.tmpl]` (set-like).
- **68#1 second path** — add `agents.md.tmpl` then `sub/x.json.tmpl` → registration order.
- **68#2 not-on-disk** — `templates add ghost.tmpl` → exit 1 (typed, names the path), bundle.yml byte-identical.
- **68#3 outside-project** — exit 1 naming `manifest.yml` + `init`.
- **68#3 completion (add)** — `__complete bundle a templates add <tab>` → the on-disk paths.
- **68#4 help** — Usage + `<path>` + Example.
- **69#1/#2** list with two registered → exact stdout `agents.md.tmpl\nsub/x.json.tmpl\n`; manifest + bundle.yml
  unchanged (read-only).
- **69#1 empty** — list with none registered → `(no templates)`.
- **69#3 outside-project** — exit 1 naming `manifest.yml`; **id completes from enabled bundles**.
- **69#4 help** — Usage + Example.
- **70#1** remove a registered `agents.md.tmpl` → gone from `payload.templates`; SUMMARY contains `left at
  payload/templates/agents.md.tmpl`; exit 0.
- **70#2 file-left-on-disk** — after remove, the file STILL exists with unchanged content.
- **70#3 not-registered** — `templates remove not-there.tmpl` → exit 1 (NotFound), bundle.yml unchanged.
- **70#4 outside-project** — exit 1 naming `manifest.yml`. **70#4 completion (remove)** — register two;
  `__complete bundle a templates remove <tab>` → exactly the registered refs.
- **70#5 help** — Usage + `<path>` + Example.
- **end-to-end in-process** — add → list (shows) → remove → list (`(no templates)`) + file on disk + comment
  survives.
- **rerender** — after add, `${PROJ}/AGENTS.md` exists.
- **templates group help** — lists add/list/remove.
- **cross-category isolation** — placing+registering a `files` ref then a `templates` ref leaves BOTH in
  `bundle.yml` (`payload.files` AND `payload.templates`), and removing the template leaves the file ref intact
  (proves the schema round-trips both categories — the reviewer NIT made concrete).

### Real-binary E2E (append to `test/integration/cli.bundle-id.e2e.test.ts`, `describeIfBuilt`)
Through `dist/cli.js` + real `NodeFileSystem` tmpdir + real `backlog`. Add a `placePayloadTemplate(proj, bundle,
rel, content)` helper (mkdir `bundles/<bundle>/payload/templates/` + writeFile), mirroring `placePayloadFile`.
- 68#1: place `agents.md.tmpl`; `bundle web templates add agents.md.tmpl` → exit 0; `bundles/web/bundle.yml`
  gains `payload:` … `templates:` … `- agents.md.tmpl` (real eemeli/yaml round-trip); the placed file's CONTENT
  is unchanged (register-without-content).
- 68#2: `bundle web templates add ghost.tmpl` (not placed) → exit 1; bundle.yml unchanged.
- 69#1: after add, `bundle web templates list` → stdout contains `agents.md.tmpl`; a fresh bundle prints `(no
  templates)`.
- 70#1/#2: `bundle web templates remove agents.md.tmpl` → exit 0; stdout contains `left at
  payload/templates/agents.md.tmpl`; the entry is gone from bundle.yml; the file is STILL on disk (existsSync).
- 70#3: `bundle web templates remove nope.tmpl` (not registered) → exit 1; bundle.yml unchanged.
- completion: `__complete bundle web templates add` (file placed) → lists it; `__complete bundle web templates
  remove` (registered) → lists it.
- help: `bundle web templates add --help` → contains `bundle web templates add` + `<path>` + Example.
- **OLD-bundle.yml compat (real binary)** — a `bundle.yml` with NO `payload:` key still drives `templates list`
  (`(no templates)`) and `templates add` (adds the field) — absent ⇒ empty end-to-end.

---

## Dev Notes

### Files to ADD
- `test/unit/cli/bundle-templates-commands.test.ts` — the unit suite (mirror `bundle-files-commands.test.ts`).

### Files to CHANGE
- `src/core/model/bundle.ts` — add `templates: readonly string[]` to `BundlePayload`.
- `src/core/services/schema/bundle.ts` — `parsePayload` `templates` branch + `serializeBundleManifest` +
  `BundleManifestData.payload` (absent/partial ⇒ empty).
- `src/core/operations/payload-refs.ts` — add `TEMPLATES_DESCRIPTOR` (the op is UNCHANGED).
- `src/core/operations/create-bundle.ts` — init `payload: { files: [], templates: [] }`.
- `src/cli.ts` — add `bundleTemplatesModule`; append to `PER_BUNDLE_MODULES`; generalise `formatPathList` →
  `formatPayloadList(paths, noun)` (update the L `files` call); add the two completion specs; import
  `TEMPLATES_DESCRIPTOR`.
- `src/completion/payload-files-on-disk.ts` + `payload-files-registered.ts` — generalise to category-parameterised
  factories (keep the L `payload-files-*` names bound through them).
- `src/completion/registry.ts` — register `payload-templates-on-disk` + `payload-templates-registered`.
- `test/unit/schema/bundle.test.ts` — extend the payload block with the `templates` round-trip / absent-/
  partial-⇒-empty / malformed cases.
- `test/integration/cli.bundle-id.e2e.test.ts` — append the templates real-binary E2E block + a
  `placePayloadTemplate` helper.
- **Test fixtures (BundleManifest literals)** — add `templates: []` beside `files: []` in every
  `BundleManifest`-typed fixture (these are STRUCTURALLY typed, so the new required field must be present):
  `test/unit/model/aggregates.test.ts`, `test/unit/services/validate.test.ts`,
  `test/unit/services/validate.acceptance.test.ts`, `test/unit/services/version-constraint.acceptance.test.ts`,
  `test/unit/services/derived-artefacts.test.ts`, `test/unit/services/derived-artefacts.acceptance.test.ts`,
  `test/unit/operations/create-bundle.test.ts`. (NOTE: the schema-test fixtures that pass `payload: { files: …
  }` as untyped DATA into `parseBundleManifest` need NO change — they are inputs, not `BundlePayload` values.)

### Architecture constraints (doc 13 — HARD, unchanged from L)
- **Core boundary**: `payload-refs.ts` stays pure — adding `TEMPLATES_DESCRIPTOR` introduces NO new import
  (only `node:path` + yaml + model + errors + lifecycle types). The fs EXISTENCE CHECK for `add` lives in the
  CLI shell. Completion sources live under `src/completion/` and read via the fs port. (`core-boundary.test.ts`
  + Biome `noRestrictedImports` enforce this.)
- **Core is synchronous**; add/list/remove actions are sync.
- **Error model** (docs/13 §7): not-on-disk (add) and not-registered (remove) → `NotFoundError` (exit 1),
  registering/deregistering nothing. Outside-project → the routing's `NotFoundError`. No `UsageError` path (a
  `<path>` is freeform).
- **Lifecycle**: add/remove ride `runMutation` (④ RERENDER auto; NO `materialise` — doc 10 lists no task for
  templates); list rides `runRead`. Structure-not-content: add NEVER writes file content; remove NEVER deletes
  the file.

### Reuse — do NOT reinvent
- The ENTIRE operation is reused: `addPayloadRefSpec`/`listPayloadRefsSpec`/`removePayloadRefSpec` from
  `src/core/operations/payload-refs.ts`. M adds ONLY `TEMPLATES_DESCRIPTOR`.
- The CLI module shape: copy `bundleFilesModule` (just merged) verbatim, substituting the descriptor + noun +
  wording.
- The completion plumbing: `CompletionContext.bundleId` + the per-bundle completion recursion (Family K/L) —
  reuse, generalising the two L sources rather than adding new plumbing.
- `formatResult` / `withExamples` / `lifecycleDepsFor` in `src/cli.ts`.

### Project Structure Notes
- M is the FIRST proof that L's descriptor seam holds: if M is more than (descriptor + module + model field +
  schema branch + completion bind + create-bundle init + tests), the generalisation L claimed is leaking. Keep
  M to exactly that surface.
- N (scripts) follows M identically EXCEPT its on-disk dir is `installer-scripts/` (a SIBLING of `payload/`, doc
  06:96), registered under `payload.scripts` for representational consistency — so N's descriptor `onDiskDir` is
  `installer-scripts` (not `payload/installer-scripts`). M does not need to anticipate N beyond keeping the
  factories category-parameterised.

### References
- [Source: docs/10-authoring-cli.md §command tree + §Per-command actions row 168 ("Same as `files`, against
  `payload/templates/`") delegating to rows 165/166/167; line 34 implicit re-render.]
- [Source: docs/06-project-skeleton.md lines 77 (`payload/templates/ [OPT]` — delivered, parameterized) + 96
  (the `payload/{files,templates,agent-skills}` bundle shape); docs/07-install-contract.md lines 46-65.]
- [Source: docs/13-core-architecture.md §5/§8 (lifecycle) + §7 (error model) + §1 (core purity / ports).]
- [Source: src/core/operations/payload-refs.ts — the GENERIC op + `FILES_DESCRIPTOR` (the template for
  `TEMPLATES_DESCRIPTOR`); src/cli.ts `bundleFilesModule` + `PER_BUNDLE_MODULES` + `PER_BUNDLE_COMPLETION_SPECS`;
  src/completion/payload-files-on-disk.ts + payload-files-registered.ts (the sources to generalise).]
- [Source: src/core/services/schema/bundle.ts + model/bundle.ts + test/unit/schema/bundle.test.ts — the
  round-trip to extend (absent/partial ⇒ empty is mandatory).]
- [Source: _bmad-output/implementation-artifacts/stories/story-cli-bundle-files.md — Family L's story; M is its
  predicted extension.]

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — BMAD build worker. Skills actually run (Rule 3 evidence): `bmad-create-story` (this
story), `bmad-dev-story` (code + unit tests + schema tests), `bmad-qa-generate-e2e-tests` (the real-binary E2E
block).

### Completion Notes List
- **No DIVERGENCE.** M added a SECOND category (`payload.templates`) under L's already-accepted `payload:`
  mapping — exactly the extension L's story predicted. No contract change, no user gate.
- **Reviewer NIT honored (the four touches):** (1) `BundlePayload.templates` on the model; (2) a `parsePayload`
  branch — refactored to a shared `parsePayloadCategory(raw, field, ctx)` helper so `files` AND `templates`
  parse identically (absent ⇒ `[]`, partial payload ⇒ missing categories empty); (3) `serializeBundleManifest`
  emits both categories; (4) `TEMPLATES_DESCRIPTOR` beside `FILES_DESCRIPTOR`. The generic op
  (`addPayloadRefSpec`/`listPayloadRefsSpec`/`removePayloadRefSpec`) was UNCHANGED.
- **create-bundle** now inits `payload: { files: [], templates: [] }`.
- **CLI**: `bundleTemplatesModule` copied from `bundleFilesModule` (substituting `TEMPLATES_DESCRIPTOR` + the
  "template" noun + `payload/templates` wording), appended to `PER_BUNDLE_MODULES` — NO routing change. The
  on-disk existence check for `add` stays in the CLI action (the pure `check` has no fs port), raising
  `NotFoundError` before `runMutation` (68#2). `remove`'s summary carries "left at payload/templates/<path> —
  delete it yourself if you meant to" (70#1, from the descriptor's `onDiskDir`/`noun`).
- **`formatPathList` → `formatPayloadList(paths, noun)`** (a DRY refactor): the empty marker now reads `(no
  files)` / `(no templates)` per family. The L `files` list call was updated to pass `FILES_DESCRIPTOR.noun`
  (its `(no files)` behaviour + existing L assertions unchanged).
- **Completion sources GENERALISED (not duplicated)** — the chosen path: `payload-files-on-disk.ts` now exports
  `payloadOnDiskSource(onDiskDir)` and `payload-files-registered.ts` exports
  `payloadRegisteredSource(select)`; the L `payload-files-*` named sources are thin bindings of those factories,
  and `payload-templates-on-disk` / `payload-templates-registered` are registered through the same factories in
  `defaultRegistry()`. Same reasoning as the descriptor-driven op: files/templates differ only by an on-disk dir
  + a category selector, so the project-resolution + walk + degrade-to-`[]` logic lives in one place.
- **Test fixtures**: every `BundleManifest`-typed literal gained `templates: []` beside `files: []` (7 files,
  8 occurrences). The schema-test fixtures passing `payload: { files: … }` as untyped DATA into
  `parseBundleManifest` were LEFT as-is — they exercise the partial-payload (files-only ⇒ templates empty) path,
  which the new parser handles.
- **Cross-category isolation test** (the reviewer NIT made concrete): register a `files` ref AND a `templates`
  ref; both coexist in `bundle.yml`; removing the template leaves the file ref intact. Proves the schema
  round-trips both categories.
- Gate (incremental, in-process): tsc --noEmit clean; biome ci clean (152 files); schema unit + templates unit
  + L files regression + completion = 97/97; FULL vitest after `npm run build` = 814/814 (72 files). Real-binary
  templates E2E added in the qa step (separate).

### File List
- CHANGE `src/core/model/bundle.ts` — add `templates: readonly string[]` to `BundlePayload`.
- CHANGE `src/core/services/schema/bundle.ts` — `parsePayload` + new `parsePayloadCategory` helper (files +
  templates, absent/partial ⇒ empty); `serializeBundleManifest` emits both; `BundleManifestData.payload`.
- CHANGE `src/core/operations/payload-refs.ts` — add `TEMPLATES_DESCRIPTOR` (generic op UNCHANGED).
- CHANGE `src/core/operations/create-bundle.ts` — init `payload: { files: [], templates: [] }`.
- CHANGE `src/cli.ts` — `bundleTemplatesModule` + append to `PER_BUNDLE_MODULES`; `formatPathList` →
  `formatPayloadList(paths, noun)` (+ update the `files` call); two completion specs; import `TEMPLATES_DESCRIPTOR`.
- CHANGE `src/completion/payload-files-on-disk.ts` — `payloadOnDiskSource(onDiskDir)` factory (+ `payloadFilesOnDisk` binding).
- CHANGE `src/completion/payload-files-registered.ts` — `payloadRegisteredSource(select)` factory (+ `payloadFilesRegistered` binding).
- CHANGE `src/completion/registry.ts` — register `payload-templates-on-disk` + `payload-templates-registered`.
- ADD `test/unit/cli/bundle-templates-commands.test.ts` — the unit suite (incl. cross-category isolation).
- CHANGE `test/unit/schema/bundle.test.ts` — extend the payload block with templates round-trip / absent /
  partial / both-populated / malformed cases.
- CHANGE (test fixtures, +`templates: []`) `test/unit/model/aggregates.test.ts`,
  `test/unit/services/validate.test.ts`, `test/unit/services/validate.acceptance.test.ts`,
  `test/unit/services/version-constraint.acceptance.test.ts`, `test/unit/services/derived-artefacts.test.ts`,
  `test/unit/services/derived-artefacts.acceptance.test.ts`, `test/unit/operations/create-bundle.test.ts`.
- (qa step) CHANGE `test/integration/cli.bundle-id.e2e.test.ts` — append the templates real-binary E2E block.
