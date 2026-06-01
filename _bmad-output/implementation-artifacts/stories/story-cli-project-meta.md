# Story cli-project-meta — `project meta` (task 38)

Status: ready-for-dev

> BMAD create-story output (skill-driven; BMAD sprint-status/epics auto-discovery suppressed — the real contract
> is the Backlog.md backlog task 38, read via `backlog task 38 --plain`, NOT the foundation-epic-1
> `epics.md`/`sprint-status.yaml`; the orchestrator owns sprint status and forbids touching it). Steered from doc
> 10 row 141 (`project meta`), doc 10 line 34 (the implicit re-render: the project name feeds `AGENTS.md` +
> `<project>-installer/SKILL.md`), doc 12 (comment-preserving writes), doc 13 §1/§5/§7/§8 (purity / six-beat
> lifecycle / error model).
>
> This is **Family C** in the CLI epic-2 — a project-BOUND command (like `project version`/`project targets`),
> the project analogue of `bundle <id> meta` (Family I, `bundle-meta.ts`). It edits the project-level metadata in
> `manifest.yml`'s `project:` mapping. The `ProjectMeta` model (`src/core/model/manifest.ts`) ALREADY carries all
> five fields (name, description, license, repository, author) — **no model/schema change is needed**. The edit
> reuses the comment-preserving `editYaml` `setIn` pattern of `version.ts`/`bundle-meta.ts`/`installer-skills-
> project.ts` over `manifest.yml`'s `["project", <field>]` paths.

## Acceptance criteria (verbatim from the backlog — read via `backlog task 38 --plain`)

### TASK-38 — `project meta [--name <s>] [--description <s>] [--license <s>] [--repository <s>] [--author <s>]` (a MUTATION; doc-10 row 141)
1. Each provided flag (`--name --description --license --repository --author`) updates the matching `manifest.yml`
   project field; omitted flags leave their fields unchanged.
2. Existing comments and key order in `manifest.yml` are preserved across the edit.
3. Invoking with no flags makes no change and reports that nothing was updated.
4. Run outside any project it exits non-zero with one message naming the missing `manifest.yml` and suggesting
   `init` or the `-C` override; a `-C` path is honoured.
5. Help output is substantive (description, synopsis, every flag with its effect, an example); on success the
   command exits 0.

## doc-10 contract (cite the row)

> `project meta [--name ...] [--description ...] [--license ...] [--repository ...] [--author ...]` (row 141):
> "1. Read `manifest.yml`. 2. Update `project:` fields from provided flags (omitted flags untouched). 3. Write
> back." [Source: docs/10 §Per-command actions row 141; also §command tree — `project meta` sets the project's
> descriptive metadata.]

> The implicit re-render (doc 10 line 34): "derived artefacts stay current automatically" — the project name is
> rendered into `AGENTS.md` and the `<project>-installer/SKILL.md` (the front-door + orchestrator). So a `--name`
> change must re-render those derived artefacts. This is why `project meta` rides `runMutation` (its ④ RERENDER
> beat re-derives them), NOT a bare manifest write. [Source: docs/10 line 34; docs/13 §5 ④ RERENDER.]

> Structure-not-content (doc 10 line 25): `project meta` edits STRUCTURED fields (`project.name`, `.description`,
> etc.), never prose. It is the project analogue of `bundle <id> meta` (which edits `bundle.yml`'s version/summary/
> confirmation). [Source: docs/10 line 25; the `bundle <id> meta` row 158.]

## THE CENTRAL DESIGN — a small `OperationSpec` over `manifest.yml`'s `project:` map (record in Completion Notes)

`project meta` is the project-scoped twin of `bundle <id> meta` (`src/core/operations/bundle-meta.ts`,
`editBundleMetaSpec`): both update only the PROVIDED fields IN PLACE via the task-13 comment-preserving `editYaml`
`Document.setIn`, so omitted flags stay byte-untouched (AC38#1) and comments + key order are preserved (AC38#2).
The ONLY differences:
- It edits `manifest.yml` (project root), not `bundles/<id>/bundle.yml`. No `<id>` (it is project-bound, not
  per-bundle), so it resolves the project via the shell's `requireProject` (the canonical no-project error, AC38#4)
  rather than the per-bundle routing.
- It writes the `["project", <field>]` paths (the `project:` mapping), not the bundle's top-level keys.
- The five fields are all OPTIONAL strings; `--name` additionally feeds the ④ RERENDER (the derived front-door +
  orchestrator carry `{{project-name}}`).

**RESOLUTION:** add a small `OperationSpec<EditProjectMetaInput>` (`editProjectMetaSpec`) to a new
`src/core/operations/project-meta.ts` (the project twin of `bundle-meta.ts`), riding `runMutation`. ③ APPLY
`setIn`s each provided field; ④ RERENDER (the harness) re-renders the derived artefacts so a `--name` change flows
to `AGENTS.md` + the installer SKILL.md automatically — the operation arranges no rerender itself. No ⑤
MATERIALISE (editing project metadata queues no authoring work, exactly as `version.ts` set/bump and
`bundle-meta.ts` omit it).

> **No model/schema change.** `ProjectMeta` (`src/core/model/manifest.ts`) already declares `name` (required),
> `version` (required), and the four optional `description`/`license`/`repository`/`author`. The schema
> (`src/core/services/schema/manifest.ts`) already parses + serialises them (confirm by grep — they are read on
> the LOAD path today). `project meta` only WRITES them via `editYaml`; it does not change the parse/serialise.
> (VERIFY the schema round-trips all five before relying on it; if a field were missing from the parser the
> `project show` read would already be dropping it — but it is part of `ProjectMeta`, so it round-trips.)

## AC38#3 — the no-flag no-op (the one behavioural subtlety)

doc-10 row 141 step 2 is "update fields from flags"; with NO flags there is nothing to update. AC38#3 makes this
explicit: **no change, and report that nothing was updated, exit 0.** Contrast `bundle <id> meta`, which raises a
USAGE error (exit 2) on no flags — `project meta`'s AC is DIFFERENT (a friendly no-op success, NOT an error). So:
- The CLI leaf checks whether ANY of the five flags was provided. If NONE, it prints "nothing to update — pass at
  least one of --name/--description/--license/--repository/--author" (or similar) and returns WITHOUT calling
  `runMutation` at all (so ④ RERENDER does not even run — a true no-op; nothing on disk changes, AC38#3). Exit 0.
- This no-flag guard lives in the CLI shell (the leaf), BEFORE `runMutation` — the operation is only invoked when
  at least one field is present, so the spec never has to handle the empty case. (Mirrors how `bundle <id> meta`'s
  leaf guards the empty case before `runMutation`, but here the verdict is exit-0-no-op, not exit-2-usage-error.)

> Why not run `runMutation` with an empty change set and detect "nothing changed" after? Because ④ RERENDER would
> still run and could (re)write the front-door / re-ensure aliases on a project where they are stale, which is NOT
> "no change" (AC38#3 is strict). Guarding in the leaf before the harness keeps the no-flag path a genuine no-op
> that touches nothing. (This is the same lesson Family Q's no-op detection learned: the rerender beat is not
> free of side effects on a stale project, so a true no-op must NOT enter the harness.)

## PART 1 — THE CORE OPERATION (`src/core/operations/project-meta.ts`, NEW)

```ts
import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import type { Project } from "../model/index.js";
import type { ApplyContext, ApplyOutcome, OperationSpec } from "./lifecycle.js";

/** The project manifest filename at the root. */
const MANIFEST_FILE = "manifest.yml";

/** The input to `editProjectMetaSpec`: only the PROVIDED metadata fields (each updated when present). */
export interface EditProjectMetaInput {
  readonly name?: string;
  readonly description?: string;
  readonly license?: string;
  readonly repository?: string;
  readonly author?: string;
}

/**
 * `project meta` (doc 10 row 141), a mutation. ③ APPLY updates only the provided `project:` fields in
 * `manifest.yml` comment-and-key-order-preservingly via `editYaml` `setIn`; ④ RERENDER (the harness) re-renders
 * the derived front-door + orchestrator, so a changed `--name` flows to AGENTS.md + the installer SKILL.md (doc 10
 * line 34). No `check` (the fields are free strings — a bad value is not possible; the leaf already guarded the
 * no-flag case). No `materialise`.
 */
export function editProjectMetaSpec(): OperationSpec<EditProjectMetaInput> {
  return {
    summary: () => "updated project metadata",
    apply: ({ fs, root }: ApplyContext, _project: Project, input): ApplyOutcome => {
      const manifestPath = join(root, MANIFEST_FILE);
      const next = editYaml(fs.read(manifestPath), (doc) => {
        if (input.name !== undefined) doc.setIn(["project", "name"], input.name);
        if (input.description !== undefined) doc.setIn(["project", "description"], input.description);
        if (input.license !== undefined) doc.setIn(["project", "license"], input.license);
        if (input.repository !== undefined) doc.setIn(["project", "repository"], input.repository);
        if (input.author !== undefined) doc.setIn(["project", "author"], input.author);
      });
      fs.write(manifestPath, next);
      return { changedPaths: [manifestPath] };
    },
  };
}
```
- Pure over the FileSystem port (doc 13 §1): imports only `node:path`, the yaml leaf, the model type, and the
  lifecycle types — never `node:fs`/`commander`/`execa`. (`core-boundary.test.ts` + Biome enforce.)
- `setIn(["project", "name"], value)` SETS the key in place (creating it if absent — but all five are part of the
  canonical `manifest.yml` `project:` map; the optionals may be absent in a minimal manifest, and `setIn`
  introduces them comment-preservingly, exactly like `bundle-meta.ts` introducing a field). Comments + key order
  outside the touched key are preserved (the `editYaml` contract).

## PART 2 — THE CLI LEAF (`src/cli.ts`, add a `project meta` subcommand under `projectModule`)

Add it inside `projectModule.register` (the project group), alongside `project version`/`project show`/`project
targets`. Model the SHAPE on `bundle <id> meta` (the multi-optional-flag mutation) but project-bound + the no-flag
exit-0-no-op.

```ts
// ── project meta [--name ...] [--description ...] [--license ...] [--repository ...] [--author ...] ──────────
// Edit the project's descriptive metadata in manifest.yml; only provided flags change (omitted untouched). A
// --name change re-renders the derived front-door + installer skill (④ RERENDER). No flags ⇒ exit-0 no-op (AC38#3).
const metaLeaf = group
  .command("meta")
  .description("edit the project's metadata in manifest.yml: name, description, license, repository, author (doc 10)")
  .option("--name <name>", "set the project name (also re-renders AGENTS.md + the installer skill)")
  .option("--description <description>", "set the project's one-line description")
  .option("--license <license>", "set the project's SPDX license identifier")
  .option("--repository <repository>", "set the project's repository URL")
  .option("--author <author>", "set the project's author")
  .action((opts: { name?: string; description?: string; license?: string; repository?: string; author?: string }) => {
    const root = requireProject(ctx, parent);           // AC38#4: the canonical no-project error (exit 1) + -C honoured
    // AC38#3: with NO flags, make no change and report nothing updated — exit 0, WITHOUT entering the lifecycle.
    const provided =
      opts.name !== undefined || opts.description !== undefined || opts.license !== undefined ||
      opts.repository !== undefined || opts.author !== undefined;
    if (!provided) {
      ctx.io.out.write(
        "nothing to update — pass at least one of --name, --description, --license, --repository, --author\n",
      );
      return;
    }
    const result = runMutation(lifecycleDepsFor(ctx, root), { root }, editProjectMetaSpec(), {
      ...(opts.name !== undefined ? { name: opts.name } : {}),
      ...(opts.description !== undefined ? { description: opts.description } : {}),
      ...(opts.license !== undefined ? { license: opts.license } : {}),
      ...(opts.repository !== undefined ? { repository: opts.repository } : {}),
      ...(opts.author !== undefined ? { author: opts.author } : {}),
    });
    ctx.io.out.write(formatResult(result));
  });
withExamples(metaLeaf, [
  {
    command: 'wpm project meta --name acme-installer --description "Acme onboarding" --license MIT',
    note: "set the project's name, description, and license (only the named fields change)",
  },
]);
```
- Import `editProjectMetaSpec` from `./core/operations/project-meta.js`.
- AC38#5: every flag has its effect text via `.option(...)`; commander auto-renders Usage + each flag; `withExamples`
  adds the worked example (the task-28 completeness guard requires the example block + a description/Usage). The
  example uses a non-trivial flag set, so it carries one (the `bundle new`/`bundle <id> meta` convention).
- Spreading only the present flags (the `...(opts.x !== undefined ? {x} : {})` idiom) keeps `exactOptionalPropertyTypes`
  happy and ensures the spec's `input` has ONLY the provided fields (omitted ones are `undefined`-absent, so the
  spec's `if (input.x !== undefined)` leaves them untouched — AC38#1). This is the SAME spread pattern
  `bundle <id> meta`'s leaf uses.

> NO completion spec for `project meta`: its flags take free-text VALUES (a name/description/URL/author — no
> enumerable source), so there is nothing to complete (unlike `--confirmation-level`'s `safe|dangerous`). commander
> still completes the flag NAMES themselves via the tree. (If a future task wants `--license` to complete from SPDX
> ids, that is a new source — out of scope here.)

## PART 3 — TEST PLAN (unit in-process + real-binary E2E; every AC mapped)

### CLI unit (`test/unit/cli/project-meta-commands.test.ts`, NEW — mirror `version-commands.test.ts` / `targets-commands.test.ts`)
Seed `/proj` with a `manifest.yml` carrying a LEADING COMMENT + a known `project:` key order + the optional fields
PARTIALLY present (e.g. name + version + description, but NO license/repository/author) so both the "update an
existing field" and the "introduce an absent field" paths are covered. Seed the project template snippets (AGENTS.md
+ the `{{project-name}}-installer` SKILL.md) so ④ RERENDER resolves. Drive via `run()` in-process over
`MemoryFileSystem` + `FakeBacklog`.

- **38#1 each flag updates its field** — for each of the five flags, `project meta --<flag> <value>` → exit 0; the
  matching `manifest.yml` `project.<field>` is the new value (parse via `parseManifest`); the OTHER four fields are
  unchanged. (Use a parametrised `it.each` over the five fields.)
- **38#1 omitted untouched** — `project meta --description "new desc"` → only `description` changed; `name`,
  `version`, and any pre-set fields are byte-identical (capture the manifest before/after and diff the non-target
  lines). ALSO: a multi-flag call (`--name X --license MIT`) updates BOTH and leaves the rest.
- **38#1 introduce an absent field** — on a manifest WITHOUT `author`, `project meta --author "Jane"` → exit 0;
  `project.author` is now "Jane" (the field was introduced comment-preservingly); the other fields + the leading
  comment survive.
- **38#2 comment + key order preserved** — after a `--description` edit, the leading `# ...` comment survives AND
  the `project:` key order is unchanged (extract the key order before/after and assert equal — the
  `bundle-version-commands.test.ts` key-order helper).
- **38#3 no-flag no-op** — `project meta` (no flags) → exit 0; stdout says "nothing to update"; the `manifest.yml`
  is BYTE-IDENTICAL (capture before/after); AND the derived artefacts are NOT (re-)written — assert ④ RERENDER did
  NOT run (e.g. `${PROJ}/AGENTS.md` does NOT exist if it didn't before — seed WITHOUT a pre-rendered AGENTS.md, so
  its absence after the no-op proves the harness was never entered).
- **38#4 outside-project** — `project meta --name x` from `/nowhere` → exit 1; stderr names `manifest.yml` + `init`
  (the canonical message); ONE message. AND a `-C` path IS honoured: `project meta --name x -C /proj` from
  `/nowhere` → exit 0, the name updated (proving `-C` overrides the upward search).
- **38#5 help** — `project meta --help` → Usage + ALL FIVE flags each with its effect text + an Example; exit 0.
- **the ④ re-render on --name** — seed the snippets; `project meta --name renamed` → exit 0; `${PROJ}/AGENTS.md`
  exists AND contains "renamed" (the front-door re-rendered with the new name); the installer SKILL.md was rendered
  to the name-derived path (`${PROJ}/installer-skills/renamed-installer/SKILL.md` exists — the orchestrator snippet
  path carries `{{project-name}}`). Contrast a `--description`-only edit, which re-renders but the name is unchanged
  so AGENTS.md's name is the original.
- **end-to-end** — a sequence: `meta --name a` → `project show` reflects name a → `meta --description d` → show
  reflects BOTH (name a + description d) → the leading comment survived every write. (Use `project show` as the read
  oracle — it is already built; AC confirms the manifest is the single source of truth.)

### Real-binary E2E (NEW file `test/integration/cli.project-meta.e2e.test.ts`, `describeIfBuilt`, OR append to an existing project E2E file)
Through `dist/cli.js` + real `NodeFileSystem` tmpdir (no `backlog` needed — `project meta` materialises nothing, but
the binary still drives the real fs round-trip). Use `withTempDir` + an `init demo --at <proj>` (which writes a real
`manifest.yml` with the `project:` map AND renders the initial AGENTS.md + installer SKILL.md — so the re-render is
testable against real derived artefacts). Mirror the `cli` / `wpm` helper shape from `cli.bundle-id.e2e.test.ts`
(copy the small `cli`/`wpm`/`withTempDir` helpers, or factor them — but a self-contained copy in the new file is
simplest and matches the project's per-file-helper convention).

- **38#1/38#2 each flag updates its field, comment + order preserved** — `wpm project meta --description "Acme
  installer"` → exit 0; the REAL `manifest.yml` `project.description` is "Acme installer" (read the file, match
  `/description:\s*Acme installer/` tolerant of layout); `name`/`version` untouched; the `project:` key order is
  stable across the eemeli/yaml round-trip.
- **38#1 multi-flag** — `wpm project meta --license MIT --repository https://example.com/r --author "Jane Q"` → all
  three set; the others untouched.
- **38#3 no-flag no-op** — capture `manifest.yml` bytes; `wpm project meta` → exit 0; stdout "nothing to update";
  the `manifest.yml` is BYTE-IDENTICAL after.
- **38#4 outside-project + -C** — `wpm project meta --name x` run from a cwd OUTSIDE any project → exit ≠ 0; stderr
  names `manifest.yml`. AND `wpm project meta --name x -C <proj>` from outside → exit 0, the name updated (the `-C`
  override).
- **38#4 the ④ re-render (real derived artefacts)** — `init demo` rendered `AGENTS.md` + `installer-skills/demo-
  installer/SKILL.md` at the project root. `wpm project meta --name renamed` → exit 0; the REAL `AGENTS.md` now
  contains "renamed" (the front-door re-rendered with the new name); the installer SKILL.md for the NEW name exists
  at `installer-skills/renamed-installer/SKILL.md` (the name-derived orchestrator path). This is the load-bearing
  proof that `--name` re-renders the derived artefacts on the real binary (AC — doc-10:34).
- **38#5 help** — `wpm project meta --help` → contains "project meta", Usage, all five flag names, and an Example.
- **end-to-end** — `meta --description d` then `wpm project show` → the orientation prints `description: d` (the read
  reflects the write through the real binary).

> IMPORTANT (per the worker brief): run vitest ONE process at a time. The integration project is
> `fileParallelism:false` over shared real-backlog/dist state; never two vitest runs at once.

---

## Dev Notes

### Files to ADD
- `src/core/operations/project-meta.ts` — `editProjectMetaSpec` + `EditProjectMetaInput`.
- `test/unit/cli/project-meta-commands.test.ts` — the new in-process CLI suite.
- `test/integration/cli.project-meta.e2e.test.ts` — the real-binary E2E suite (with self-contained `cli`/`wpm`/
  `withTempDir` helpers, or import the shared tmpdir helper).
- (No new model/service files — `ProjectMeta` already has all five fields; the schema already round-trips them.)

### Files to CHANGE
- `src/cli.ts` — add the `project meta` leaf under `projectModule`; import `editProjectMetaSpec`.

### Architecture constraints (doc 13 — HARD)
- **Core boundary**: `project-meta.ts` stays PURE — imports only `node:path`, the yaml leaf, the model type, the
  lifecycle types; NEVER `node:fs`/`commander`/`execa`. (`core-boundary.test.ts` + Biome `noRestrictedImports`
  enforce.) The manifest read/write goes through the injected `fs` port on `ApplyContext`.
- **Core is synchronous**; the action is sync.
- **Error model** (doc 13 §7): outside-project → the shell's `requireProject` `NotFoundError` (exit 1, one message).
  No-flag → exit 0 no-op (NOT an error — AC38#3 is explicit, contrast `bundle <id> meta`'s exit-2). No bad-value
  path (the five fields are free strings).
- **Lifecycle**: `project meta` rides `runMutation` ONLY when at least one flag is provided; ④ RERENDER then
  re-renders the derived artefacts (delivering the `--name` re-render). No ⑤ MATERIALISE (no authoring work). The
  no-flag case does NOT enter the harness (a true no-op).
- **Comment preservation**: the `editYaml` `setIn` path is the SAME one `version.ts`/`bundle-meta.ts`/`installer-
  skills-project.ts` use — comments, key order, and untouched keys all survive (AC38#2).

### Reuse — do NOT reinvent
- The comment-preserving manifest edit: `editYaml` + `doc.setIn(["project", <field>], value)` — the SAME pattern as
  `setVersionSpec` (`version.ts` writes `["project", "version"]`) and `editBundleMetaSpec` (`bundle-meta.ts`). C
  writes the five `["project", <field>]` paths.
- The project-bound resolution + no-project error: `requireProject(ctx, parent)` (the shell helper every `project`
  leaf calls) — gives AC38#4 (the canonical message + `-C` honoured) for free.
- The lifecycle deriver wiring: `lifecycleDepsFor(ctx, root)` — the SAME `runMutation` deps every project mutation
  uses; its ④ RERENDER re-renders the derived artefacts feeding `{{project-name}}`.
- The multi-optional-flag leaf shape + the `...(opts.x !== undefined ? {x} : {})` spread: `bundle <id> meta`'s leaf.
- The `formatResult` output + `withExamples` help: the shared CLI helpers.
- `ProjectMeta` (model) + the manifest schema parse/serialise: UNCHANGED — all five fields already exist.

### Project Structure Notes
- C is a project-BOUND command (no `<id>`), the project twin of `bundle <id> meta` (I). The genuinely-new code is a
  ~12-line spec + a ~25-line leaf — no model/schema change, because `ProjectMeta` was designed with all five fields
  from the start (`src/core/model/manifest.ts`).
- The one behavioural divergence from `bundle <id> meta`: the no-flag case is an exit-0 NO-OP (AC38#3), not an
  exit-2 usage error. This is a deliberate doc-10 difference (row 141 step 2 "update from flags" with no flags = no
  update), handled by a leaf guard BEFORE the harness so it touches nothing.
- The `--name` re-render is the load-bearing behaviour C adds that a plain manifest write would miss: the project
  name feeds `AGENTS.md` + `<project>-installer/SKILL.md` (doc-10:34), so the edit MUST ride `runMutation`'s ④
  RERENDER. The real-binary E2E proves it against the actual derived artefacts `init` rendered.

### References
- [Source: docs/10-authoring-cli.md §Per-command actions row 141 (`project meta` — read manifest, update project:
  fields from flags omitted untouched, write back); line 34 (implicit re-render — the project name feeds the
  front-door + installer skill); line 25 (Structure, not content).]
- [Source: docs/13-core-architecture.md §1 (ports/purity; operations MAY call the fs port), §5/§8 (six-beat
  lifecycle: ④ RERENDER re-renders the derived artefacts), §7 (error model → exit codes; the no-flag no-op is an
  exit-0 success, not an error).]
- [Source: docs/12-builder-architecture.md (comment-preserving YAML writes via the eemeli/yaml `editYaml`).]
- [Source: src/core/model/manifest.ts (`ProjectMeta` — all five fields ALREADY declared: name, version,
  description, license, repository, author; NO model change); src/core/services/schema/manifest.ts (the manifest
  parse/serialise — already round-trips the five fields); src/core/operations/version.ts (`setVersionSpec` — the
  `editYaml setIn(["project","version"])` manifest-edit pattern C reuses for the five project fields); src/core/
  operations/bundle-meta.ts (`editBundleMetaSpec` — the multi-optional-field in-place edit + the leaf's
  flag-spread, the bundle twin of C); src/core/operations/installer-skills-project.ts (the project-scoped
  manifest-edit precedent); src/core/services/derived-artefacts.ts (`buildParams` — `project-name` from
  `manifest.meta.name` feeds AGENTS.md + the installer SKILL.md, the ④ RERENDER C triggers via `--name`); src/cli.ts
  `projectModule` (the project group + `requireProject` + `project version`'s leaf shape).]
- [Source: _bmad-output/implementation-artifacts/stories/story-cli-bundle-id.md — Family I, `bundle <id> meta`, the
  per-bundle twin of this project-scoped command.]

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — BMAD build worker. Skills actually run (Rule 3 evidence): `bmad-create-story` (this
story), `bmad-dev-story` (the `editProjectMetaSpec` + the `project meta` leaf + unit tests),
`bmad-qa-generate-e2e-tests` (the real-binary E2E: each flag updates its field / omitted untouched / comment+order
preserved / no-flag no-op / outside-project + -C / the --name re-render against real derived artefacts).

### Completion Notes List
(to be filled by dev-story / qa)

### File List
(to be filled by dev-story / qa)

### Status
ready-for-dev
