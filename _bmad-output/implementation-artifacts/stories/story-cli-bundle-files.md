# Story cli-bundle-files — `bundle <id> files add` / `list` / `remove` (tasks 65 + 66 + 67)

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"command tree → per-bundle operations" + rows 165 (`files add`) / 166 (`files list`) /
> 167 (`files remove`), doc 10 line 34 (implicit re-render), doc 06 line 137 (`bundle.yml` / payload), doc 07
> lines 46-65 (the payload layout: `payload/files/` + `payload/templates/` deliver to the environment;
> `installer-scripts/` is install-time, not delivered), doc 13 §5/§8 (the lifecycle)). This is **per-bundle
> family L** in the CLI epic-2. It REUSES the per-bundle mutation TEMPLATE `bundle-version.ts` and the LIST-MGMT
> exemplar `targets.ts`, AND the per-bundle registry in `src/cli.ts` (the `bundle <id>` routing + the `bundleId`
> completion threading just established by **Family K**, `bundleRequiresModule`). It adds ONE
> `bundleFilesModule` to `PER_BUNDLE_MODULES` — **no routing change**.
>
> Unlike K (which reused the existing `requires` field), **L INTRODUCES a payload-reference registry into
> `bundle.yml`** (a doc-10-led realization refinement — see the DIVERGENCE NOTE below) and builds a **generic,
> descriptor-driven** payload-reference operation so the upcoming **M** (templates) and **N** (scripts) are each
> just a new descriptor + one module.

## Acceptance criteria (verbatim from the backlog)

### TASK-65 — `bundle <id> files add <path>` (a MUTATION; doc-10 row 165)
1. When the path exists under the bundle `payload/files`, the reference is registered (in `bundle.yml` payload
   list or equivalent) and no file content is written or modified.
2. Registering a path that does not exist on disk fails with a typed error and a non-zero exit, registering
   nothing.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id completes from enabled bundles and the path from files present under `payload/files`.
4. Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.

### TASK-66 — `bundle <id> files list` (a READ; doc-10 row 166)
1. The command enumerates the registered payload files for the bundle.
2. The command reads and reports only, with no change on disk, and exits 0 on success.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id completes from enabled bundles.
4. Help output is substantive (description, synopsis, an example).

### TASK-67 — `bundle <id> files remove <path>` (a MUTATION; doc-10 row 167)
1. The reference is deregistered and the command prints that the file was left at `payload/files` for the author
   to delete deliberately.
2. The file content is left untouched on disk: deregister, not delete.
3. Deregistering a path that is not registered fails with a typed not-found error and a non-zero exit.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the path completes from registered payload files.
5. Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.

## doc-10 contract (cite the rows)
> `bundle <id> files add <path>` (row 165) → "1. Validate `bundles/<id>/payload/files/<path>` exists on disk
> (agent placed it) 2. Register reference (in `bundle.yml` payload list or equivalent) 3. CLI does NOT write file
> content".
> `bundle <id> files list` (row 166) → "1. Enumerate registered payload files (or scan `payload/files/`)".
> `bundle <id> files remove <path>` (row 167) → "1. Deregister the reference 2. Leave the file on disk; print
> 'deregistered; file left at `payload/files/<path>` — delete it yourself if you meant to'".
> Command tree row: "`files add|list|remove <path>   payload/files/ — authoritative reference files`". The
> SIBLING rows make the generalisation explicit: "`templates add|list|remove <path>   payload/templates/ …`
> Same as `files`, against `payload/templates/`" and "`scripts add|list|remove <path>   installer-scripts/ …`
> Same as `files`, against `installer-scripts/`". [Source: docs/10 §command tree + §Per-command actions rows
> 165/166/167 + the templates/scripts rows.] Auto-rerender: per-bundle mutations "carry this implicit
> re-render." [docs/10 line 34.]

> doc-06/07 — what `payload/files/` IS: "`payload/` — everything the bundle delivers (the data.tar analog) …
> `files/ templates/ … → environment: authoritative reference files + parameterized". "`payload/files/` is the
> author's authoritative reference … the receipt records the checksum of what was actually placed." [Source:
> docs/06 line 137 (the `payload/files/` deliver-to-environment role) + docs/07 lines 46-65 (the payload
> layout).]

## DIVERGENCE NOTE (record VERBATIM in the Completion Notes — flagged at the gate, NOT a user gate)
> **L introduces a payload-reference registry into `bundle.yml`.** doc-10 row 165 requires `files add` to
> "register the reference in `bundle.yml` payload list **or equivalent**" and row 167 requires `files remove`
> to **deregister, leaving the file on disk** — which is only possible if the registry is **distinct from the
> file itself**. The Bundle model + schema today have NO payload-reference field, and doc-06 line 137's
> `bundle.yml` field list (id / version / summary / confirmation / requires) is **descriptive, not exhaustive**,
> versus doc-10's CLI contract. So L adds a top-level **`payload:`** mapping to `bundle.yml`, keyed by on-disk
> category, each a list of registered relative paths:
> ```yaml
> payload:
>   files:
>     - probe.sh
>     - templates/agents.md
> ```
> This is a doc-10-LED realization refinement that serves the FIXED goals/vocabulary unchanged (it is the
> "or equivalent" the doc explicitly permits); it is NOT a scope/goal/style change, so it is recorded here and
> flagged at the gate rather than raised as a user gate. The SAME `payload.<category>` shape generalises to
> **M** (`payload.templates` ← `payload/templates/`) and **N** (`payload.scripts` ← `installer-scripts/`),
> which is why L builds a generic descriptor-driven operation.

## Key-name decision (justify)
- Top-level key **`payload`** (lowercase, matching `id`/`version`/`summary`/`confirmation`/`requires`).
- Sub-key **`files`** — exactly the on-disk subdirectory name `payload/files/`, so the mapping reads as "the
  registered contents of `payload/<sub>/`". M will add **`templates`** (`payload/templates/`). N's on-disk dir
  is `installer-scripts/` (NOT under `payload/`), so N's descriptor maps a different on-disk dir to a
  `payload.scripts` key — the descriptor decouples the two, so this naming holds. (Alternative considered: a
  flat top-level `files:` list — rejected because M/N would then need their own top-level keys, fragmenting the
  payload registry; one `payload:` mapping keeps them together and self-describing.)

## All three are project-BOUND + per-bundle-routed (NO new routing)
`<id>` is resolved + enabled-guarded by the EXISTING per-bundle routing (`isPerBundleInvocation` /
`dispatchPerBundle` → `resolveContext` → `requireEnabledBundle`), satisfying 65#3 / 66#3 / 67#4 (the
`NO_PROJECT_MESSAGE` names `manifest.yml` + `init`). The resolved `root` + `id` are threaded into
`bundleFilesModule.register`. **This story adds ZERO routing/dispatch/guard code.**

---

## PART 1 — THE MODEL + SCHEMA EXTENSION (the payload registry) — minimal, absent ⇒ empty

### `src/core/model/bundle.ts` — add a `payload` field to `BundleManifest`
```ts
/** A bundle's registered payload references, keyed by on-disk category (doc 10 files/templates rows). */
export interface BundlePayload {
  /** Registered `payload/files/` reference paths (relative to `payload/files/`), in registration order. */
  readonly files: readonly string[];
}

export interface BundleManifest {
  readonly id: BundleId;
  readonly version: SemVer;
  readonly summary: string;
  readonly confirmation: ConfirmationLevel;
  readonly requires: ReadonlyMap<BundleId, VersionRange>;
  /** The registered payload references (doc 10 `files`/`templates`). Absent in bundle.yml ⇒ all categories empty. */
  readonly payload: BundlePayload;
}
```
Export `BundlePayload` from `src/core/model/index.ts` (beside `BundleManifest`).

### `src/core/services/schema/bundle.ts` — round-trip the `payload` mapping (absent ⇒ empty)
- Extend `BundleManifestData`:
  ```ts
  export interface BundleManifestData {
    readonly id: string;
    readonly version: string;
    readonly summary: string;
    readonly confirmation: string;
    readonly requires: Readonly<Record<string, string>>;
    readonly payload: { readonly files: readonly string[] };
  }
  ```
- In `parseBundleManifest`, AFTER the `requires` block, parse `payload` **defensively, absent ⇒ empty** (this
  is mandatory — `test/unit/schema/bundle.test.ts` has well-formed/malformed cases that OMIT `payload`, a
  round-trip test, and `parseBundleManifest` is on the load path for EVERY command via `loadProject`):
  ```ts
  // `payload` is OPTIONAL (absent in an old bundle.yml ⇒ every category empty). When present it must be a
  // mapping; `payload.files` (when present) must be a list of strings (the registered relative paths).
  let files: string[] = [];
  const payloadRaw = (data as Record<string, unknown>).payload;
  if (payloadRaw !== undefined) {
    if (!isPlainObject(payloadRaw)) {
      return { ok: false, problem: { message: `${ctx}: "payload" must be a mapping`, field: "payload" } };
    }
    const filesRaw = payloadRaw.files;
    if (filesRaw !== undefined) {
      if (!Array.isArray(filesRaw) || filesRaw.some((p) => typeof p !== "string")) {
        return { ok: false, problem: { message: `${ctx}: "payload.files" must be a list of path strings`, field: "payload.files" } };
      }
      files = filesRaw as string[];
    }
  }
  // … then include `payload: { files }` in the returned ok({...}).
  ```
- In `serializeBundleManifest`, ALWAYS emit `payload: { files: [...] }` (an empty list serialises as `files:
  []`, verified) so a freshly-created bundle.yml carries the field:
  ```ts
  return { id: ..., version: ..., summary: ..., confirmation: ..., requires, payload: { files: [...bundle.payload.files] } };
  ```

### `src/core/operations/create-bundle.ts` — initialise the field empty for a NEW bundle
The `apply` builds the canonical `bundle.yml` via `serializeBundleManifest(manifest)` (line ~239). Add
`payload: { files: [] }` to that `manifest: BundleManifest` literal so a new bundle.yml carries `payload:\n
files: []`. (The `toMatchObject({ id })` acceptance assertion is a partial match — unaffected.)

> **Compatibility (HARD):** an OLD bundle.yml with NO `payload:` key MUST still parse (→ `payload.files = []`).
> The schema unit tests' omitting cases + the load path depend on this. Add a schema test for "absent payload ⇒
> empty files" + "round-trips with a populated payload".

---

## PART 2 — THE GENERIC PAYLOAD-REFERENCE OPERATION (`src/core/operations/payload-refs.ts`, NEW — pure)

A descriptor-driven family so M (templates) and N (scripts) are each just a new descriptor + one CLI module.

**Imports (pure):** `node:path` (join), `editYaml` (`../../util/yaml.js`), `NotFoundError`/`ConflictError`
(`../errors.js`), the model (`Project`, `BundleManifest`), the lifecycle types. NEVER
`node:fs`/`commander`/`execa`.

### The descriptor
```ts
/**
 * Describes one payload-reference category so the same operation serves files (L), templates (M), scripts (N).
 * `onDiskDir` is the bundle-relative directory the referenced file must exist under (the CLI checks existence
 * there); `ymlPath` is the path into `bundle.yml` whose SEQUENCE the references live in; `noun` labels messages.
 */
export interface PayloadRefDescriptor {
  /** The bundle-relative on-disk directory (e.g. `payload/files`). */
  readonly onDiskDir: string;
  /** The `bundle.yml` key path whose sequence holds the references (e.g. `["payload", "files"]`). */
  readonly ymlPath: readonly string[];
  /** The category selector on the parsed `BundlePayload` (e.g. `files`) — how the read projects the list. */
  readonly select: (bundle: BundleManifest) => readonly string[];
  /** A human noun for messages (e.g. `file`). */
  readonly noun: string;
}

/** The `files` descriptor (L). M/N add `templates`/`scripts` descriptors the same way. */
export const FILES_DESCRIPTOR: PayloadRefDescriptor = {
  onDiskDir: "payload/files",
  ymlPath: ["payload", "files"],
  select: (b) => b.payload.files,
  noun: "file",
};
```

### Shared helper — require the host bundle (defense-in-depth)
```ts
function requireBundle(project: Project, id: string): BundleManifest { /* as in bundle-requires.ts */ }
const BUNDLE_MANIFEST_FILE = "bundle.yml";
```

### 65 — `addPayloadRefSpec(descriptor)` (a MUTATION; NO materialise, NO file write)
**Existence is checked in the CLI layer (see PART 3), not here** — ② CHECK has only `(project, input)`, no ports,
so it cannot probe disk. So the operation's input carries the validated path and the op trusts it; the CHECK
here only re-asserts the host bundle. (Justification: this mirrors `bundle-reads.ts`, which threads fs-read data
into the pure spec as INPUT rather than reading disk in the projection — the pure core never touches the fs
port directly.)
```ts
export interface AddPayloadRefInput { readonly id: string; readonly path: string; }

export function addPayloadRefSpec(d: PayloadRefDescriptor): OperationSpec<AddPayloadRefInput> {
  return {
    summary: (_p, { id, path }) => `registered ${d.noun} ${path} in ${id}`,
    check: (project, { id }) => { requireBundle(project, id); },
    apply: (ctx, project, { id, path }) => {
      const current = [...d.select(requireBundle(project, id))];
      if (current.includes(path)) {
        // Set-like: already registered ⇒ no-op (don't duplicate the list entry). Report no change.
        return { changedPaths: [] };
      }
      const next = [...current, path];
      const ymlPath = join(ctx.root, "bundles", id, BUNDLE_MANIFEST_FILE);
      const text = editYaml(ctx.fs.read(ymlPath), (doc) => {
        // setIn with a JS array creates a clean block sequence EVEN when `payload`/`payload.files` is absent in
        // an old bundle.yml (verified) — avoiding the addIn-on-missing-key scalar pitfall. Comments + key order
        // on the rest of the doc survive.
        doc.setIn([...d.ymlPath], next);
      });
      ctx.fs.write(ymlPath, text);
      return { changedPaths: [ymlPath] };
    },
    // NO materialise — doc 10 row 165 lists no task. NO file content write (65#1 structure-not-content).
  };
}
```

### 66 — `listPayloadRefsSpec(descriptor)` (a READ)
```ts
export interface PayloadListInput { readonly id: string; }
export function listPayloadRefsSpec(d: PayloadRefDescriptor): ReadSpec<PayloadListInput, readonly string[]> {
  return {
    summary: (_p, { id }) => `bundle ${id} ${d.noun}s`,
    project: (project, { id }) => [...d.select(requireBundle(project, id))],  // registration order
  };
}
```

### 67 — `removePayloadRefSpec(descriptor)` (a MUTATION; deregister, leave the file)
```ts
export interface RemovePayloadRefInput { readonly id: string; readonly path: string; }
export function removePayloadRefSpec(d: PayloadRefDescriptor): OperationSpec<RemovePayloadRefInput> {
  return {
    summary: (_p, { id, path }) =>
      `deregistered; ${d.noun} left at ${d.onDiskDir}/${path} — delete it yourself if you meant to`,  // 67#1
    check: (project, { id, path }) => {
      const current = d.select(requireBundle(project, id));
      if (!current.includes(path)) {
        throw new NotFoundError(`${d.noun} "${path}" is not registered in "${id}" — nothing to deregister`);  // 67#3
      }
    },
    apply: (ctx, project, { id, path }) => {
      const current = [...d.select(requireBundle(project, id))];
      const index = current.indexOf(path);  // present (CHECK validated)
      const ymlPath = join(ctx.root, "bundles", id, BUNDLE_MANIFEST_FILE);
      const text = editYaml(ctx.fs.read(ymlPath), (doc) => {
        doc.deleteIn([...d.ymlPath, index]);  // remove by index (like targets.ts); leaves the FILE on disk
      });
      ctx.fs.write(ymlPath, text);
      return { changedPaths: [ymlPath] };  // 67#2 — only bundle.yml changes; payload/files/<path> is untouched
    },
    // NO file removal (67#2 deregister-not-delete). NO materialise.
  };
}
```
The `summary` carries the doc-10:167 "left at …" message; `formatResult` prints it (67#1). Because the op never
calls `ctx.fs.remove`, the file on disk is untouched (67#2 — assert in tests).

---

## PART 3 — THE CLI MODULE (`src/cli.ts`, add ONE `bundleFilesModule`)

Mirror `bundleRequiresModule` (Family K). The EXISTENCE CHECK for `add` happens HERE (the CLI layer has the fs
port; the pure CHECK does not), BEFORE `runMutation`, raising the typed error so nothing is registered (65#2).

```ts
const bundleFilesModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const files = sub.command("files").description("register or inspect this bundle's payload/files references (doc 10)");

    // ── files add <path> ─────────────────────────────────────────────────────────────────────────────────────
    const addLeaf = files
      .command("add")
      .argument("<path>", "a path under payload/files the agent has already placed (relative to payload/files)")
      .description("register an authoritative reference file under payload/files (doc 10)")
      .action((path: string) => {
        // 65#2: the file MUST exist on disk under payload/files/<path>; else a typed error (exit 1), nothing
        // registered. The pure CHECK has no ports, so the existence probe lives here (the CLI shell owns I/O).
        const onDisk = join(root, "bundles", id, FILES_DESCRIPTOR.onDiskDir, path);
        if (!ctx.deps.fs.exists(onDisk)) {
          throw new NotFoundError(
            `no file at bundles/${id}/${FILES_DESCRIPTOR.onDiskDir}/${path} — place the file there first, then register it`,
          );
        }
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, addPayloadRefSpec(FILES_DESCRIPTOR), { id, path });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(addLeaf, [
      { command: "wpm bundle web-handoff files add agents.md", note: "register payload/files/agents.md" },
    ]);

    // ── files list ───────────────────────────────────────────────────────────────────────────────────────────
    const listLeaf = files
      .command("list")
      .description("list this bundle's registered payload/files references (doc 10)")
      .action(() => {
        const { value } = runRead(ctx.deps.fs, { root }, listPayloadRefsSpec(FILES_DESCRIPTOR), { id });
        ctx.io.out.write(formatPathList(value));
      });
    withExamples(listLeaf, [{ command: `wpm bundle ${id} files list`, note: "list registered payload files" }]);

    // ── files remove <path> ──────────────────────────────────────────────────────────────────────────────────
    const removeLeaf = files
      .command("remove")
      .argument("<path>", "the registered payload/files reference to deregister (the file is left on disk)")
      .description("deregister a payload/files reference, leaving the file on disk (doc 10)")
      .action((path: string) => {
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, removePayloadRefSpec(FILES_DESCRIPTOR), { id, path });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [
      { command: "wpm bundle web-handoff files remove agents.md", note: "deregister payload/files/agents.md" },
    ]);
  },
};
```
Append `bundleFilesModule` to `PER_BUNDLE_MODULES`. `formatPathList`:
```ts
function formatPathList(paths: readonly string[]): string {
  return paths.length === 0 ? "(no files)\n" : `${paths.join("\n")}\n`;  // 66#1, one per line
}
```
**Imports to add in `src/cli.ts`:** the three specs + `FILES_DESCRIPTOR` from
`./core/operations/payload-refs.js`. (`NotFoundError`, `runMutation`, `runRead`, `lifecycleDepsFor`,
`formatResult`, `withExamples`, `join` already present.)

> **Why the add existence check is at the CLI layer, not in the op:** doc 13 keeps the core pure over the fs
> port — a pure `check(project, input)` has no port to probe disk. The CLI shell already owns the fs port (it
> threads fs data into pure specs everywhere, e.g. `bundle show`'s file tree). Checking existence here, before
> `runMutation`, means a non-existent path NEVER reaches APPLY, so "register nothing" (65#2) holds. Document
> this in the op's JSDoc so a reader knows the existence guarantee is established by the caller.

## PART 4 — COMPLETION (`PER_BUNDLE_COMPLETION_SPECS` + id-aware sources)
65#3 `<path>` (add) completes from files PRESENT under `payload/files/`; 67#4 `<path>` (remove) completes from
the REGISTERED references. BOTH need the host `<id>` → both use id-aware sources reading
`ctx.bundleId` (the field Family K added to `CompletionContext` + threaded through the per-bundle completion
recursion — REUSE it, no new plumbing).

```ts
// in PER_BUNDLE_COMPLETION_SPECS:
"files add": { args: ["payload-files-on-disk"] },
"files remove": { args: ["payload-files-registered"] },
```
Add two sources in `src/completion/` + register them in `defaultRegistry()`:
- **`payload-files-on-disk`** (`src/completion/payload-files-on-disk.ts`): resolveContext → for `ctx.bundleId`,
  recursively list `bundles/<id>/payload/files/` via the fs port, return relative paths, prefix-filter; `[]` on
  no id / no project / missing dir. (Mirror `bundle-ids.ts` + reuse a small recursive walk like `cli.ts`'s
  `bundleFileTree`; keep it in the completion shell, reading via the port.)
- **`payload-files-registered`** (`src/completion/payload-files-registered.ts`): resolveContext → parse
  `bundles/<id>/bundle.yml` via `parseBundleManifest` → return `payload.files`, prefix-filter; `[]` on failure.
  (Mirror the K `bundle-requires.ts` source exactly, reading `payload.files` instead of `requires.keys()`.)

## PART 5 — TEST PLAN (unit in-process + real-binary E2E; every AC mapped)

### Schema unit (`test/unit/schema/bundle.test.ts`, EXTEND)
- absent `payload` ⇒ `payload.files` is `[]` (the old-bundle.yml compatibility case — MANDATORY).
- a populated `payload: { files: [a, b] }` parses to `["a","b"]`; round-trips via serialize→parse.
- `payload` not a mapping → rejected naming `payload`; `payload.files` not a string list → rejected naming
  `payload.files`.

### Unit (`test/unit/cli/bundle-files-commands.test.ts`, NEW — mirror `bundle-requires-commands.test.ts`)
Seed a project at `/proj` with bundle `a` (its `bundle.yml` carrying a comment + known key order) and PLACE real
files under `${PROJ}/bundles/a/payload/files/` in the MemoryFileSystem (e.g. `agents.md`, `sub/x.json`). Seed
template snippets so ④ RERENDER resolves. Init the authoring backlog.
- **65#1** add an existing `agents.md` → `payload.files` on disk is `[agents.md]`; the file content under
  `payload/files/agents.md` is BYTE-UNCHANGED; comment + key order preserved; exit 0.
- **65#1 idempotent** — add the same path twice → still `[agents.md]` (set-like, no duplicate).
- **65#1 second path** — add `agents.md` then `sub/x.json` → `[agents.md, sub/x.json]` (registration order).
- **65#2 not-on-disk** — `files add ghost.md` (no such file) → exit 1 (typed), `payload.files` unchanged (empty),
  AND bundle.yml byte-identical (nothing registered).
- **65#3 outside-project** — exit 1 naming `manifest.yml` + `init`.
- **65#3 completion (add)** — `__complete bundle a files add <tab>` → the on-disk paths (`agents.md`,
  `sub/x.json`).
- **65#4 help** — Usage + `<path>` + Example.
- **66#1/#2** list with two registered → exact stdout `agents.md\nsub/x.json\n`; manifest + bundle.yml unchanged.
- **66#1 empty** — list with none registered → `(no files)`.
- **66#3 outside-project / 66#4 help** — as above.
- **67#1** remove a registered `agents.md` → it's gone from `payload.files`; the SUMMARY printed contains
  `left at payload/files/agents.md` (doc-10:167); exit 0.
- **67#2 file-left-on-disk** — after remove, `fs.exists(${PROJ}/bundles/a/payload/files/agents.md)` is STILL
  true AND its content is unchanged (deregister-not-delete).
- **67#3 not-registered** — `files remove not-there.md` → exit 1 (NotFound), bundle.yml unchanged.
- **67#4 completion (remove)** — register `agents.md`,`sub/x.json`; `__complete bundle a files remove <tab>` →
  exactly those two (the REGISTERED refs — proves the id-aware `payload-files-registered` source).
- **67#5 help** — Usage + `<path>` + Example.
- **end-to-end in-process** — add → list (shows it) → remove → list (gone) + file still on disk + comment
  survives every write.
- **rerender** — after add, `${PROJ}/AGENTS.md` exists.
- **files group help** — lists add/list/remove.

### Real-binary E2E (append to `test/integration/cli.bundle-id.e2e.test.ts`, `describeIfBuilt`)
Through `dist/cli.js` + real `NodeFileSystem` tmpdir + real `backlog`. Use `projectWithWeb` (it scaffolds the
default bundle template, which SHIPS `payload/files/`). Place a real file under `payload/files/` with
`writeFileSync` before registering.
- 65#1: `writeFileSync(join(proj,"bundles","web","payload","files","agents.md"), "# hi")`; `bundle web files add
  agents.md` → exit 0; `bundles/web/bundle.yml` gains `payload:\n  files:\n    - agents.md` (the real
  eemeli/yaml round-trip); the placed file's CONTENT is unchanged.
- 65#2: `bundle web files add ghost.md` (not placed) → exit 1; bundle.yml unchanged.
- 66#1: after add, `bundle web files list` → stdout contains `agents.md`.
- 67#1/#2: `bundle web files remove agents.md` → exit 0; stdout contains `left at payload/files/agents.md`;
  the key is gone from bundle.yml; BUT `existsSync(join(proj,...,"payload","files","agents.md"))` is STILL true
  (file left on disk).
- 67#3: `bundle web files remove nope.md` (not registered) → exit 1; bundle.yml unchanged.
- completion: `__complete bundle web files add` (with a file placed) → lists it; `__complete bundle web files
  remove` (with it registered) → lists it.
- help: `bundle web files add --help` → contains `bundle web files add` + `<path>` + Example.
- **OLD-bundle.yml compat (real binary)** — a `bundle.yml` with NO `payload:` key still drives `files list`
  (prints `(no files)`) and `files add` (adds the field) without error — proves absent ⇒ empty end-to-end.

---

## Dev Notes

### Files to ADD
- `src/core/operations/payload-refs.ts` — the descriptor + `addPayloadRefSpec` / `listPayloadRefsSpec` /
  `removePayloadRefSpec` + `FILES_DESCRIPTOR` (pure).
- `src/completion/payload-files-on-disk.ts` + `src/completion/payload-files-registered.ts` — the two id-aware
  completion sources.
- `test/unit/cli/bundle-files-commands.test.ts` — the unit suite.

### Files to CHANGE
- `src/core/model/bundle.ts` (+ `index.ts` export) — add `BundlePayload` + `payload` on `BundleManifest`.
- `src/core/services/schema/bundle.ts` — round-trip `payload` (absent ⇒ empty).
- `src/core/operations/create-bundle.ts` — initialise `payload: { files: [] }` in the canonical manifest.
- `src/cli.ts` — add `bundleFilesModule`; append to `PER_BUNDLE_MODULES`; add the two completion specs;
  `formatPathList`; imports.
- `src/completion/registry.ts` — register the two new sources.
- `test/unit/schema/bundle.test.ts` — add the payload round-trip + absent-⇒-empty + malformed cases.
- `test/integration/cli.bundle-id.e2e.test.ts` — append the files real-binary E2E block.

### Architecture constraints (doc 13 — HARD)
- **Core boundary**: `payload-refs.ts` imports ONLY `node:path` + model + errors + lifecycle types — never
  `node:fs`/`commander`/`execa` (Biome `noRestrictedImports` + `core-boundary.test.ts`). The fs EXISTENCE
  CHECK for `add` lives in the CLI shell (which owns the port), not the op. Completion sources live under
  `src/completion/` (the shell) and read via the fs port.
- **Core is synchronous**; the add/list/remove actions are sync.
- **Error model** (docs/13 §7): not-on-disk (add) and not-registered (remove) → `NotFoundError` (exit 1),
  registering/deregistering nothing. Outside-project → the routing's `NotFoundError`. No `UsageError` path
  expected (a `<path>` is freeform).
- **Lifecycle**: add/remove ride `runMutation` (④ RERENDER auto; NO `materialise` — doc 10 lists no task for
  files); list rides `runRead`. Structure-not-content: add NEVER writes file content; remove NEVER deletes the
  file (it only edits `bundle.yml`).

### Reuse — do NOT reinvent
- The per-bundle mutation SHAPE + `editYaml` write: `src/core/operations/bundle-version.ts` /
  `bundle-requires.ts` (Family K, just merged).
- The LIST-MGMT add/remove-by-index + `addIn`/`deleteIn` sequence editing: `src/core/operations/targets.ts`
  (`deleteIn(["targets", index])`). NOTE: use `setIn([...ymlPath], jsArray)` for ADD (verified to create a
  clean block sequence even when `payload`/`payload.files` is absent — avoids the `addIn`-on-missing-key scalar
  pitfall), and `deleteIn([...ymlPath, index])` for REMOVE.
- The id-aware completion source + the `CompletionContext.bundleId` threading: Family K
  (`src/completion/bundle-requires.ts` + the `computeCompletions` per-bundle branch). REUSE the `bundleId`
  field — it already exists.
- `formatResult` / `withExamples` in `src/cli.ts`. The recursive fs walk for on-disk completion: model on
  `cli.ts`'s `bundleFileTree`.

### Project Structure Notes
- The new op + completion sources sit beside the K/J files in `src/core/operations/` and `src/completion/`.
- The descriptor is the M/N seam: M = `{ onDiskDir: "payload/templates", ymlPath: ["payload","templates"],
  select: b => b.payload.templates, noun: "template" }` (needs a `templates` category added to `BundlePayload`);
  N = `{ onDiskDir: "installer-scripts", ymlPath: ["payload","scripts"], select: b => b.payload.scripts, noun:
  "script" }`. Note M/N each ADD a category to `BundlePayload` + the schema round-trip — L lays the pattern; M/N
  extend the model the same minimal way. Document this in the op file so M/N are obvious.

### References
- [Source: docs/10-authoring-cli.md §command tree + §Per-command actions rows 165/166/167 (+ the
  templates/scripts "Same as files" rows); line 34 implicit re-render.]
- [Source: docs/06-project-skeleton.md line 137; docs/07-install-contract.md lines 46-65 — the payload layout
  (`payload/files/` delivers; `installer-scripts/` is install-time).]
- [Source: docs/13-core-architecture.md §5/§8 (lifecycle) + §7 (error model) + §1 (core purity / ports).]
- [Source: src/core/operations/bundle-requires.ts + targets.ts + bundle-version.ts — the mutation/LIST-MGMT
  templates.]
- [Source: src/core/services/schema/bundle.ts + model/bundle.ts + test/unit/schema/bundle.test.ts — the
  round-trip to extend (absent ⇒ empty is mandatory).]
- [Source: src/cli.ts — PerBundleCommandModule / PER_BUNDLE_MODULES / PER_BUNDLE_COMPLETION_SPECS / the
  bundleId completion threading; src/completion/bundle-requires.ts — the id-aware source pattern.]

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — BMAD build worker. Skills actually run (Rule 3 evidence): `bmad-create-story` (this
story), `bmad-dev-story` (code + unit tests + schema tests), `bmad-qa-generate-e2e-tests` (the real-binary E2E
block).

### Completion Notes List
- **DIVERGENCE (recorded verbatim per the story's DIVERGENCE NOTE — flagged at the gate, NOT a user gate):** L
  introduces a payload-reference registry into `bundle.yml` — a top-level **`payload:`** mapping with **`files`**
  as a string list (`payload:\n  files:\n    - a.md`). doc-10 rows 165/167 require `files add` to register "in
  bundle.yml … or equivalent" and `files remove` to deregister LEAVING the file on disk, which is only possible
  with a registry distinct from the file; doc-06:137's field list is descriptive, not exhaustive, vs doc-10's CLI
  contract. This is the doc-permitted "or equivalent"; the FIXED goals/vocabulary are unchanged. The SAME
  `payload.<category>` shape generalises to M (`payload.templates`) and N (`payload.scripts`).
- Extended the model (`BundlePayload` + `payload` on `BundleManifest`), the schema round-trip
  (`parseBundleManifest`/`serializeBundleManifest`/`BundleManifestData`), and `createBundle` (inits `payload:
  { files: [] }`). **Absent `payload` ⇒ empty** (mandatory: the parser is on the load path for every command;
  old bundle.yml + many existing fixtures omit it). Updated all `BundleManifest`-literal test fixtures (model +
  services tests) with `payload: { files: [] }`.
- Built the GENERIC descriptor-driven `src/core/operations/payload-refs.ts` (`PayloadRefDescriptor` +
  `FILES_DESCRIPTOR` + add/list/remove specs; pure, core-boundary clean). ADD uses `editYaml`
  `setIn([...ymlPath], newArray)` with a set-union (skip-if-present idempotency; also avoids the
  `addIn`-on-missing-key scalar pitfall on old bundle.yml — verified). REMOVE uses `deleteIn([...ymlPath,
  index])` and NEVER calls `fs.remove` (deregister-not-delete). NO materialise on either. The on-disk EXISTENCE
  check for `add` lives in the CLI action (the pure `check` has no ports), raising `NotFoundError` before
  `runMutation` (65#2). `remove`'s `summary` carries the doc-10:167 "left at payload/files/<path> — delete it
  yourself if you meant to" message.
- Completion: two id-aware sources reusing Family K's `CompletionContext.bundleId` threading —
  `payload-files-on-disk` (files present under `payload/files/<id>`, for `add`) and `payload-files-registered`
  (the registered refs, for `remove`).
- Dev learning baked into the tests: every mutation rides ⑤ MATERIALISE (which lists the authoring backlog) even
  when the op materialises NO task, so the in-process seed must `backlog.init(.authoring-backlog)` (as `wpm init`
  does). Caught during dev when add returned exit 1 with "No backlog initialised at .../.authoring-backlog".
- Gate (incremental): tsc clean, biome clean (formatter applied), schema unit + files unit 44/44, real-binary
  files E2E 8/8.

### Chosen bundle.yml payload-registry shape (exact)
```yaml
payload:
  files:
    - probe.sh
    - templates/agents.md
```
(top-level `payload` mapping; `files` is a string list of paths relative to `payload/files/`; absent ⇒ empty.)

### File List
- ADD `src/core/operations/payload-refs.ts`
- ADD `src/completion/payload-files-on-disk.ts`
- ADD `src/completion/payload-files-registered.ts`
- ADD `test/unit/cli/bundle-files-commands.test.ts`
- CHANGE `src/core/model/bundle.ts` (+ `src/core/model/index.ts` export) — `BundlePayload` + `payload`
- CHANGE `src/core/services/schema/bundle.ts` — round-trip `payload` (absent ⇒ empty) + `parsePayload`
- CHANGE `src/core/operations/create-bundle.ts` — init `payload: { files: [] }`
- CHANGE `src/cli.ts` — `bundleFilesModule` + `PER_BUNDLE_MODULES` + `PER_BUNDLE_COMPLETION_SPECS` +
  `formatPathList` + imports
- CHANGE `src/completion/registry.ts` — register the two payload-files sources
- CHANGE `test/unit/schema/bundle.test.ts` — the payload round-trip / absent-⇒-empty / malformed cases
- CHANGE `test/integration/cli.bundle-id.e2e.test.ts` — the files real-binary E2E block (+ `mkdirSync`/`dirname`
  imports + `placePayloadFile` helper)
- CHANGE (test fixtures, payload field) `test/unit/model/aggregates.test.ts`,
  `test/unit/services/validate.test.ts`, `test/unit/services/validate.acceptance.test.ts`,
  `test/unit/services/version-constraint.acceptance.test.ts`, `test/unit/services/derived-artefacts.test.ts`,
  `test/unit/services/derived-artefacts.acceptance.test.ts`, `test/unit/operations/create-bundle.test.ts`
