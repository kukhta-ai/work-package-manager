# Story cli-bundle-skills — `bundle <id> skills add` / `list` / `remove` (tasks 74 + 75 + 76)

Status: ready-for-dev

> BMAD create-story output (skill-driven; BMAD sprint-status/epics auto-discovery suppressed — the real contract
> is the Backlog.md backlog tasks 74/75/76, read via `backlog task <id> --plain`, NOT the foundation-epic-1
> `epics.md`/`sprint-status.yaml`; the orchestrator owns sprint status and forbids touching it). Steered from doc
> 10 rows 170–172 + doc 10 line 32 (the structure-not-content "scaffold-or-attach" principle), doc 11 §3
> "Materialised by the skill-adding commands (scaffold branch only)" + line 63, doc 06 lines 74/76/101/117/129
> + 153 (payload skills: `payload/agent-skills/<name>/SKILL.md`, namespaced, RUNTIME-trigger, inert until
> install, NEVER a bare `skills/`), doc 13 §1/§5/§7/§8 (purity / lifecycle / error model).
>
> This is **per-bundle family O** in the CLI epic-2, and it is the FIRST family that is NOT a pure descriptor
> reuse: it **ESTABLISHES the reusable skill scaffold-or-attach core** that two later families reuse — P
> (`bundle <id> installer-skills`, tasks 77–79) and F (`project installer-skills`, tasks 45–47). So the design
> mandate is: build a **descriptor-parameterised skill-reference core** (analogous to `PayloadRefDescriptor`),
> not a one-off `skills` module. P and F must each become *one descriptor + one module (+ the model/schema
> registry field + their list-source)*.

## Acceptance criteria (verbatim from the backlog — read via `backlog task <id> --plain`)

### TASK-74 — `bundle <id> skills add <name> [--path <path>]` (a MUTATION; doc-10 row 170)
1. When a SKILL.md exists at the resolved path (default `payload/agent-skills/<name>/SKILL.md`) or the `--path`
   location, its frontmatter is validated and the reference is registered.
2. When none exists and no `--path` is given, a payload-skill stub with frontmatter plus a placeholder
   runtime-trigger description and no invented prose is rendered at the conventional path, a write-payload-skill
   task is materialised, and the reference is registered.
3. When `--path` is given but nothing exists there, the command fails with a typed error.
4. The command prints what it did (attached, or scaffolded with the materialised task id).
5. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id completes from enabled bundles.
6. Help output is substantive (description, synopsis, the name positional and `--path`, an example); on success
   exits 0.

### TASK-75 — `bundle <id> skills list` (a READ; doc-10 row 171)
1. The command enumerates the registered payload skills for the bundle.
2. The command reads and reports only, with no change on disk, and exits 0 on success.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id completes from enabled bundles.
4. Help output is substantive (description, synopsis, an example).

### TASK-76 — `bundle <id> skills remove <name>` (a MUTATION; doc-10 row 172)
1. The named payload skill is deregistered and the command prints that the SKILL.md was left at
   `payload/agent-skills/<name>/` for the author to delete deliberately.
2. The file content is left untouched on disk: deregister, not delete.
3. Deregistering a name that is not registered fails with a typed not-found error and a non-zero exit.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the name completes from registered payload skills.
5. Help output is substantive (description, synopsis, the name positional, an example); on success exits 0.

## doc-10 contract (cite the rows)

> `bundle <id> skills add <name> [--path <path>]` (row 170): "1. Resolve target: `--path` if given, else
> `bundles/<id>/payload/agent-skills/<name>/SKILL.md`. 2. **If a SKILL.md exists there (attach):** validate
> frontmatter; register the reference. 3. **If none exists and no `--path` (scaffold):** **Template-driven**
> render a payload-skill stub at the conventional path (frontmatter `name: <name>` + placeholder runtime-trigger
> description); **Task-driven** materialise 'Write payload skill `<name>` for `<id>`'; register. 4. **If `--path`
> given but nothing exists there:** error. 5. Print what it did (attached, or scaffolded + task id)."
> [Source: docs/10 §Per-command actions row 170; also §command tree line 109–110: "`skills add|list|remove
> <name>` — payload/agent-skills/ — the RUNTIME products; `[--path <path>]` default
> `payload/agent-skills/<name>/SKILL.md`; agent authors the SKILL.md; CLI verifies + registers".]

> `bundle <id> skills list` (row 171): "Enumerate registered payload skills." [Source: docs/10 row 171.]

> `bundle <id> skills remove <name>` (row 172): "Deregister; print 'deregistered; SKILL.md left at
> `payload/agent-skills/<name>/` — delete it yourself if you meant to'." [Source: docs/10 row 172.]

> The governing PRINCIPLE (doc 10 line 32): "the skill-adding commands share one verb, `add`, with a uniform
> meaning: *attach the skill if the author already wrote it, otherwise scaffold a stub and queue the writing* —
> never silently author a finished skill." And line 25 "Structure, not content": the CLI "manages structure …
> the registered references to payload files and skills … the SKILL.md bodies … written by the agent directly
> via the filesystem; the CLI's role is to register, list, and validate what the agent placed." Auto-rerender:
> per-bundle mutations "carry this implicit re-render." [docs/10 line 34.]

> doc-11 §3 "Materialised by the skill-adding commands (scaffold branch only)" + line 93: when `skills add` is
> invoked for a skill that doesn't exist yet, it "renders a stub and materialises the matching content task. (When
> the skill already exists, the command attaches it and materialises nothing.)" The task is **"Write payload
> skill `<name>` for `<id>`"** — AC: "the stub's placeholder runtime-trigger description and body are replaced
> with real content (triggers on the bundle's runtime use, per `05`)." [Source: docs/11 §3 + line 93.]

> doc-06 — what a payload skill IS: line 74 "`agent-skills/` → agent scope: PAYLOAD skills (the runtime
> product). Plain, NON-scanned name; inert until install copies them into the agent's scope … Namespaced;
> descriptions written for RUNTIME triggers, not install"; line 101 "payload skills … become live only when the
> install copies them into the agent's scanned scope — that relocation *is* the product landing"; line 117
> "payload skills never enter a scanned scope at any level"; line 153 (HARD) "payload skills stay nested at
> `<bundle>/payload/agent-skills/` (a name chosen so it can't match any scanned-scope convention; in particular
> never a bare `skills/`)". [Source: docs/06 lines 74/101/117/153.]

## The REGISTRY-SHAPE DECISION (record this — the central design choice for O)

**`payload.skills` is a list of `{ name, path }` objects** (NOT bare name strings), where `name` is the skill's
registered name and `path` is the **bundle-relative path to its `SKILL.md`** (default
`payload/agent-skills/<name>/SKILL.md`, or the `--path` value when the author relocated it). Grounded in doc-10:

1. **`--path` can relocate the SKILL.md** (row 170 step 1). If the registry stored only the name, `list` and the
   downstream "Verify skill registration" task (doc-11 line 68: "every payload skill registered via `bundle
   <id> skills add` … has its SKILL.md present at the expected path with valid frontmatter") could not LOCATE a
   skill whose SKILL.md lives somewhere other than the conventional path. The registry must carry **enough to
   re-find each SKILL.md**, so it stores the resolved bundle-relative path.
2. **`list` enumerates the REGISTERED skills** (74#2 registers either way; 75#1 enumerates the registered set).
   Payload skills are **inert until install** (doc-06:101) — there is no reliable on-disk scan that distinguishes
   "a registered payload skill" from "some folder under `payload/agent-skills/`", and a `--path` skill may not be
   under that dir at all. So `list` is **registry-based** (reads `payload.skills`), unlike P/F's installer-skills
   `list`, which doc-10 rows 174/179 spec as a directory SCAN (see the design split below). Storing the name is
   what `list` prints; storing the path is what makes `list` able to show *where* and what makes validation able
   to find it.
3. **`remove <name>` deregisters by name** (row 172) — the name is the registry key the user types; the stored
   path tells `remove` which on-disk SKILL.md to NAME in the "left at …" message (it leaves the file). The
   remove message uses the **registered path's directory** so a `--path`-relocated skill reports its real
   location.

> This is a richer shape than L/M/N's bare-string `payload.{files,templates,scripts}` lists — justified because a
> skill is identified by a *name* (the registry key, the deregister key, the completion source for `remove`)
> AND located by a *path* (which `--path` can move off the conventional location). The bare-string payload-ref
> registry cannot serve both, so O introduces a structured `SkillRef = { name, path }`. P and F reuse this exact
> shape.

## The REUSABLE SKILL-REF CORE (the design mandate — build for P and F, not a one-off)

Create **`src/core/operations/skill-refs.ts`** — the descriptor-driven skill-reference operation core,
analogous to `payload-refs.ts`. It exposes a small `SkillRefDescriptor` plus the four operation specs (add,
list, remove) parameterised by it. **Do NOT inline the logic into a `skills`-only module.**

### `SkillRefDescriptor` — the seam P (77–79) and F (45–47) reuse
```ts
export interface SkillRefDescriptor {
  /** The bundle/project-relative ON-DISK directory skills of this category live under
   *  (`payload/agent-skills` for O; `installer-skills` for P; `installer-skills` at ROOT for F). */
  readonly onDiskDir: string;
  /** The `bundle.yml`/`manifest.yml` key path whose SEQUENCE holds the registry of `{name,path}` refs
   *  (e.g. `["payload", "skills"]` for O). */
  readonly registryPath: readonly string[];
  /** Project the registered `SkillRef[]` off the parsed bundle/project (e.g. `(b) => b.payload.skills`). */
  readonly select: (host: BundleManifest) => readonly SkillRef[];
  /** The template SNIPPET path the SCAFFOLD branch renders (relative within a project template's snippets/),
   *  e.g. `payload-skill.SKILL.md.tmpl` for O; `installer-skill.SKILL.md.tmpl` for P/F. */
  readonly snippetPath: string;
  /** The materialised authoring-task title TEMPLATE for the scaffold branch — `(name, hostId) => title`
   *  (O: "Write payload skill <name> for <id>"; P: "Write content for install-time skill <name> in <id>";
   *  F: "Write content for install-time skill <name>"). */
  readonly materialiseTitle: (name: string, hostId: string) => string;
  /** The materialised authoring-task AC TEMPLATE for the scaffold branch. */
  readonly materialiseAc: (name: string, hostId: string) => string;
  /** A human noun for messages (e.g. `payload skill`). */
  readonly noun: string;
}
```

> **Pluggable `list` for P/F (note for later, DO NOT build now):** doc-10 rows 174/179 spec P/F's `list` as a
> directory SCAN of the installer-skills dir (F additionally EXCLUDES the main `<project>-installer` skill),
> because installer-skills are union-scanned (doc-06). O's `list` is REGISTRY-based. So the `list` spec is the
> ONE piece that differs: keep O's `listSkillRefsSpec` registry-reading, and leave a clear seam (a comment +
> the descriptor's `onDiskDir`) so P/F can supply a scan-based list later. Everything else (the descriptor, the
> scaffold-or-attach-or-error add, the frontmatter validator, the deregister remove) is shared.

### The `PAYLOAD_SKILLS_DESCRIPTOR` (Family O's binding)
```ts
export const PAYLOAD_SKILLS_DESCRIPTOR: SkillRefDescriptor = {
  onDiskDir: "payload/agent-skills",
  registryPath: ["payload", "skills"],
  select: (host) => host.payload.skills,
  snippetPath: "payload-skill.SKILL.md.tmpl",
  materialiseTitle: (name, hostId) => `Write payload skill ${name} for ${hostId}`,
  materialiseAc: (name, _hostId) =>
    `the stub's placeholder runtime-trigger description and body are replaced with real content (triggers on the bundle's runtime use, per docs/05)`,
  noun: "payload skill",
};
```

### The conventional SKILL.md path
```ts
/** The conventional bundle-relative SKILL.md path for a skill in this category (no --path). */
function conventionalSkillPath(descriptor, name): string {
  return `${descriptor.onDiskDir}/${name}/SKILL.md`;   // e.g. payload/agent-skills/<name>/SKILL.md
}
```

### The THREE-WAY `add` (the heart of O)
`addSkillRefSpec(descriptor)` is an `OperationSpec`. The 3-way branch needs to KNOW whether a SKILL.md exists at
the resolved path — a disk probe — and the pure operation `check`/`apply` reach disk only through the injected
`fs` port in `apply` (the operation tier MAY take and call `fs` — see `advisor.ts`). So unlike payload-refs
(where the existence check is a pure no-port `check` pushed to the CLI), O's `add` does its branch in `apply`,
which has the `ApplyContext.fs`:

- **Resolve target path:** `--path` (bundle-relative, as given) if provided, else
  `conventionalSkillPath(descriptor, name)`.
- **ATTACH** — `fs.exists(join(root, "bundles", id, targetPath))` is true: READ the SKILL.md via `fs`,
  **validate its frontmatter** (`validateSkillFrontmatter` — must have `name` AND `description`, else a
  `ValidationError`), then register `{ name, path: targetPath }` in the registry (comment-preservingly, set-like
  on `name`). Write NO content. NO materialise.
- **SCAFFOLD** — the SKILL.md does NOT exist AND no `--path`: render the descriptor's snippet (via the
  generalised stub renderer below) to the conventional path (no-op if somehow present), then register
  `{ name, path: conventionalPath }`. The matching authoring task is added by ⑤ MATERIALISE.
- **ERROR** — `--path` was given but nothing exists there: throw a `NotFoundError` (74#3), registering nothing.
  The pure `check` cannot see disk, so this throw is in `apply` too (before any write) — a `DomainError` from
  `apply` still aborts the mutation cleanly (the harness has done LOAD + CHECK; APPLY throwing means no
  RERENDER/MATERIALISE/RESULT, exactly like a `check` throw — verify the harness behaviour and the test).

> **`materialise` is CONDITIONAL on the SCAFFOLD branch only** (doc-11 line 91: attach materialises nothing). The
> `OperationSpec.materialise(project, input)` runs AFTER apply on the RELOADED project. It must re-derive
> "did we scaffold?" from observable post-apply state: the skill is registered either way, so `materialise`
> recomputes the SAME target-resolution + existence logic the apply used — but post-apply the file EXISTS in
> both branches (scaffold wrote it; attach found it). So **the branch decision must be threaded from apply to
> materialise**, not recomputed from disk. TWO clean options — pick and record:
>   (a) Make `add` a CLI-orchestrated pair: the CLI does the existence probe (it owns fs), decides
>       attach/scaffold/error, and calls the RIGHT spec (an attach spec with no materialise, or a scaffold spec
>       WITH materialise). This mirrors payload-refs (existence check in the CLI). **PREFERRED** — it keeps each
>       spec single-purpose and the materialise unconditional-per-spec, and it's the established pattern.
>   (b) Keep one spec and have `materialise` re-resolve `--path`-given-but-conventional-absent-before-apply…
>       which is unknowable post-apply. REJECTED (can't reconstruct the pre-apply branch).
> **Decision: (a).** The CLI shell (which owns the `fs` port) resolves the target path, probes existence, and
> dispatches: ATTACH → `attachSkillRefSpec` (validate-in-apply + register, NO materialise); SCAFFOLD →
> `scaffoldSkillRefSpec` (render stub + register, WITH materialise); ERROR (`--path` + absent) → throw
> `NotFoundError` in the CLI BEFORE `runMutation` (like payload-refs' add existence check), registering nothing.
> This makes the CORE specs single-purpose and reusable, and the 3-way decision a thin CLI branch P/F copy.
> Frontmatter validation stays in the CORE attach spec's apply (it reads the file via fs and validates), so the
> validation rule is shared, not re-implemented per family.

### The GENERALISED stub renderer (generalise `scaffoldAdvisor`)
`advisor.ts`'s `scaffoldAdvisor` already does exactly "resolve project template → find snippet by path →
`renderSnippet` with substitutions → write via fs, no-op if exists". **Extract its body into a reusable helper**
so O (and P/F) render their own snippet:
```ts
// src/core/operations/scaffold-skill.ts  (or a shared render-stub helper)
export function renderSkillStub(
  deps: { builtinTemplatesRoot: string; projectTemplateName?: string },
  fs: FileSystem,
  root: string,            // project root
  stubRelPath: string,     // project-relative path to write the SKILL.md
  snippetPath: string,     // the snippet within the project template's snippets/
  substitutions: ReadonlyMap<string, string>,
): string[] { /* resolve template (project-local shadows built-in) → find snippet → render → write; [] if exists */ }
```
Then refactor `scaffoldAdvisor` to call it (with `advisor.SKILL.md.tmpl` + `{{bundle-id}}`), proving the
generalisation (advisor's existing tests must stay green). O calls it with the descriptor's `snippetPath`
(`payload-skill.SKILL.md.tmpl`) and the substitution map the snippet needs.

> **THE SNIPPET'S SUBSTITUTION VARIABLE — verify on disk:**
> `templates/project/minimal/snippets/payload-skill.SKILL.md.tmpl` uses **`{{skill-name}}` ONLY** (it does NOT
> reference `{{bundle-id}}`). The render service THROWS on an unresolved `{{...}}` but IGNORES unused params, so
> pass `new Map([["skill-name", name], ["bundle-id", id]])` (skill-name is the one the snippet consumes;
> bundle-id is harmless and future-proofs P/F snippets that may want it). DO NOT author or alter the snippet — it
> already exists (task-30 shipped it). The scaffolded stub is the conventional path
> `payload/agent-skills/<name>/SKILL.md`.

### The frontmatter validator (a small PURE helper)
**`src/core/services/frontmatter.ts`** (a service — pure, over data, no fs):
```ts
/** Extract the leading `---`-delimited YAML frontmatter block of a SKILL.md and parse it; validate that `name`
 *  and `description` are present non-empty. Returns the parsed head, or throws ValidationError naming what's
 *  missing. Pure: string in, parsed/validated out — the FILE READ is done by the operation through the fs port. */
export function validateSkillFrontmatter(skillMd: string, where: string): { name: string; description: string };
```
- Match the first `---\n … \n---` block at the START of the file (allow a leading BOM/whitespace? keep it
  strict: the block must be the very first content, per doc-05 "the block must be the very first content, fenced
  by `---`"). No frontmatter ⇒ `ValidationError` ("SKILL.md at `<where>` has no `---`-delimited frontmatter").
- Parse the captured YAML via `src/util/yaml.ts` `parseYaml`.
- Require `name` (string, non-empty) and `description` (string, non-empty) — else a `ValidationError` naming the
  missing/empty field and `<where>` (the SKILL.md path).
- It imports ONLY `src/util/yaml.js` + the errors — pure, no fs/commander/execa. (The yaml leaf is allowed in
  services; `payload-refs`/`bundle-meta` already use `editYaml` from there.)

> **Why a ValidationError (exit 1), not UsageError:** doc-13 §7 maps "schema / kebab / reserved-word failure" to
> ValidationError = exit 1. A SKILL.md with broken frontmatter is a content/schema defect, not a bad CLI
> argument. The author placed a malformed file; the typed exit-1 error tells them what to fix. (74#1 says
> "frontmatter is validated"; a failure is the negative outcome — typed error, non-zero exit.)

### `list` (registry-based) and `remove` (deregister)
```ts
export function listSkillRefsSpec(descriptor): ReadSpec<{id}, readonly SkillRef[]>   // project descriptor.select(host)
export function removeSkillRefSpec(descriptor): OperationSpec<{id, name}>            // CHECK name registered (else NotFound);
                                                                                    // APPLY delete that entry by index; NO file delete
```
- `list`: `runRead`, projects the registered `SkillRef[]`; the CLI prints `name` per line (or `(no payload
  skills)`). Read-only (75#2). NO materialise.
- `remove`: ② CHECK the `name` IS registered (else `NotFoundError` — 76#3, nothing changed). ③ APPLY deletes
  that registry entry by index, comment-preservingly; NEVER touches the on-disk SKILL.md (76#2). The summary is
  "deregistered; SKILL.md left at `payload/agent-skills/<name>/` — delete it yourself if you meant to" (76#1) —
  built from the **registered ref's path directory** (so a `--path`-relocated skill names its real dir). NO
  materialise.

## PART 1 — THE MODEL + SCHEMA EXTENSION (add the `skills` category as `SkillRef[]`)

### `src/core/model/skill.ts` (NEW) or add to `bundle.ts` — the `SkillRef` type
```ts
/** One registered payload skill: its name (the registry key + deregister key) and the bundle-relative path to
 *  its SKILL.md (the conventional payload/agent-skills/<name>/SKILL.md, or the --path location). The path is
 *  carried so `list`/validation can LOCATE a skill whose SKILL.md was relocated via --path. */
export interface SkillRef {
  readonly name: string;
  readonly path: string;   // bundle-relative path to SKILL.md
}
```
Export it from `src/core/model/index.ts`.

### `src/core/model/bundle.ts` — add `skills` to `BundlePayload`
```ts
export interface BundlePayload {
  readonly files: readonly string[];
  readonly templates: readonly string[];
  readonly scripts: readonly string[];
  /** Registered payload skills (doc 10 row 170): the delivered runtime products. Each is a {name,path} ref —
   *  the path locates the SKILL.md (conventional payload/agent-skills/<name>/SKILL.md, or a --path location).
   *  Absent in bundle.yml ⇒ empty. Payload skills are inert until install copies them into a scanned scope
   *  (doc 06), so this registry — not a directory scan — is the authoritative list. */
  readonly skills: readonly SkillRef[];
}
```

### `src/core/services/schema/bundle.ts` — round-trip `payload.skills` (absent ⇒ empty)
- Extend `BundleManifestData.payload` to add `readonly skills: readonly { name: string; path: string }[]`.
- Add a `parseSkillRefs(raw, ctx)` helper (NOT `parsePayloadCategory`, which is string-list-only): when absent ⇒
  `[]`; present ⇒ must be a list of mappings each with string `name` AND string `path` (else a field-precise
  `ValidationProblem` naming `payload.skills[i].name`/`.path`). Wire it into `parsePayload`:
  ```ts
  const skills = parseSkillRefs(raw.skills, ctx);
  if (!skills.ok) return skills;
  return ok({ files: files.value, templates: templates.value, scripts: scripts.value, skills: skills.value });
  ```
  and extend the `raw === undefined` short-circuit to `{ files: [], templates: [], scripts: [], skills: [] }`.
- In `serializeBundleManifest`, emit `skills: bundle.payload.skills.map(s => ({ name: s.name, path: s.path }))`.

> **Compatibility (HARD, as for L/M/N):** an OLD `bundle.yml` with NO `payload:`, or a partial one (only
> files/templates/scripts), MUST still parse — `skills` becomes `[]`. The parser is on the LOAD path for EVERY
> command; a regression here breaks every `bundle <id> …`. Schema unit tests: absent ⇒ skills `[]`;
> files+templates+scripts-only ⇒ skills `[]`; populated `skills: [{name,path}]` round-trips; a skills entry
> missing `name` or `path`, or not a mapping → rejected naming `payload.skills`.

### `src/core/operations/create-bundle.ts` — init `skills: []`
Extend the `manifest: BundleManifest` payload literal to `payload: { files: [], templates: [], scripts: [],
skills: [] }` so a fresh `bundle.yml` carries `payload:\n  files: []\n  templates: []\n  scripts: []\n
skills: []`.

> NOTE: the `default` bundle template ALREADY ships a sample skill on disk at
> `payload/agent-skills/<id>-skill/SKILL.md` (rendered from `{{bundle-id}}-skill/SKILL.md.tmpl`, with valid
> `name`+`description` frontmatter). createBundle does NOT auto-register it — it ships UNregistered, so
> `skills add <id>-skill` on a fresh bundle exercises the ATTACH branch (a real on-disk SKILL.md to validate +
> register), and `skills add brand-new` exercises SCAFFOLD. Test BOTH on the real binary.

## PART 2 — THE SKILL-REF CORE (`src/core/operations/skill-refs.ts`, NEW) + the generalised stub renderer + the validator

As detailed above:
- `SkillRefDescriptor` + `PAYLOAD_SKILLS_DESCRIPTOR`.
- `attachSkillRefSpec(descriptor)` — `OperationSpec<{id,name,path}>`: CHECK host enabled; APPLY read SKILL.md at
  `path` via fs → `validateSkillFrontmatter` → register `{name,path}` (set-like on name). NO materialise.
- `scaffoldSkillRefSpec(descriptor, deps)` — `OperationSpec<{id,name}>`: CHECK host enabled; APPLY render the
  stub via `renderSkillStub` to the conventional path + register `{name, path: conventionalPath}`. WITH
  `materialise` → one `AuthoringTaskSpec` from `descriptor.materialiseTitle/Ac`.
- `listSkillRefsSpec(descriptor)` — `ReadSpec`.
- `removeSkillRefSpec(descriptor)` — `OperationSpec<{id,name}>`: CHECK name registered (else NotFound); APPLY
  delete by index; NO file delete; summary "left at <dir> — delete it yourself".
- `src/core/operations/scaffold-skill.ts` (or fold into skill-refs) — `renderSkillStub` (generalised from
  `scaffoldAdvisor`), and refactor `advisor.ts` to use it.
- `src/core/services/frontmatter.ts` — `validateSkillFrontmatter`.

All under `src/core/` ⇒ the import-boundary rule applies: import only model/services/ports/errors/`node:path` +
the yaml leaf — NEVER `node:fs`/`commander`/`execa`. (`core-boundary.test.ts` + Biome `noRestrictedImports`
enforce it.)

## PART 3 — THE CLI MODULE (`src/cli.ts`, add ONE `bundleSkillsModule`)

Model it on `bundleFilesModule`, but `add` is the 3-WAY CLI branch (the existence probe + dispatch, decision (a)
above). The host `<id>` is already resolved + enabled-guarded by the per-bundle routing and threaded in.

```ts
const bundleSkillsModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const skills = sub
      .command("skills")
      .description("register or inspect this bundle's payload/agent-skills (the delivered runtime products) (doc 10)");

    // ── skills add <name> [--path <path>] ───────────────────────────────────────────────────────────────────
    const addLeaf = skills
      .command("add")
      .argument("<name>", "the payload skill's name (its SKILL.md folder under payload/agent-skills/<name>/)")
      .option("--path <path>", "attach an existing SKILL.md at this bundle-relative path instead of the conventional location")
      .description("attach an existing payload skill, or scaffold a stub + queue its writing if none exists (doc 10)")
      .action((name: string, opts: { path?: string }) => {
        const conventional = `${PAYLOAD_SKILLS_DESCRIPTOR.onDiskDir}/${name}/SKILL.md`;
        const targetRel = opts.path ?? conventional;          // bundle-relative
        const exists = ctx.deps.fs.exists(join(root, "bundles", id, targetRel));
        if (opts.path !== undefined && !exists) {
          // 74#3: --path given but nothing there → typed error, register nothing.
          throw new NotFoundError(
            `no SKILL.md at bundles/${id}/${opts.path} — omit --path to scaffold a stub at ${conventional}, or place the file first`,
          );
        }
        const result = exists
          ? runMutation(lifecycleDepsFor(ctx, root), { root }, attachSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR), { id, name, path: targetRel })
          : runMutation(lifecycleDepsFor(ctx, root), { root },
              scaffoldSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR, { builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot }),
              { id, name });
        ctx.io.out.write(formatResult(result));       // 74#4: summary says attached / scaffolded; formatResult adds materialised: N
      });
    withExamples(addLeaf, [
      { command: "wpm bundle web-handoff skills add handoff-web", note: "attach the SKILL.md the agent placed, or scaffold a stub + queue writing" },
      { command: "wpm bundle web-handoff skills add handoff-web --path payload/agent-skills/handoff-web/SKILL.md", note: "attach an existing SKILL.md at an explicit path" },
    ]);

    // ── skills list ─────────────────────────────────────────────────────────────────────────────────────────
    const listLeaf = skills.command("list").description("list this bundle's registered payload skills (doc 10)")
      .action(() => {
        const { value } = runRead(ctx.deps.fs, { root }, listSkillRefsSpec(PAYLOAD_SKILLS_DESCRIPTOR), { id });
        ctx.io.out.write(formatSkillList(value));    // names, one per line, or "(no payload skills)"
      });
    withExamples(listLeaf, [{ command: `wpm bundle ${id} skills list`, note: "list registered payload skills" }]);

    // ── skills remove <name> ────────────────────────────────────────────────────────────────────────────────
    const removeLeaf = skills.command("remove")
      .argument("<name>", "the registered payload skill to deregister (the SKILL.md is left on disk)")
      .description("deregister a payload skill, leaving its SKILL.md on disk (doc 10)")
      .action((name: string) => {
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, removeSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR), { id, name });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [{ command: "wpm bundle web-handoff skills remove handoff-web", note: "deregister handoff-web (its SKILL.md stays on disk)" }]);
  },
};
```
Append `bundleSkillsModule` to `PER_BUNDLE_MODULES` (after `bundleScriptsModule`). Add a `formatSkillList(refs)`
helper (`refs.length === 0 ? "(no payload skills)\n" : refs.map(r => r.name).join("\n") + "\n"`). Import the new
core specs + `PAYLOAD_SKILLS_DESCRIPTOR` from `./core/operations/skill-refs.js`.

## PART 4 — COMPLETION (`PER_BUNDLE_COMPLETION_SPECS` + a new registered source)

- 74#5/75#3/76#4 id completion is already provided by the `bundle` spec (`bundle-ids`) — the routing.
- `skills add <name>` — a NEW name → **no completion** (like `bundle new <id>`); BUT the brief notes the on-disk
  skill dirs under `payload/agent-skills/` are a reasonable source for the ATTACH case. Provide a
  `skills-on-disk` source = the immediate SUBDIRECTORY names under `bundles/<id>/payload/agent-skills/` (each is
  a candidate skill name to attach). This is the same id-aware `resolveContext`+walk shape as
  `payloadOnDiskSource`, but it lists DIR names (skill folders), not files — so a small NEW source
  `skillNamesOnDisk` (or generalise: a "subdir names under <dir>" source). `skills add` → `["skills-on-disk"]`.
- `skills remove <name>` — completes from the REGISTERED skills' NAMES: a NEW `skills-registered` source reading
  `payload.skills.map(s => s.name)` for the host id (the id-aware `resolveContext`+`parseBundleManifest` shape of
  `payloadRegisteredSource`, projecting `name`). `skills remove` → `["skills-registered"]`.
- Register both in `defaultRegistry()`. Add to `PER_BUNDLE_COMPLETION_SPECS`:
  ```ts
  "skills add": { args: ["skills-on-disk"] },
  "skills remove": { args: ["skills-registered"] },
  ```

> The `--path` option needs no value completion (a free path); the named-positional completions cover 74#5/76#4.

## PART 5 — TEST PLAN (unit in-process + real-binary E2E; every AC mapped)

### Frontmatter validator unit (`test/unit/services/frontmatter.test.ts`, NEW)
- valid `---\nname: x\ndescription: y\n---\nbody` → `{name:"x", description:"y"}`.
- no frontmatter (body only) → ValidationError naming "no frontmatter".
- frontmatter missing `name` → ValidationError naming `name`; missing `description` → naming `description`;
  empty `name`/`description` → rejected.
- frontmatter not at the very start (text before `---`) → rejected (the block must be first, doc-05).
- extra keys present (version/license) → still valid (only name+description required).

### Stub renderer unit (extend `test/unit/operations/advisor.test.ts` or NEW `scaffold-skill.test.ts`)
- `renderSkillStub` writes the snippet rendered with substitutions to the given rel path; no-op (returns []) when
  the file already exists; throws NotFound when the project template/snippet is missing.
- advisor's EXISTING tests stay green after the refactor (proves the generalisation preserved behaviour).

### Schema unit (`test/unit/schema/bundle.test.ts`, EXTEND the payload block)
- absent `payload` ⇒ `payload.skills` is `[]` (alongside files/templates/scripts empty).
- a `payload` with files+templates+scripts only ⇒ `payload.skills` is `[]`.
- a populated `payload: { skills: [{name:"a",path:"payload/agent-skills/a/SKILL.md"}] }` round-trips.
- `serialize` always emits `payload.skills` (empty ⇒ `[]`) — update the "serialize always emits" assertion.
- malformed: `skills` not a list / an entry not a mapping / an entry missing `name` or `path` → rejected naming
  `payload.skills`.

### Skill-ref core unit (`test/unit/operations/skill-refs.test.ts`, NEW — in-memory fs + fake backlog)
- **attach**: place a valid SKILL.md at the conventional path; `attachSkillRefSpec` → `payload.skills` gains
  `{name, path: payload/agent-skills/<name>/SKILL.md}`; the file bytes UNCHANGED; NO task materialised.
- **attach via --path**: place a SKILL.md at a non-conventional bundle-relative path; attach registers
  `{name, path: <that path>}`.
- **attach invalid frontmatter**: place a SKILL.md with NO `description`; `attachSkillRefSpec` → ValidationError;
  registry UNCHANGED.
- **attach idempotent**: attach the same name twice → registry has ONE entry (set-like on name).
- **scaffold**: no SKILL.md, no --path; `scaffoldSkillRefSpec` → a stub rendered at the conventional path
  (frontmatter has `name: <name>` + the placeholder runtime-trigger description; NO invented prose — assert the
  body still contains the snippet's `TODO`/stub marker), `{name, conventionalPath}` registered, AND `materialise`
  returns the "Write payload skill <name> for <id>" spec (assert the fake backlog created it).
- **scaffold no-op-on-exists**: if the stub already exists, render is a no-op (still registers).
- **list**: registry-based projection → the registered refs (names + paths).
- **remove**: a registered name → gone from `payload.skills`; SUMMARY contains "left at
  payload/agent-skills/<name>/"; the on-disk SKILL.md STILL exists (deregister-not-delete).
- **remove --path-relocated**: a skill registered with a non-conventional path → remove's message names that
  path's DIRECTORY.
- **remove not-registered**: → NotFound; registry UNCHANGED.

### CLI unit (`test/unit/cli/bundle-skills-commands.test.ts`, NEW — mirror `bundle-files-commands.test.ts`)
Seed `/proj` with bundle `a` (comment + known key order, NO payload key). Init the authoring backlog + seed the
project template snippets (so the SCAFFOLD render + ④ RERENDER resolve). Place a valid sample SKILL.md under
`bundles/a/payload/agent-skills/sample/SKILL.md` for attach tests.
- **74#1 attach** — `skills add sample` (file present) → exit 0; `payload.skills` has `{name:sample, path:…}`;
  the file bytes UNCHANGED; comment + key order preserved; SUMMARY says "attached"/"registered"; NO `materialised:`
  line.
- **74#1 attach via --path** — place at `bundles/a/elsewhere/SKILL.md`; `skills add s2 --path elsewhere/SKILL.md`
  → registered with that path.
- **74#1 attach invalid frontmatter** — place a SKILL.md with no `description`; `skills add bad` → exit 1
  (ValidationError naming the field); bundle.yml byte-identical.
- **74#2 scaffold** — `skills add fresh` (no file, no --path) → exit 0; a stub at
  `bundles/a/payload/agent-skills/fresh/SKILL.md` (frontmatter `name: fresh` + placeholder runtime-trigger desc,
  NO invented prose — the snippet's stub markers present); `payload.skills` registered; an authoring task "Write
  payload skill fresh for a" materialised (assert via the fake/real backlog); SUMMARY + `materialised: 1`.
- **74#3 --path-but-missing** — `skills add ghost --path payload/agent-skills/ghost/SKILL.md` (nothing there) →
  exit 1 (typed NotFound naming the path); bundle.yml byte-identical; NO stub written.
- **74#4 prints what it did** — attach summary vs scaffold summary differ; scaffold mentions the task.
- **74#5 outside-project** — exit 1 naming `manifest.yml` + `init`; **id completes from enabled bundles**
  (`__complete bundle <tab>`).
- **74#6 help** — Usage + `<name>` + `--path` + Example.
- **75#1/#2 list** — register two (attach + scaffold) → exact stdout `<name1>\n<name2>\n`; manifest + bundle.yml
  unchanged after list (read-only).
- **75#1 empty** — list with none → `(no payload skills)`.
- **75#3 outside-project** — exit 1 naming `manifest.yml`; id completes.
- **75#4 help** — Usage + Example.
- **76#1 remove** — remove a registered skill → gone from `payload.skills`; SUMMARY contains "left at
  payload/agent-skills/<name>/"; exit 0.
- **76#2 file-left-on-disk** — after remove, the SKILL.md STILL exists with unchanged content.
- **76#3 not-registered** — `skills remove nope` → exit 1 (NotFound); bundle.yml unchanged.
- **76#4 outside-project** — exit 1 naming `manifest.yml`; **name completes from registered skills**
  (`__complete bundle a skills remove <tab>` → registered names).
- **76#5 help** — Usage + `<name>` + Example.
- **end-to-end in-process** — scaffold `fresh` → list (shows) → remove → list (`(no payload skills)`) + the
  stub file still on disk + the materialised task present + comment survives.
- **rerender** — after add, `${PROJ}/AGENTS.md` exists.
- **skills group help** — lists add/list/remove.
- **attach the default template's sample skill** — on a `bundle new`-created bundle, `skills add <id>-skill`
  ATTACHES the shipped sample (valid frontmatter) — registry gains it; NO scaffold, NO task.

### Real-binary E2E (append to `test/integration/cli.bundle-id.e2e.test.ts`, `describeIfBuilt`)
Through `dist/cli.js` + real `NodeFileSystem` tmpdir + real `backlog` (the materialise path MUST run, not skip).
A fresh `bundle new web` ships the sample `payload/agent-skills/web-skill/SKILL.md`.
- **attach (sample)** — `bundle web skills add web-skill` → exit 0; `bundles/web/bundle.yml` gains `payload:` …
  `skills:` … `- name: web-skill` / `  path: payload/agent-skills/web-skill/SKILL.md` (real eemeli/yaml
  round-trip); SUMMARY says attached; the sample SKILL.md content UNCHANGED; NO `materialised:` line.
- **scaffold (new name)** — `bundle web skills add fresh-skill` → exit 0; a stub at
  `bundles/web/payload/agent-skills/fresh-skill/SKILL.md` with frontmatter `name: fresh-skill` + the placeholder
  runtime-trigger description (assert the file exists + contains `name: fresh-skill` + a stub/TODO marker, and
  NOT invented prose); registered; **the authoring task "Write payload skill fresh-skill for web" materialised in
  `.authoring-backlog`** (assert via `backlog task list --plain` in `<proj>/.authoring-backlog`, or that the
  command stdout shows `materialised: 1` AND the task is listed). This is the loop-closure proof.
- **--path-but-missing error** — `bundle web skills add ghost --path payload/agent-skills/ghost/SKILL.md`
  (nothing there) → exit ≠ 0; bundle.yml unchanged; no stub written.
- **list (registry)** — after the two adds, `bundle web skills list` → stdout contains `web-skill` and
  `fresh-skill`; a fresh bundle prints `(no payload skills)`.
- **remove (deregister, file left)** — `bundle web skills remove web-skill` → exit 0; stdout contains "left at
  payload/agent-skills/web-skill/"; the entry gone from bundle.yml; the SKILL.md STILL on disk under
  `payload/agent-skills/web-skill/` (existsSync).
- **not-registered remove error** — `bundle web skills remove not-there` → exit ≠ 0; bundle.yml unchanged.
- **completion** — `__complete bundle web skills add` → lists the on-disk skill dir names (web-skill);
  `__complete bundle web skills remove` (after attach) → lists the registered names.
- **help** — `bundle web skills add --help` → contains `bundle web skills add`, `<name>`, `--path`, Example.
- **OLD-bundle.yml compat (real binary)** — a `bundle.yml` with NO `payload:` key still drives `skills list`
  (`(no payload skills)`) and `skills add` (adds the field) — absent ⇒ empty end-to-end.

---

## Dev Notes

### Files to ADD
- `src/core/model/skill.ts` — the `SkillRef` type (or add to `bundle.ts`); export from `model/index.ts`.
- `src/core/services/frontmatter.ts` — `validateSkillFrontmatter` (pure).
- `src/core/operations/skill-refs.ts` — `SkillRefDescriptor` + `PAYLOAD_SKILLS_DESCRIPTOR` + the four specs
  (attach/scaffold/list/remove), parameterised by the descriptor.
- `src/core/operations/scaffold-skill.ts` — `renderSkillStub` (generalised from `scaffoldAdvisor`); OR fold into
  `skill-refs.ts`/a shared render helper. (Keep it importable so advisor + P/F reuse it.)
- `src/completion/skills-on-disk.ts` + `src/completion/skills-registered.ts` — the two id-aware sources (or fold
  into existing completion files; prefer new files matching `payload-files-*` convention).
- `test/unit/services/frontmatter.test.ts`, `test/unit/operations/skill-refs.test.ts`,
  `test/unit/cli/bundle-skills-commands.test.ts` — the new suites.

### Files to CHANGE
- `src/core/model/bundle.ts` — add `skills: readonly SkillRef[]` to `BundlePayload` (+ JSDoc).
- `src/core/services/schema/bundle.ts` — `parseSkillRefs` helper + wire into `parsePayload` + the undefined
  short-circuit + `serializeBundleManifest` + `BundleManifestData.payload.skills`.
- `src/core/operations/create-bundle.ts` — init `payload: { files: [], templates: [], scripts: [], skills: [] }`.
- `src/core/operations/advisor.ts` — refactor `scaffoldAdvisor` to call the extracted `renderSkillStub` (proves
  the generalisation; behaviour unchanged).
- `src/cli.ts` — add `bundleSkillsModule`; append to `PER_BUNDLE_MODULES`; add `formatSkillList`; the two
  completion specs; import the new core specs + descriptor.
- `src/completion/registry.ts` — register `skills-on-disk` + `skills-registered`.
- `test/unit/schema/bundle.test.ts` — extend the payload block with the skills round-trip / absent / partial-⇒-
  empty / malformed cases (+ update the "serialize always emits" assertion to include `skills: []`).
- `test/integration/cli.bundle-id.e2e.test.ts` — append the skills real-binary E2E block + helpers
  (a `placeSkill(proj, bundle, name, content)` and a frontmatter-builder).
- **Test fixtures (every `BundleManifest`-typed literal)** — add `skills: []` beside
  `files: []`/`templates: []`/`scripts: []` in each `BundleManifest`-typed fixture. Per the M/N precedent these
  live in: `test/unit/model/aggregates.test.ts`, `test/unit/services/validate.test.ts`,
  `test/unit/services/validate.acceptance.test.ts`,
  `test/unit/services/version-constraint.acceptance.test.ts`, `test/unit/services/derived-artefacts.test.ts`,
  `test/unit/services/derived-artefacts.acceptance.test.ts`, `test/unit/operations/create-bundle.test.ts`.
  (Schema-test fixtures passing `payload` as untyped DATA into `parseBundleManifest` need NO change.) GREP for
  `scripts: []` to find every literal that also needs `skills: []`.

### Architecture constraints (doc 13 — HARD)
- **Core boundary**: `skill-refs.ts`, `scaffold-skill.ts`, `frontmatter.ts` stay PURE — import only
  model/services/ports/errors/`node:path`/the yaml leaf, NEVER `node:fs`/`commander`/`execa`. The
  operation tier MAY take + call the injected `fs` port (it orchestrates effects — `advisor.ts` precedent); what
  is forbidden is importing the concrete modules. The CLI shell owns the 3-way existence PROBE for `add`.
  (`core-boundary.test.ts` + Biome `noRestrictedImports` enforce this.)
- **Core is synchronous**; all actions sync.
- **Error model** (docs/13 §7): `--path`-but-missing (add) and not-registered (remove) → `NotFoundError` (exit
  1). Broken frontmatter on attach → `ValidationError` (exit 1). Outside-project → the routing's `NotFoundError`
  (exit 1). No `UsageError` path (no bad-arg validation — `<name>` is a free string, `--path` a free path).
- **Lifecycle**: attach/scaffold/remove ride `runMutation` (④ RERENDER auto). ONLY scaffold has ⑤ MATERIALISE
  (doc-11:91 — attach materialises nothing). list rides `runRead`. Structure-not-content: add NEVER authors the
  SKILL.md body (scaffold renders a STRUCTURAL stub from the snippet; attach validates+registers what's there);
  remove NEVER deletes the file.
- **⑤ MATERIALISE target**: the harness materialises into `join(root, AUTHORING_BACKLOG_DIR)` (the
  `.authoring-backlog` Backlog.md root), NOT the project root — already handled by `runMutation` (the
  scaffold spec just RETURNS the `AuthoringTaskSpec`; the harness places it). Confirm the real-binary E2E sees
  the task in `<proj>/.authoring-backlog`.

### Reuse — do NOT reinvent
- The stub renderer: GENERALISE `scaffoldAdvisor` into `renderSkillStub`; refactor advisor to use it (don't
  copy-paste the resolve→find-snippet→render→write→no-op-if-exists logic).
- The registry add/remove/list MECHANICS: mirror `payload-refs.ts`'s set-like add, index-based remove, and the
  comment-preserving `editYaml` `setIn`/`deleteIn` — but over a `{name,path}` sequence, not a string sequence.
- The CLI module shape + the existence-check-in-CLI pattern: `bundleFilesModule`.
- The completion id-aware source shape: `payloadOnDiskSource`/`payloadRegisteredSource` (the
  `resolveContext`+`parseBundleManifest` skeleton; O's sources list DIR names / project `name`).
- `formatResult` / `withExamples` / `lifecycleDepsFor` / the `PerBundleCommandModule` registry.
- The materialisation engine: `materialiseAuthoringTasks` (the harness's ⑤) — the scaffold spec only RETURNS the
  spec; it never calls the materialiser itself.

### Project Structure Notes
- O is the FIRST scaffold-or-attach family and the SEAM P (77–79) + F (45–47) reuse. The success test: P and F
  each become *a `SkillRefDescriptor` + one module + the model/schema registry field + their list-source*
  (P/F's `list` is SCAN-based — keep `list` the one pluggable piece; everything else shared). If O's add/scaffold/
  attach/validate/remove/stub-render is NOT a descriptor-parameterised core, the generalisation is leaking and
  P/F will be re-implementations.
- O's registry is `{name,path}` (richer than L/M/N's bare strings) — because a skill is keyed by name AND located
  by a relocatable path. P/F reuse this `SkillRef` shape.
- The "never a bare `skills/`" hard rule (doc-06:153) is satisfied structurally: the conventional dir is
  `payload/agent-skills/` and `--path` is author-supplied (the author owns where they placed it); the CLI never
  creates a bare `skills/`.

### References
- [Source: docs/10-authoring-cli.md §Per-command actions rows 170/171/172 (`bundle <id> skills add|list|remove`);
  §command tree lines 109–110; line 32 (the scaffold-or-attach principle, "never silently author a finished
  skill"); line 25 (Structure, not content); line 34 (implicit re-render); §"Where a command appears to write
  content" (template-driven stub + task-driven materialisation, lines 27–32).]
- [Source: docs/11-authoring-process.md §3 "Materialised by the skill-adding commands (scaffold branch only)" +
  line 91 (attach materialises nothing) + line 93 ("Write payload skill `<name>` for `<id>`" AC).]
- [Source: docs/06-project-skeleton.md lines 74/76/101/117/129/153 (payload skill = runtime product;
  `payload/agent-skills/<name>/SKILL.md`; namespaced; RUNTIME trigger; inert until install; never a bare
  `skills/`); docs/05-native-agent-surfaces.md lines 94–106/129 (SKILL.md frontmatter: name+description required,
  the block must be first; payload skill role).]
- [Source: docs/13-core-architecture.md §1 (ports/purity; operations MAY call the fs port), §5/§8 (six-beat
  lifecycle: ④ RERENDER + ⑤ MATERIALISE), §7 (error model → exit codes), §4 (services tier — frontmatter,
  render).]
- [Source: src/core/operations/payload-refs.ts (the descriptor-driven registry op template);
  src/core/operations/advisor.ts (`scaffoldAdvisor` — generalise to `renderSkillStub`);
  src/core/operations/create-bundle.ts (the sample-skill ship + payload init);
  src/core/services/schema/bundle.ts (`parsePayloadCategory`/`parsePayload`/`serializeBundleManifest`);
  src/cli.ts `bundleFilesModule` + `PER_BUNDLE_MODULES` + `PER_BUNDLE_COMPLETION_SPECS`;
  src/completion/payload-files-on-disk.ts + payload-files-registered.ts (the id-aware source skeleton);
  src/core/services/render.ts (`renderSnippet`); src/util/yaml.ts (`parseYaml`/`editYaml`);
  templates/project/minimal/snippets/payload-skill.SKILL.md.tmpl (the scaffold snippet — uses `{{skill-name}}`).]
- [Source: _bmad-output/implementation-artifacts/stories/story-cli-bundle-files.md +
  story-cli-bundle-scripts.md — Families L/N; O extends the per-bundle registry pattern with scaffold-or-attach.]

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — BMAD build worker. Skills actually run (Rule 3 evidence): `bmad-create-story` (this
story), `bmad-dev-story` (the core skill-ref operation + frontmatter validator + stub-renderer generalisation +
model/schema/CLI/completion + unit tests), `bmad-qa-generate-e2e-tests` (the real-binary E2E block: attach /
scaffold+materialise / --path-missing error / list / remove-leaves-file / not-registered error).

### Completion Notes List
- **BMAD skills run (Rule 3 evidence):** `bmad-create-story` → this story; `bmad-dev-story` → the core +
  model/schema/CLI/completion + unit tests; `bmad-qa-generate-e2e-tests` → the real-binary E2E block.
- **Registry shape = `SkillRef = { name, path }`** (NOT bare names) — a skill is keyed by `name` (registry /
  deregister / completion key) AND located by `path` (the bundle-relative SKILL.md, which `--path` can relocate),
  so `list` + the downstream "Verify skill registration" task can find each SKILL.md. P/F reuse this shape.
- **Reusable skill-ref core** (`src/core/operations/skill-refs.ts`): `SkillRefDescriptor` + the four specs
  (attach / scaffold / list / remove), parameterised so P (77–79) and F (45–47) become a descriptor + one module
  (+ the model/schema registry field + a list source). `list` is the ONE pluggable piece (O = registry-read;
  P/F = directory scan per doc-10:174/179) — kept isolated.
- **3-way add split in the CLI shell** (the existence-probe-in-CLI pattern of `bundleFilesModule`): the CLI
  resolves the target path, probes existence, and dispatches ATTACH (`attachSkillRefSpec`, no materialise) /
  SCAFFOLD (`scaffoldSkillRefSpec`, WITH ⑤ materialise) / ERROR (`--path` + missing → `NotFoundError` before
  `runMutation`). Keeps each core spec single-purpose (materialise unconditional-per-spec, doc-11:91) and the
  3-way a thin shim P/F copy.
- **Frontmatter validator** (`src/core/services/frontmatter.ts`): pure — extracts the leading `---`-fenced YAML
  head (must be the very first content, doc-05), parses it via `src/util/yaml.ts`, requires non-empty
  `name`+`description`, else a `ValidationError` (exit 1; content/schema defect, not a bad arg). The op reads the
  file via the fs port and passes the content in (doc-13 §4). Reused by O and (later) P/F attach.
- **Generalised `scaffoldAdvisor` → `renderSkillStub`** (`src/core/operations/scaffold-skill.ts`): the "resolve
  project template → find snippet → render → write-unless-exists" body lifted out; `advisor.ts` now delegates to
  it (behaviour preserved, proven by `scaffold-skill.test.ts` + the existing create-bundle/lifecycle tests). O's
  scaffold renders the `payload-skill.SKILL.md.tmpl` snippet (which uses `{{skill-name}}`; `{{bundle-id}}` is
  passed too and ignored by the render service — future-proofs P/F).
- **Bug caught + fixed by a unit test:** `removeSkillRefSpec`'s "left at <dir>" message read the POST-apply
  project (entry already gone) and mis-named a `--path`-relocated skill's dir. Fixed by capturing the dir in ②
  CHECK (pre-apply) into a per-invocation closure the ⑥ summary reads.
- **Model/schema:** `payload.skills` is purely additive — absent/partial `payload:` ⇒ `[]` (old-bundle.yml
  compat, verified at unit + real-binary level). `parseSkillRefs` validates `{name, path}` mappings;
  `serializeBundleManifest` always emits `skills: []`. Every `BundleManifest`-typed test fixture gained
  `skills: []` (7 files).
- **Completion:** `skills add <name>` → on-disk skill-folder names under `payload/agent-skills/` (attachable);
  `skills remove <name>` → registered `payload.skills` names. Both id-aware (read `ctx.bundleId`).
- **Real-binary verified** (the established lesson): attach (sample), scaffold + materialise into the real
  `.authoring-backlog` via real `backlog`, `--path`-missing error, list, remove-leaves-file, not-registered
  error, completion, help, old-bundle compat — all green through `dist/cli.js`.

### File List
ADD:
- `src/core/services/frontmatter.ts` — the SKILL.md frontmatter validator (pure).
- `src/core/operations/scaffold-skill.ts` — `renderSkillStub` (generalised from `scaffoldAdvisor`).
- `src/core/operations/skill-refs.ts` — the descriptor-driven skill-ref core (`SkillRefDescriptor` +
  `PAYLOAD_SKILLS_DESCRIPTOR` + attach/scaffold/list/remove specs + `conventionalSkillPath`).
- `src/completion/skills-on-disk.ts` — the `skills-on-disk` source (skill-folder names).
- `src/completion/skills-registered.ts` — the `skills-registered` source (registered names).
- `test/unit/services/frontmatter.test.ts`
- `test/unit/operations/skill-refs.test.ts`
- `test/unit/operations/scaffold-skill.test.ts`
- `test/unit/cli/bundle-skills-commands.test.ts`

CHANGE:
- `src/core/model/bundle.ts` — add `SkillRef` + `BundlePayload.skills`.
- `src/core/model/index.ts` — export `SkillRef`.
- `src/core/services/schema/bundle.ts` — `parseSkillRefs` + wire into `parsePayload` + undefined short-circuit +
  `serializeBundleManifest` + `BundleManifestData.payload.skills`.
- `src/core/operations/create-bundle.ts` — init `payload.skills: []`.
- `src/core/operations/advisor.ts` — delegate `scaffoldAdvisor` to `renderSkillStub`.
- `src/cli.ts` — `bundleSkillsModule` + append to `PER_BUNDLE_MODULES`; `formatSkillList`; the two completion
  specs; imports (`SkillRef`, the skill-ref core, the descriptor).
- `src/completion/registry.ts` — register `skills-on-disk` + `skills-registered`.
- `test/unit/schema/bundle.test.ts` — extend the payload block with the skills cases.
- `test/integration/cli.bundle-id.e2e.test.ts` — append the skills real-binary E2E block + `placeSkill`/
  `validSkillMd` helpers.
- Test fixtures (+`skills: []`): `test/unit/model/aggregates.test.ts`, `test/unit/services/validate.test.ts`,
  `test/unit/services/validate.acceptance.test.ts`, `test/unit/services/version-constraint.acceptance.test.ts`,
  `test/unit/services/derived-artefacts.test.ts`, `test/unit/services/derived-artefacts.acceptance.test.ts`,
  `test/unit/operations/create-bundle.test.ts`.

### Status
review — implementation complete, all ACs satisfied, full cold gate green. Left UNCOMMITTED for the orchestrator
to review, tick the backlog ACs, commit, and merge (per the worker brief: do not commit / touch sprint-status /
sdlc-state).
