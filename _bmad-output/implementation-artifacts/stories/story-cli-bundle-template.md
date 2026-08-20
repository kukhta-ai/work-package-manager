# Story cli-bundle-template — `bundle template show` / `bundle template set <name>` (tasks 55 + 56)

Status: ready-for-dev

> BMAD create-story output (skill-driven; BMAD sprint-status/epics auto-discovery suppressed — the real contract
> is the Backlog.md backlog tasks 55/56, read via `backlog task <id> --plain`, NOT the foundation-epic-1
> `epics.md`/`sprint-status.yaml`; the orchestrator owns sprint status and forbids touching it). Steered from doc
> 10 lines 155–156 (`bundle template show`/`set`), doc 12 §"two-tier resolution" (`template-resolver.ts`: project
> -local `templates/` → built-in; bundle templates carry `template.yml` scope:bundle + a `files/` tree), doc 13
> §1/§3/§5/§7/§8 (purity / ports / six-beat lifecycle / error model / read trace).
>
> **Family H** — the last top-level `bundle` group. `bundle template` is a FIXED `bundle` verb (in
> `RESERVED_BUNDLE_VERBS`); register `template` as a fixed SUBGROUP of the `bundle` group in `bundleModule` (like
> `bundle new`/`enable`/`disable`/`remove`/`list`), NOT a per-bundle-`<id>` module. It operates on the project's
> DEFAULT bundle scaffold at `bundles/bundle-template/` — the directory `bundle new` conceptually defaults to (doc
> 10 line 150 step 2). `show` is read-only; `set` replaces its contents from a named bundle-scope template.

## Acceptance criteria (verbatim from the backlog — read via `backlog task <id> --plain`)

### TASK-55 — `bundle template show` (a READ; doc-10 row 155)
1. The command prints the template metadata and a tree summary of `bundles/bundle-template/`.
2. The command reads and reports only, with no change on disk, and exits 0 on success.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting init or the `-C`
   override.
4. Help output is substantive (description, synopsis, an example).

### TASK-56 — `bundle template set <name>` (a MUTATION; doc-10 row 156)
1. Given a name that resolves to a bundle-scope template, the command replaces the contents of
   `bundles/bundle-template/` from that template files tree.
2. A name that does not resolve, or resolves to a non-bundle-scope template, fails with a typed error and a
   non-zero exit, changing nothing.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting init or the `-C`
   override; the name positional completes from bundle-scope templates.
4. Help output is substantive (description, synopsis, the name positional, an example); on success exits 0.

## doc-10 contract (cite the rows)

> `bundle template show` (row 155): "1. Inspect `bundles/bundle-template/`: its template metadata + tree."
> [Source: docs/10 §Per-command actions row 155.]

> `bundle template set <name>` (row 156): "1. Resolve `<name>` from registry (must have `scope: bundle`). 2.
> Replace `bundles/bundle-template/` contents from template's `files/`." [Source: docs/10 row 156.]

## ARCHITECTURE COMPLIANCE (doc 13 — the fixed principles)

- **Pure core, effects via injected ports** (doc 13 §1): any new operation module under `src/core/operations/`
  imports only the model/errors/services + the ports + `node:path`. BUT — see "THE DESIGN DECISION" — `show` and
  `set` are thin enough to ride EXISTING pure services (`resolveTemplate`) + the FileSystem port directly from the
  CLI shell, with NO new core operation file needed. The core-boundary lint test still applies to anything added
  under `src/core/`. [Source: architecture.md; AGENTS.md invariant.]
- **Error model** (doc 13 §7): `UsageError`→2; `NotFoundError`/`ValidationError`→1; help→0. `set`'s unresolved /
  wrong-scope name is a typed `NotFoundError`/`ValidationError` (exit 1, AC56#2). The canonical no-project error is
  the shared `NO_PROJECT_MESSAGE` (exit 1) every project-bound command uses.
- **Output is not a port** (doc 13 §3): the metadata/tree formatting lives in the CLI shell, never in core.
- **Two-tier resolution** (doc 12; `template-resolver.ts`): `resolveTemplate(name, scope, deps)` searches
  project-local `<root>/templates/<scope>/<name>/` FIRST, then the built-in root — already implemented; REUSE it.

## THE CENTRAL DESIGN DECISION — `bundles/bundle-template/` vs `templates/bundle/<name>/` (record in Completion Notes)

There are TWO distinct things, and the AC wording must be read precisely:

1. **`templates/bundle/<name>/`** — a TEMPLATE in the registry. It has a `template.yml` (scope:bundle) AND a
   `files/` subtree. `resolveTemplate(name, "bundle", deps)` reads it. The built-in `default` lives at
   `templates/bundle/default/` (`template.yml` + `files/{AGENTS.md.tmpl, install-backlog/, payload/, …}`).
2. **`bundles/bundle-template/`** — the project's DEFAULT bundle SCAFFOLD. It is the `files/` tree of some bundle
   template, COPIED into the project (doc 10 line 150 step 2: `bundle new`'s "default: project's
   `bundles/bundle-template/`"). It carries NO `template.yml` of its own — only the scaffold content. **Verified:
   the built-in `default` template's `files/` contains NO `template.yml`** (the descriptor lives one level up at
   `templates/bundle/default/template.yml`, outside `files/`).

Consequences for the two commands:

- **`set <name>`** RESOLVES the template `<name>` (tier-1) and copies its `files/` tree into
  `bundles/bundle-template/` (AC56#1 says exactly this: "from that template **files tree**"). So
  `bundles/bundle-template/` ends up holding the `files/` content (AGENTS.md.tmpl, install-backlog/, payload/, …)
  — and NO `template.yml`.
- **`show`** inspects `bundles/bundle-template/` (the COPIED scaffold), which normally has NO `template.yml`. So
  its "template metadata" (AC55#1) is whatever is knowable: a header identifying it as the project default bundle
  template + a `template.yml` block IF one happens to be present (future-proofing — an author MAY place one), and
  always the **tree summary** of the directory. Do NOT try to read a `template.yml` that isn't there; print the
  tree (the load-bearing half of AC55#1) and a metadata header, and include parsed `template.yml` fields only when
  the file exists.

**CRITICAL — `init` does NOT create `bundles/bundle-template/`.** The minimal project template ships no `bundles/`
directory (verified: `templates/project/minimal/files/` has no `bundles/`). So in a freshly-`init`'d project,
`bundles/bundle-template/` is ABSENT. Therefore:
- `show` on an absent `bundles/bundle-template/` → a typed `NotFoundError` (exit 1) naming the dir and suggesting
  `wpm bundle template set <name>` to create it. (This keeps `show` read-only + non-zero-for-absent, which is
  correct: there is genuinely nothing to show. Do NOT auto-create it.)
- `set` CREATES `bundles/bundle-template/` (it is the command that populates it), so it works in a fresh project.

> NOTE a pre-existing divergence (record, do not fix here): the current `createBundleSpec` resolves its scaffold
> via `resolveTemplate(bundleTemplateName, "bundle", …)` against `templates/bundle/<name>/`, NOT against
> `bundles/bundle-template/`. So today `bundle new` does NOT actually read `bundles/bundle-template/` (doc 10 line
> 150 step 2's "default: project's `bundles/bundle-template/`" is aspirational vs the current code). That wiring is
> OUTSIDE H's scope (tasks 55/56 only). H implements exactly what AC55/AC56 + doc-10:155-156 state about
> `bundles/bundle-template/`; it does not change `bundle new`. Flag this at the gate if it matters.

## THE FileSystem PORT OPS — all present, NO additions

`src/core/ports/filesystem.ts` (verified) already has everything H needs:
- `exists(path)` — the dir-presence probe (`show`'s absent-dir guard).
- `list(path)` → `DirEntry[]` (name + kind) — the tree walk (REUSE the shell's existing `bundleFileTree`-style
  recursion; or a generic dir-tree helper).
- `read(path)` — reading a `template.yml` if present.
- `remove(path)` — recursive + no-op-if-absent — to CLEAR `bundles/bundle-template/` before the copy (AC56#1
  "replaces the contents").
- `copyTree(from, to)` — recursive byte-preserving copy with **merge-into** semantics — BUT note its doc: "If `to`
  already exists, the copy **merges** into it". So a bare `copyTree` would MERGE the new template over stale files,
  not REPLACE. AC56#1 says "replaces the contents", so `set` must `fs.remove(bundleTemplateDir)` FIRST, THEN
  `copyTree(resolvedTemplateFilesDir, bundleTemplateDir)` — clear-then-copy = a true replace.
- `makeDirectories(path)` — ensure the parent exists (copyTree creates missing parents itself, so usually unneeded).

**No FileSystem port additions.** (Confirm by re-reading the port before coding; it is complete.)

> WAIT — `copyTree` copies a SOURCE DIRECTORY. The resolved template's `files/` tree lives on disk at
> `<resolvedRoot>/<scope>/<name>/files/`. `resolveTemplate` returns a `Template` with an IN-MEMORY `files:
> TemplateFile[]` array (each `{path, content}`), NOT a source path. Two options for `set`:
>   (a) Use `resolveTemplate` ONLY to validate (found + scope:bundle) and to learn WHERE the template dir is, then
>       `fs.remove(dest)` + `fs.copyTree(<templateDir>/files, dest)` — needs the on-disk template-dir path.
>       `resolveTemplate` does NOT return the dir path. So reconstruct it (project-local first, then built-in) the
>       SAME way the resolver does, OR
>   (b) Use the resolved `Template.files` (the in-memory `{path, content}[]`) and WRITE each file via `fs.write`
>       into `bundles/bundle-template/<path>` after `fs.remove(dest)`. This needs NO dir-path reconstruction and
>       reuses the parsed result — and is exactly how `init`/`createBundle` already materialise a template
>       (`renderTree(resolution.template.files, params)` then `fs.write` per file). **PREFER (b)** — it is the
>       established pattern, avoids duplicating the resolver's path logic, and is purely port-driven. (No
>       substitution: `bundle template set` copies the template VERBATIM — it does not render `{{placeholders}}`,
>       because the placeholders are filled later when `bundle new` instantiates from this scaffold. So write
>       `file.content` raw, NOT `renderTree(...)`.)

## PART A — `bundle template show` (task-55) — a READ

### A1. The shell action (in `bundleModule`, after the `list` leaf)

```ts
const template = group.command("template").description("the project's default bundle scaffold at bundles/bundle-template/ (doc 10)");

const showLeaf = template
  .command("show")
  .description("print the project default bundle template's metadata + a tree summary of bundles/bundle-template/ (doc 10)")
  .action(() => {
    const root = requireProject(ctx, parent);                         // AC55#3 (canonical no-project NotFound)
    const dir = join(root, "bundles", "bundle-template");
    if (!ctx.deps.fs.exists(dir)) {
      // AC55: absent in a fresh project (init ships no bundles/). Read-only + non-zero — nothing to show.
      throw new NotFoundError(
        `no bundle template at bundles/bundle-template — run \`wpm bundle template set <name>\` to create it from a registered bundle template`,
      );
    }
    ctx.io.out.write(formatBundleTemplate(ctx.deps.fs, root, dir));    // AC55#1 metadata + tree
  });
withExamples(showLeaf, [{ command: "wpm bundle template show", note: "inspect the project default bundle scaffold" }]);
```

### A2. `formatBundleTemplate(fs, root, dir)` — the shell formatter (output not a port, doc 13 §3)

- A header line identifying it: `Bundle template: bundles/bundle-template/`.
- IF `bundles/bundle-template/template.yml` exists: parse it via `parseTemplateDescriptor(parseYaml(fs.read(...)))`
  (the schema service the existing `template show` uses) and print its description + parameters (mirror
  `formatTemplateShow`). This branch is future-proofing — the copied `files/` normally has NO `template.yml`, so it
  is usually skipped. Do not error if absent.
- Always: a **tree summary** — the relative file paths under `bundles/bundle-template/`, sorted (REUSE the existing
  `bundleFileTree`-style recursion already in `cli.ts`, generalised to take a base dir; or add a small
  `dirFileTree(fs, base)` shell helper). This is the load-bearing half of AC55#1.
- An empty dir prints the header + a `(no files)` tree marker (don't crash).

Read-only — the action calls no mutation; nothing is written (AC55#2).

## PART B — `bundle template set <name>` (task-56) — a MUTATION

### B1. The shell action (after `show`)

```ts
const setLeaf = template
  .command("set")
  .description("replace the project default bundle scaffold (bundles/bundle-template/) from a registered bundle-scope template (doc 10)")
  .argument("<name>", "the bundle-scope template to copy from (its files/ tree replaces bundles/bundle-template/)")
  .action((name: string) => {
    const root = requireProject(ctx, parent);                         // AC56#3
    const resolution = resolveTemplate(name, "bundle", {
      fs: ctx.deps.fs,
      builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot,
      projectTemplatesRoot: join(root, "templates"),
    });
    if (!resolution.found) {
      // AC56#2: a name that does not resolve as a BUNDLE template → typed NotFound (exit 1), change nothing.
      throw new NotFoundError(`bundle template "${name}" not found (searched: ${resolution.searched.join(", ")})`);
    }
    // Defense-in-depth: resolveTemplate(name, "bundle", …) only finds templates under the `bundle/` scope dir, so a
    // project-scope template named `minimal` is ALREADY a not-found here (it lives under `project/`, not `bundle/`).
    // The descriptor's own `scope` is therefore bundle by construction; assert it to be safe (AC56#2 wrong-scope).
    if (resolution.template.scope !== "bundle") {
      throw new ValidationError(`template "${name}" is not a bundle-scope template (scope: ${resolution.template.scope})`);
    }

    // AC56#1: REPLACE bundles/bundle-template/ contents — clear THEN copy (copyTree merges, so a bare copy would
    // leave stale files). Write each resolved file VERBATIM (no {{placeholder}} substitution — the scaffold keeps
    // its placeholders for `bundle new` to fill later).
    const dest = join(root, "bundles", "bundle-template");
    ctx.deps.fs.remove(dest);
    for (const file of resolution.template.files) {
      ctx.deps.fs.write(join(dest, file.path), file.content);
    }
    ctx.io.out.write(`set bundle template from "${name}" → bundles/bundle-template/ (${resolution.template.files.length} file(s))\n`);
  });
withExamples(setLeaf, [{ command: "wpm bundle template set default", note: "reset the project default bundle scaffold to the built-in `default`" }]);
```

Notes:
- `ValidationError` is imported already in `cli.ts`. `resolveTemplate`/`NotFoundError` too. No new imports beyond
  whatever is already there.
- AC56#2 "changing nothing": the resolve + scope check happen BEFORE the `fs.remove`/`fs.write`, so a bad name
  never reaches the destructive clear. (The `remove`+`write` is NOT inside a mutation harness — it is a direct
  port effect in the shell, like `init` writes; it is NOT a `runMutation` because there is no manifest/bundle
  state to ④ RERENDER and no ⑤ MATERIALISE — `bundle template set` touches only the scaffold dir, exactly as doc
  10 row 156 says: "Replace `bundles/bundle-template/` contents". Confirm no derived artefact depends on the
  bundle-template dir — it does not, the front-door menu derives from `manifest.bundles`, not the scaffold.)

> Why NOT ride `runMutation`? `runMutation` ① LOADs the project (manifest + every enabled bundle.yml) and ④
> RERENDERs the front-door. `bundle template set` changes none of that state — it rewrites a scaffold directory
> that is not part of the loaded `Project` and not an input to the deriver. Forcing it through `runMutation` would
> add a pointless reload + rerender. A direct shell effect (resolve in core via `resolveTemplate`, then
> remove+write via the fs port) is the honest shape — the same shape `init` uses for its initial copy. Record this.

### B2. Whether a core operation file is needed

NO new `src/core/operations/*.ts` is required: the only "logic" is (a) `resolveTemplate` — an EXISTING pure
service — and (b) the clear+copy, which is a sequence of fs-port calls. Both `show` and `set` are thin shell
actions over existing pure pieces (mirroring how `templateModule`'s `list`/`show` already call `listTemplates`/
`resolveTemplate` directly from the shell with NO operation file). If a reviewer prefers a pure helper for the
"which files to write" decision, it is trivially `resolution.template.files` — already pure. Keep H in the shell;
do not invent a core module that merely wraps fs calls (that would push effects into core — a boundary smell).

## COMPLETION (AC56#3)

Add to `COMPLETION_SPECS` (top-level):
```ts
"bundle template set": { args: ["bundle-template-names"] },   // <name> — bundle-scope templates (REUSE the source)
```
`bundle-template-names` (`src/completion/template-names.ts`) already lists scope:bundle template names (built-in +
project-local), the SAME source `bundle new --template` uses. `bundle template show` has no positional/option → no
completion entry. [Source: `src/completion/template-names.ts` `bundleTemplateNames`; the `bundle new --template`
COMPLETION_SPECS entry.]

> The completion path key is `"bundle template set"`. Verify the dispatch keys completion specs by the full
> command path (it does — e.g. `"bundle new"`, `"project targets add"` are multi-token keys in COMPLETION_SPECS).
> `bundle template` is a fixed verb (NOT per-bundle), so it goes through the MAIN program's completion (COMPLETION
> _SPECS), NOT PER_BUNDLE_COMPLETION_SPECS.

## TASKS / SUBTASKS

- [ ] **T1 (AC55#1/#2/#3/#4)** — the `template` subgroup + `show` leaf in `bundleModule`; the `formatBundleTemplate`
  shell formatter (header + optional template.yml metadata + tree); the absent-dir `NotFoundError`; `withExamples`.
- [ ] **T2 (AC56#1/#2/#3/#4)** — the `set` leaf: `resolveTemplate(name,"bundle",…)` → not-found/wrong-scope typed
  error (exit 1, nothing changed) → clear (`fs.remove`) + copy-verbatim (`fs.write` per `template.files`);
  `withExamples`; `"bundle template set": { args: ["bundle-template-names"] }` in `COMPLETION_SPECS`.
- [ ] **T3 (tests)** — in-process unit AC tests (memory ports) for both (AC55#1-4, AC56#1-4); real-binary E2E
  appended to `test/integration/cli.bundle-remove-list.e2e.test.ts` (or a new `cli.bundle-template.e2e.test.ts`):
  `set default` populates `bundles/bundle-template/` from the built-in `default` files tree; `show` then prints the
  tree; `show` on a fresh project (no dir) exits 1; `set bogus` (unresolved) + `set <a-project-template>`
  (wrong-scope) exit 1 changing nothing.
- [ ] **T4 (DoD)** — tsc clean, biome clean (incl core-boundary), all green; public fns documented; no dead code.

## Dev Notes

### Files to CREATE
- `test/unit/cli/bundle-template-commands.test.ts` — the in-process AC tests (memory ports).
- E2E: append a `describe` to `test/integration/cli.bundle-remove-list.e2e.test.ts`, OR a new
  `test/integration/cli.bundle-template.e2e.test.ts` — match the repo's per-family E2E layout (a dedicated file is
  cleaner since the family is distinct; either is fine).
- (NO new `src/core/operations/*.ts` — see B2.)

### Files to UPDATE (read first — current state / changes / preserve)
- `src/cli.ts` — `bundleModule` gains the `template` subgroup with `show` + `set` leaves; add the
  `formatBundleTemplate` + a `dirFileTree`-style shell helper (or generalise `bundleFileTree`); `COMPLETION_SPECS`
  gains `"bundle template set"`. PRESERVE: the existing `templateModule` (the TOP-LEVEL `template list`/`show`
  group — DISTINCT from `bundle template`; do not confuse them), `bundleFileTree`, `formatTemplateShow`,
  `resolveTemplate` usage, `requireProject`. The existing top-level `template` group is the formatting model — REUSE
  `formatTemplateShow`'s shape for the metadata block, but `bundle template show` reads a DIRECTORY, not a resolved
  registry template, so its metadata is the dir's (usually just the tree).

### Current state of the key UPDATE files (analysed)
- `src/cli.ts` `bundleModule` (~1472): registers the fixed verbs on the `bundle` group; `remove`/`list` were just
  added (G2). `template` slots in identically as a `.command("template")` SUBGROUP with `show`/`set` leaves.
- `src/cli.ts` `templateModule` (~1838): the TOP-LEVEL `wpm template list`/`wpm template show <name>` group — a
  SEPARATE command tree (project-AWARE, falls back to built-ins; reads the REGISTRY via `resolveTemplate`/
  `listTemplates`). `bundle template` is NOT this — it reads/writes the project's `bundles/bundle-template/` dir.
  `formatTemplateShow` (renders a resolved `Template`'s metadata + files) is the shape to echo for the metadata
  block, but `bundle template show` is dir-based. PRESERVE `templateModule` untouched.
- `src/cli.ts` `bundleFileTree(fs, root, id)` (~295): the recursive relative-path tree walk for `bundle <id> show`.
  GENERALISE to a `dirFileTree(fs, baseDir)` (or copy the recursion) for `bundle template show`'s tree.
- `src/core/services/template-resolver.ts` `resolveTemplate(name, scope, deps)`: returns
  `{found:true, template}` (with `template.scope` + `template.files: {path,content}[]`) or `{found:false, …,
  searched}`. The `bundle/` scope dir is the only place a `bundle` resolution looks, so a project-scope name is
  not-found there (delivering AC56#2's wrong-scope as a not-found). PRESERVE — REUSE as-is.
- `src/core/operations/init-project.ts` (~107): the established "write each template file via `fs.write`" pattern
  `set` mirrors (minus substitution — `set` writes verbatim). `createBundleSpec` (~234) uses `renderTree` THEN
  `fs.write`; `set` writes raw `file.content` (no params) because the scaffold keeps its `{{placeholders}}`.
- `src/core/ports/filesystem.ts` — `remove` (recursive, no-op-if-absent), `write` (atomic, makes parents), `list`,
  `exists`, `read`, `copyTree` (merge-into — hence clear-first for a true replace). ALL present. No additions.

### Testing standards summary
- vitest two projects (`unit` parallel in-memory; `integration` serial). RUN ONE vitest at a time.
- In-process unit fixture: mirror `bundle-lifecycle-commands.test.ts`/`template-commands.test.ts` — seed a `/proj`
  manifest + the built-in `bundle/default` template (`template.yml` + a `files/` tree with a couple of files) so
  `resolveTemplate(name,"bundle",…)` resolves; assert `set` writes the files into `bundles/bundle-template/`,
  `show` prints them, the absent-dir/unresolved/wrong-scope paths exit 1 unchanged. For wrong-scope, seed a
  `project/minimal` template and assert `bundle template set minimal` exits 1 (it is not found under `bundle/`).
- E2E: `set default` then `show`, against the real built-in `templates/bundle/default` shipped in `dist/`. The
  built-in `default` files/ tree includes `AGENTS.md.tmpl`, `install-backlog/`, `payload/`, etc. — assert
  `bundles/bundle-template/AGENTS.md.tmpl` exists after `set` and `show`'s tree lists it.

### Project structure notes
- `bundle template` is a FIXED `bundle` subgroup (in `bundleModule`), NOT a per-bundle module — it does not touch
  `PER_BUNDLE_MODULES`/`buildPerBundleProgram`.
- The core import-boundary: H adds NO core operation file (the only core touch is REUSING `resolveTemplate`); the
  fs effects live in the `cli.ts` shell. No boundary risk.

### References
- [Source: docs/10 §Per-command actions rows 155 (`bundle template show`) + 156 (`bundle template set <name>`);
  line 150 step 2 (`bundle new`'s "default: project's `bundles/bundle-template/`").]
- [Source: docs/12 line 268-270 + line 174-175 — built-in templates are static dir trees + a small `template.yml`;
  a bundle template is `template.yml` (scope:bundle) + `files/`; the resolver reads `template.yml` for params and
  walks `files/`.]
- [Source: docs/13 §1 (purity), §3 (ports + output-not-a-port), §7 (error model → exit codes).]
- [Source: src/cli.ts `bundleModule`/`templateModule`/`bundleFileTree`/`formatTemplateShow`/`COMPLETION_SPECS`;
  src/core/services/template-resolver.ts `resolveTemplate`; src/core/operations/init-project.ts (the write-each-
  file pattern); src/core/ports/filesystem.ts; src/completion/template-names.ts `bundleTemplateNames`.]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (1M context) — BMAD build worker.

### Completion Notes List
- RECORD: the `bundles/bundle-template/` (project scaffold, no template.yml) vs `templates/bundle/<name>/`
  (registry template, has template.yml) distinction and how `show`/`set` each treat it.
- RECORD: `show`'s absent-dir behaviour (NotFoundError exit 1, since `init` ships no bundles/) and that `set`
  creates the dir.
- RECORD: `set` writes the resolved `template.files` VERBATIM (no `{{placeholder}}` substitution) after a
  `fs.remove` (clear-then-copy, because `copyTree` merges); the resolve+scope-check happen BEFORE any write
  (AC56#2 "changing nothing").
- RECORD: that `set` is a direct shell effect (NOT `runMutation`) and why (no manifest/bundle state, no rerender).
- RECORD: the pre-existing `bundle new` ↔ `bundles/bundle-template/` divergence (flagged, out of H scope).
- RECORD: per-AC evidence (each of 55#1-4, 56#1-4 → a test or a real-binary command+output).

### File List
(to be filled by dev-story)
