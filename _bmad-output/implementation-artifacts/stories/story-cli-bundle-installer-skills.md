# Story cli-bundle-installer-skills — `bundle <id> installer-skills add` / `list` / `remove` (tasks 77 + 78 + 79)

Status: ready-for-dev

> BMAD create-story output (skill-driven; BMAD sprint-status/epics auto-discovery suppressed — the real contract
> is the Backlog.md backlog tasks 77/78/79, read via `backlog task <id> --plain`, NOT the foundation-epic-1
> `epics.md`/`sprint-status.yaml`; the orchestrator owns sprint status and forbids touching it). Steered from doc
> 10 rows 173–175 + doc 10 line 32 (the structure-not-content "scaffold-or-attach" principle), doc 10 command
> tree lines 112–114, doc 11 §3, doc 06 lines 77/96/117/129/153 + doc 07 line 51 (installer-skills: install-time
> HELPERS, NOT delivered payload; union-scanned at install; bundle-scoped at `bundles/<id>/installer-skills/`;
> NEVER a bare `skills/`), doc 13 §1/§5/§7/§8 (purity / lifecycle / error model).
>
> This is **per-bundle family P** in the CLI epic-2, the FIRST of the two installer-skills twins that REUSE the
> Family-O skill scaffold-or-attach core (`src/core/operations/skill-refs.ts`). The design mandate from O's story
> is honoured here: P becomes **one `SkillRefDescriptor` + one `PerBundleCommandModule` (+ a NEW bundle-level
> registry field on the model/schema + a SCAN-based `list` source)** — NOT a re-implementation. The sibling F
> (`project installer-skills`, tasks 45–47) follows immediately after P with the same shape at project scope.

## Acceptance criteria (verbatim from the backlog — read via `backlog task <id> --plain`)

### TASK-77 — `bundle <id> installer-skills add <name> [--path <path>]` (a MUTATION; doc-10 row 173)
1. When a SKILL.md exists at the resolved path (default `bundles/<id>/installer-skills/<name>/SKILL.md`) or the
   `--path` location, its frontmatter is validated and the reference is registered.
2. When none exists and no `--path` is given, a stub with frontmatter plus a placeholder description and no
   invented prose is rendered at the conventional path, a content-authoring task naming the bundle is
   materialised, and the reference is registered.
3. When `--path` is given but nothing exists there, the command fails with a typed error directing the author to
   omit `--path` to scaffold.
4. The bundle installer-skills scope aliases are ensured to exist, created if absent.
5. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id completes from enabled bundles.
6. Help output is substantive (description, synopsis, the name positional and `--path`, an example); on success
   it prints what it did and exits 0.

### TASK-78 — `bundle <id> installer-skills list` (a READ; doc-10 row 174)
1. The command enumerates the helper SKILL.md files under the bundle installer-skills directory.
2. The command reads and reports only, with no change on disk, and exits 0 on success.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id completes from enabled bundles.
4. Help output is substantive (description, synopsis, an example).

### TASK-79 — `bundle <id> installer-skills remove <name>` (a MUTATION; doc-10 row 175)
1. The named helper is deregistered and the command prints that the SKILL.md was left at
   `bundles/<id>/installer-skills/<name>/` for the author to delete deliberately.
2. The file content is left untouched on disk: deregister, not delete.
3. Deregistering a name that is not registered fails with a typed not-found error and a non-zero exit.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the name completes from registered bundle helpers.
5. Help output is substantive (description, synopsis, the name positional, an example); on success exits 0.

## doc-10 contract (cite the rows)

> `bundle <id> installer-skills add <name> [--path <path>]` (row 173): "1. Resolve target: `--path` if given,
> else `bundles/<id>/installer-skills/<name>/SKILL.md`. 2. **If a SKILL.md exists there (attach):** validate
> frontmatter (`name`, `description`); register the reference. 3. **If none exists and no `--path` (scaffold):**
> **Template-driven** render a stub at the conventional path from the project template's installer-skill snippet
> (frontmatter `name: <name>` + placeholder description/body — no sense-dependent prose); **Task-driven**
> materialise 'Write content for install-time skill `<name>` in `<id>`'; register. 4. **If `--path` was given but
> nothing exists there:** error (omit `--path` to scaffold a stub at the conventional location). 5. Ensure the
> bundle's `installer-skills/` scope aliases exist (per `06`'s self-similar surfaces); create if absent. 6. Print
> what it did (attached, or scaffolded + the task id)." [Source: docs/10 §Per-command actions row 173; also
> §command tree lines 112–114: "`installer-skills add|list|remove <name>` — install-time helper skills scoped to
> this bundle … at `bundles/<id>/installer-skills/<name>/` (union-scanned; see 06); add: render stub + materialise
> content task if none exists".]

> `bundle <id> installer-skills list` (row 174): "Enumerate `bundles/<id>/installer-skills/` for helper SKILL.md
> files." [Source: docs/10 row 174.] — NOTE this is a directory SCAN, distinct from O's registry-based payload
> `skills list`.

> `bundle <id> installer-skills remove <name>` (row 175): "Deregister; print 'deregistered; SKILL.md left at
> `bundles/<id>/installer-skills/<name>/`'." [Source: docs/10 row 175.]

> The governing PRINCIPLE (doc 10 line 32): "`project targets add`, `bundle <id> advisor add`, and `…
> installer-skills add` (in its scaffold branch) are both — template-driven render of a structural stub … plus
> task-driven materialisation of the prose-writing work. The CLI never decides what prose belongs in … a SKILL.md
> body … This is why the skill-adding commands share one verb, `add`, with a uniform meaning: *attach the skill if
> the author already wrote it, otherwise scaffold a stub and queue the writing* — never silently author a finished
> skill." [docs/10 line 32.]

> What an installer-skill IS (vs a payload skill): doc-06 line 77 "`installer-scripts/` and the bundle's
> install-time skills are NOT delivered to the user — they are tooling the executing agent uses *during* install";
> doc-07 line 51 (the install contract excludes install-time tooling from what is delivered); doc-06 §self-similar
> surfaces — a bundle has its OWN `installer-skills/` scope, union-scanned at install alongside the project root's
> (the agent reads `<root>/installer-skills/` AND `bundles/<id>/installer-skills/` through the scope aliases);
> doc-06 line 153 (HARD) "never a bare `skills/` at any level". [Source: docs/06 lines 77/96/117/129/153; docs/07
> line 51.]

## THE CENTRAL DESIGN DECISION — SCAN-vs-REGISTRY (record this in the Completion Notes)

There is a real tension in the doc-10 contract that this story RESOLVES (a doc-10-led refinement; NOT a user gate
— goals/vocabulary/style unchanged, only the realization is sharpened):

- `installer-skills list` is doc-spec'd as a **directory SCAN** (row 174: "Enumerate `bundles/<id>/installer-
  skills/` for helper SKILL.md files"; AC78#1 "enumerates the helper SKILL.md files UNDER the directory"). The
  union-scanned-at-install model (doc-06) makes the directory the source of truth at install time.
- BUT `add` "registers the reference" (row 173 steps 2/3), `remove` "deregisters" (row 175), and the `remove`
  completion source is "registered bundle helpers" (AC79#4) — all of which imply a **registry**.

**RESOLUTION (the deliberate payload-vs-installer-skill split):**
- Keep a **registry** — a NEW bundle-level `installerSkills` field in `bundle.yml` (a `SkillRef[]` of `{name,
  path}`, reusing O's shape) — for **add / remove / `remove`-completion**. `add` registers; `remove` deregisters
  by name; `remove` completes from the registered names.
- Make **`list` SCAN the directory** (`bundles/<id>/installer-skills/*/SKILL.md`), a NEW scan-based list spec
  variant — the ONE pluggable piece O explicitly left for P/F (O's `list` is registry-read; see O's story §"The
  REUSABLE SKILL-REF CORE" → "Pluggable `list` for P/F").
- Because `remove` **deregisters but LEAVES the SKILL.md on disk** (AC79#1/#2), a scan-based `list` STILL shows a
  removed helper until the author deletes the file manually — which is exactly what the "left at … for the author
  to delete deliberately" message means. The registry and the scan are intentionally allowed to diverge: the
  registry is the BUILD-TIME record (what `add` registered / `remove` dropped); the scan is the INSTALL-TIME
  reality (every SKILL.md present is union-scanned, whether or not it is registered). This mirrors doc-06's split:
  **payload skills are registered-for-build (O, registry-authoritative); installer-skills are union-scanned-at-
  install (P/F, scan-authoritative for `list`)**.

> Why not "list reads the registry" (like O)? Because doc-10:174 says SCAN, AND an installer-skill placed by the
> agent directly under `bundles/<id>/installer-skills/<name>/SKILL.md` (without `add`) is still a real install-
> time helper the install will union-scan — `list` must show it. A registry-only `list` would hide author-placed
> helpers, contradicting the union-scan model. So `list` scans; `add`/`remove` keep the registry for the deregister
> contract + completion.

## P STEP 5 — THE SCOPE-ALIAS ENSURE (AC77#4) — FINDING: largely rerender-covered

**Finding (record it):** `src/core/services/derived-artefacts.ts` `scopePlan(targets, bundleIds)` ALREADY plans,
for every declared target, a **per-bundle alias** `{ linkPath: join("bundles", id, aliasPathFor(target)), aliasTo:
join("bundles", id, "installer-skills") }` (lines 107–114). The ④ RERENDER beat of `runMutation`
(`applyRerender` in `lifecycle.ts`, lines 201–219) probes each planned alias and calls `fs.ensureAlias(...)` for
every one that does not yet exist. Since `installer-skills add` is a MUTATION riding `runMutation`, **the existing
④ RERENDER already ensures the bundle's installer-skills scope aliases on every `add`** — for each target in
`manifest.yml.targets`.

**Consequence for AC77#4:** P step 5 is **satisfied by the existing rerender** — P does NOT reinvent the alias
machinery. The work is to:
1. **CONFIRM** with a test: on a project with a declared target (`claude-code`), after `installer-skills add`, the
   bundle's scope alias exists at `bundles/<id>/.claude/skills` pointing at `bundles/<id>/installer-skills`
   (unit-level via the in-memory fs's alias set, and real-binary via `existsSync` on the link).
2. **Round it out** in the doc/comment: state in the module JSDoc + the Completion Notes that step 5 is delivered
   by ④ RERENDER (the scope-alias plan already covers per-bundle installer-skills), so the leaf adds NO explicit
   alias code — it just rides the lifecycle, exactly like O. (If a future audit shows a target whose alias the
   plan misses, that is a `scopePlan` gap to fix THERE, not a per-leaf patch.)

> Do NOT create a bare `skills/` alias (doc-06:153). The alias path comes from `aliasPathFor(target)` (e.g.
> `.claude/skills`, `.agents/skills`), never a bare `skills/`. `scopePlan` already obeys this — confirm, don't
> re-derive.

> EDGE CASE — a project with NO declared targets: `scopePlan` produces no aliases (nothing to ensure), so
> `installer-skills add` still succeeds (it registers/scaffolds), just with no alias created yet — the aliases
> appear when `project targets add` later runs (the same deferral `init` documents, doc-10:137 step 7). AC77#4 is
> "ensured to exist, created if absent" — with no target there is no alias to create; this is correct, not a
> violation. Cover it with a test (add on a no-target project → exit 0, no alias, helper registered).

## THE REUSED SKILL-REF CORE (what P imports unchanged from O)

P reuses `src/core/operations/skill-refs.ts` (Family O) **as-is** for attach / scaffold / remove, and adds ONE
new scan-based list spec. The pieces:

- `SkillRefDescriptor` — the seam. P supplies its own descriptor (below).
- `attachSkillRefSpec(descriptor)` — UNCHANGED. CHECK host enabled; APPLY reads the SKILL.md at the resolved path
  via the fs port → `validateSkillFrontmatter` → register `{name, path}` (set-like on name). NO materialise.
- `scaffoldSkillRefSpec(descriptor, deps)` — UNCHANGED. CHECK host enabled; APPLY renders the descriptor's snippet
  via `renderSkillStub` to the conventional path + register `{name, conventionalPath}`. WITH `materialise` → one
  `AuthoringTaskSpec` built from `descriptor.materialiseTitle/Ac`.
- `removeSkillRefSpec(descriptor)` — UNCHANGED. CHECK name registered (else `NotFoundError`); APPLY delete the
  entry by index, comment-preservingly; NEVER touch the SKILL.md; summary "deregistered; SKILL.md left at <dir> —
  delete it yourself if you meant to" (built from the registered ref's path directory).
- `conventionalSkillPath(descriptor, name)` — UNCHANGED (`${descriptor.onDiskDir}/${name}/SKILL.md`).
- `renderSkillStub` (`scaffold-skill.ts`) + `validateSkillFrontmatter` (`frontmatter.ts`) — UNCHANGED, reused.

> The ONLY core ADDITION P makes is a **scan-based list spec** (see below). `descriptor.select` + the registry
> path are still needed (attach/scaffold/remove use them), so P's descriptor sets them to the NEW bundle-level
> `installerSkills` registry.

### P's descriptor — `BUNDLE_INSTALLER_SKILLS_DESCRIPTOR`
```ts
export const BUNDLE_INSTALLER_SKILLS_DESCRIPTOR: SkillRefDescriptor = {
  onDiskDir: "installer-skills",                              // bundle-relative: bundles/<id>/installer-skills/
  registryPath: ["installerSkills"],                         // the NEW bundle.yml registry (NOT under payload:)
  select: (host) => host.installerSkills,                    // the NEW BundleManifest.installerSkills field
  snippetPath: "installer-skill.SKILL.md.tmpl",              // exists in templates/project/minimal/snippets/
  materialiseTitle: (name, hostId) => `Write content for install-time skill ${name} in ${hostId}`,
  materialiseAc: (name, hostId) =>
    `the stub's placeholder description and body for ${name} are replaced with real install-time helper content (active while the agent works ${hostId}'s installer-skills scope, per docs/06)`,
  noun: "installer skill",
};
```
Conventional path resolves to `installer-skills/<name>/SKILL.md` (bundle-relative). Scaffold materialises **"Write
content for install-time skill `<name>` in `<id>`"** (AC77#2 "a content-authoring task naming the bundle").

> **VERIFY the snippet on disk** (do NOT author/alter it — it shipped with task-30):
> `templates/project/minimal/snippets/installer-skill.SKILL.md.tmpl` uses **`{{skill-name}}`** in its frontmatter
> `name:` and heading. The render service THROWS on an unresolved `{{...}}` but IGNORES unused params, so pass
> `new Map([["skill-name", name], ["bundle-id", id]])` (skill-name is consumed; bundle-id is harmless + future-
> proof). The stub is structure-only: frontmatter `name: <name>` + a TODO placeholder description/body — NO
> invented prose (AC77#2).

### The NEW scan-based list spec — `scanInstallerSkillsSpec`
The ONE piece O left pluggable. Add it to `skill-refs.ts` (it belongs beside the other skill-ref specs and is
shared by P and F, which differ only by the scanned directory and an EXCLUSION predicate — see F's story):
```ts
/** A directory-SCAN list of installer-skill helper NAMES under a host-relative dir (doc-10 rows 174/179): the
 *  immediate subdirectories that CONTAIN a SKILL.md. Unlike the registry-based `listSkillRefsSpec` (O), this
 *  reflects on-disk REALITY (union-scanned at install, doc-06) — so an author-placed helper shows even if never
 *  `add`-registered, and a `remove`-deregistered helper still shows until its SKILL.md is deleted. An optional
 *  `exclude` predicate drops names F must hide (the main `<project>-installer` + the `<id>-advisor`s); P passes
 *  none. The fs SCAN lives in the CLI shell (the read's `project` is pure); the spec PROJECTS the already-scanned
 *  names threaded in as input — mirroring how `bundle <id> show` threads the file tree. */
export interface ScanListInput { readonly id: string; readonly scannedNames: readonly string[]; }
export function scanInstallerSkillsSpec(noun: string): ReadSpec<ScanListInput, readonly string[]>;
```
- It is a `ReadSpec` whose `project` simply returns the (already-sorted, already-filtered) `scannedNames` — the
  DIRECTORY WALK is done in the CLI shell (which owns the fs port), exactly as `bundle <id> show` walks the tree
  in the shell and threads it into `showBundleSpec`. This keeps the read's `project` PURE (no fs in the core read
  path) and the scan id-aware in the one place that has the port.
- The shell helper that scans: `installerSkillNames(fs, root, id)` = the immediate subdirectory names under
  `bundles/<id>/installer-skills/` that contain a `SKILL.md`, sorted (returns `[]` when the dir is absent).
- The CLI prints each name one per line, or `(no installer skills)` when empty (AC78#1/#2).

> WHY scan "subdirs that contain a SKILL.md" (not "every `.md` file"): a helper IS a directory
> `installer-skills/<name>/` whose `SKILL.md` is the skill (the same shape as payload skills + the advisor). The
> name `list` prints is the FOLDER name `<name>` (what `add`/`remove` key on). Scanning for `*/SKILL.md` and
> reporting the parent folder name is the precise enumeration AC78#1 ("the helper SKILL.md files under the
> directory") describes, named consistently with `add <name>`/`remove <name>`.

## PART 1 — THE MODEL + SCHEMA EXTENSION (a NEW bundle-level `installerSkills` registry)

Installer-skills are NOT payload (doc-06:77 / doc-07:51 — install-time, not delivered), so they do NOT belong
under `bundle.yml`'s `payload:` map. Add a SEPARATE bundle-level `installerSkills` registry, with the SAME
backward-compatible (absent ⇒ empty) pattern `payload` uses.

### `src/core/model/bundle.ts` — add `installerSkills` to `BundleManifest`
```ts
export interface BundleManifest {
  readonly id: BundleId;
  readonly version: SemVer;
  readonly summary: string;
  readonly confirmation: ConfirmationLevel;
  readonly requires: ReadonlyMap<BundleId, VersionRange>;
  readonly payload: BundlePayload;
  /** Registered bundle-scoped install-time helper skills (doc 10 row 173). Each is a {@link SkillRef} ({name,
   *  path}): the `name` is the registry/deregister key, the `path` locates the SKILL.md (conventional
   *  `installer-skills/<name>/SKILL.md`, or a `--path` location). NOT payload — installer-skills are install-time
   *  HELPERS, not delivered (doc 06/07); this registry backs `add`/`remove`/completion, while `list` SCANS the
   *  directory (union-scanned at install, doc 06). Absent in `bundle.yml` ⇒ empty. */
  readonly installerSkills: readonly SkillRef[];
}
```
Reuse the EXISTING `SkillRef` type (already exported from `model/index.ts` by O) — no new type.

### `src/core/services/schema/bundle.ts` — round-trip `installerSkills` (absent ⇒ empty)
- Extend `BundleManifestData` to add (a TOP-LEVEL field, sibling of `payload`):
  `readonly installerSkills: readonly { readonly name: string; readonly path: string }[]`.
- REUSE the existing `parseSkillRefs(raw, ctx)` helper (O added it for `payload.skills`) — it already validates a
  list of `{name, path}` mappings with the absent ⇒ `[]` short-circuit and field-precise errors. Call it on
  `data.installerSkills` with a field label of `installerSkills` (parameterise the helper's field/message base so
  the error names `installerSkills[i].name` rather than `payload.skills[i].name`; if the existing helper hardcodes
  `payload.skills`, generalise it to take the field base — both call sites then share one validator).
- Wire it into `parseBundleManifest` alongside the payload parse:
  ```ts
  const installerSkills = parseSkillRefs(data.installerSkills, ctx, "installerSkills");
  if (!installerSkills.ok) return installerSkills;
  return ok({ id: …, version: …, summary: …, confirmation, requires, payload: payloadResult.value,
              installerSkills: installerSkills.value });
  ```
- In `serializeBundleManifest`, emit `installerSkills: bundle.installerSkills.map(s => ({ name: s.name, path:
  s.path }))` (always emitted, empty ⇒ `[]`, like `payload`).

> **Compatibility (HARD):** an OLD `bundle.yml` with NO `installerSkills` key (every bundle.yml that exists today,
> including a fresh `bundle new` from before this change) MUST still parse — `installerSkills` becomes `[]`. The
> parser is on the LOAD path for EVERY command; a regression breaks every `bundle <id> …`. Schema unit tests:
> absent ⇒ `installerSkills` `[]`; populated `installerSkills: [{name,path}]` round-trips; an entry missing
> `name`/`path` or not a mapping → rejected naming `installerSkills`. CRUCIAL: also assert the EXISTING `payload`
> round-trip is unaffected (the two registries are independent).

### `src/core/operations/create-bundle.ts` — init `installerSkills: []`
Extend the `manifest: BundleManifest` literal so a fresh `bundle.yml` carries `installerSkills: []` beside
`payload:`. (Grep the literal in `create-bundle.ts`; it currently builds `payload: { files: [], templates: [],
scripts: [], skills: [] }` — add the sibling `installerSkills: []`.)

> The `default` bundle template does NOT ship a sample installer-skill (it ships a payload sample under
> `payload/agent-skills/<id>-skill/` and an advisor under the project root, but no `bundles/<id>/installer-
> skills/<name>/`). So on a fresh `bundle new`, `installer-skills add <new>` exercises SCAFFOLD; to exercise
> ATTACH on the real binary, place a SKILL.md under `bundles/<id>/installer-skills/<name>/SKILL.md` first.

## PART 2 — THE CORE ADDITION (`src/core/operations/skill-refs.ts`)

- Add `BUNDLE_INSTALLER_SKILLS_DESCRIPTOR` (above).
- Add the scan-based list spec `scanInstallerSkillsSpec(noun)` + its `ScanListInput` (above) — a `ReadSpec` that
  projects the threaded `scannedNames`. (The actual fs walk is a CLI-shell helper, like `bundleFileTree`.)
- If `parseSkillRefs` needs generalising (field base), that edit is in `schema/bundle.ts`, not here.
- attach/scaffold/remove/`conventionalSkillPath`/`renderSkillStub`/`validateSkillFrontmatter` are REUSED unchanged.

All under `src/core/` ⇒ the import-boundary rule applies: the new descriptor + scan spec import only
model/lifecycle-types/`node:path` — NEVER `node:fs`/`commander`/`execa`. (`core-boundary.test.ts` + Biome
`noRestrictedImports` enforce it.) The scan spec's `project` is pure (returns its input); the fs walk is in the
shell.

## PART 3 — THE CLI MODULE (`src/cli.ts`, add ONE `bundleInstallerSkillsModule`)

Model it on `bundleSkillsModule` (the O leaf): `add` is the SAME 3-way CLI branch (existence probe + dispatch);
`list` SCANS (the difference); `remove` deregisters. The host `<id>` is already resolved + enabled-guarded by the
per-bundle routing and threaded in.

```ts
const bundleInstallerSkillsModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const installerSkills = sub
      .command("installer-skills")
      .description("register or inspect this bundle's install-time helper skills (not delivered; doc 10)");

    // ── installer-skills add <name> [--path <path>] ─────────────────────────────────────────────────────────
    const addLeaf = installerSkills
      .command("add")
      .argument("<name>", "the install-time helper skill's name (its SKILL.md folder under installer-skills/<name>/)")
      .option("--path <path>", "attach an existing SKILL.md at this bundle-relative path instead of the conventional location")
      .description("attach an existing install-time helper skill, or scaffold a stub + queue its writing if none exists (doc 10)")
      .action((name: string, opts: { path?: string }) => {
        const conventional = conventionalSkillPath(BUNDLE_INSTALLER_SKILLS_DESCRIPTOR, name); // installer-skills/<name>/SKILL.md
        const targetRel = opts.path ?? conventional;                                          // bundle-relative
        const exists = ctx.deps.fs.exists(join(root, "bundles", id, targetRel));
        if (opts.path !== undefined && !exists) {
          // AC77#3: --path given but nothing there → typed error, register nothing.
          throw new NotFoundError(
            `no SKILL.md at bundles/${id}/${opts.path} — omit --path to scaffold a stub at ${conventional}, or place the file there first`,
          );
        }
        const result = exists
          ? runMutation(lifecycleDepsFor(ctx, root), { root }, attachSkillRefSpec(BUNDLE_INSTALLER_SKILLS_DESCRIPTOR), { id, name, path: targetRel })
          : runMutation(lifecycleDepsFor(ctx, root), { root },
              scaffoldSkillRefSpec(BUNDLE_INSTALLER_SKILLS_DESCRIPTOR, { builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot }),
              { id, name });
        // AC77#4: the scope aliases are ensured by ④ RERENDER inside runMutation (scopePlan already plans the
        // bundle's installer-skills aliases for each declared target) — the leaf adds no explicit alias code.
        // AC77#6: the summary says attached vs scaffolded; formatResult adds the materialised: N line for scaffold.
        ctx.io.out.write(formatResult(result));
      });
    withExamples(addLeaf, [
      { command: "wpm bundle web-handoff installer-skills add detect-node", note: "attach the SKILL.md the agent placed, or scaffold a stub + queue its writing" },
      { command: "wpm bundle web-handoff installer-skills add detect-node --path installer-skills/detect-node/SKILL.md", note: "attach an existing SKILL.md at an explicit bundle-relative path" },
    ]);

    // ── installer-skills list ───────────────────────────────────────────────────────────────────────────────
    // SCAN (doc-10:174): enumerate the helper SKILL.md folders under bundles/<id>/installer-skills/ — the fs walk
    // lives here (the shell owns the port), threaded into the pure scan spec, mirroring `bundle <id> show`.
    const listLeaf = installerSkills
      .command("list")
      .description("list this bundle's install-time helper skills (scanned under installer-skills/) (doc 10)")
      .action(() => {
        const scannedNames = installerSkillNames(ctx.deps.fs, root, id); // sorted subdir names containing SKILL.md
        const { value } = runRead(ctx.deps.fs, { root }, scanInstallerSkillsSpec(BUNDLE_INSTALLER_SKILLS_DESCRIPTOR.noun), { id, scannedNames });
        ctx.io.out.write(formatInstallerSkillList(value));    // names one per line, or "(no installer skills)"
      });
    withExamples(listLeaf, [{ command: `wpm bundle ${id} installer-skills list`, note: "list this bundle's install-time helper skills" }]);

    // ── installer-skills remove <name> ──────────────────────────────────────────────────────────────────────
    const removeLeaf = installerSkills
      .command("remove")
      .argument("<name>", "the registered install-time helper to deregister (the SKILL.md is left on disk)")
      .description("deregister an install-time helper skill, leaving its SKILL.md on disk (doc 10)")
      .action((name: string) => {
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, removeSkillRefSpec(BUNDLE_INSTALLER_SKILLS_DESCRIPTOR), { id, name });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [{ command: "wpm bundle web-handoff installer-skills remove detect-node", note: "deregister detect-node (its SKILL.md stays on disk)" }]);
  },
};
```
- Append `bundleInstallerSkillsModule` to `PER_BUNDLE_MODULES` (after `bundleSkillsModule`).
- Add a `formatInstallerSkillList(names: readonly string[])` helper: `names.length === 0 ? "(no installer
  skills)\n" : names.join("\n") + "\n"` (it takes NAMES, not refs — the scan returns names).
- Add an `installerSkillNames(fs, root, id)` shell helper (the subdir-with-SKILL.md walk).
- Import `BUNDLE_INSTALLER_SKILLS_DESCRIPTOR`, `scanInstallerSkillsSpec`, and (already imported for O)
  `attachSkillRefSpec`/`scaffoldSkillRefSpec`/`removeSkillRefSpec`/`conventionalSkillPath` from
  `./core/operations/skill-refs.js`.

> The summary text differs by descriptor noun ("attached installer skill …" / "scaffolded installer skill …" /
> "deregistered; SKILL.md left at installer-skills/<name>/ …") — these come from the SHARED specs using
> `descriptor.noun` and `descriptor.onDiskDir`, so no new message code. Confirm the remove "left at
> installer-skills/<name>/" matches AC79#1 (it is built from the registered ref's path dir = `installer-
> skills/<name>/`).

## PART 4 — COMPLETION (`PER_BUNDLE_COMPLETION_SPECS` + sources)

- AC77#5 / 78#3 / 79#4 id completion is already provided by the `bundle` spec (`bundle-ids`) — the routing.
- `installer-skills add <name>` — completes from the on-disk helper folder NAMES under
  `bundles/<id>/installer-skills/` (the attachable helpers, like O's `skills add` → on-disk skill folders). REUSE
  the SAME shape as `skillNamesOnDisk` but against `installer-skills/` (filter to subdirs containing a SKILL.md is
  ideal, but matching O — which lists all subdir names — is acceptable; prefer the SKILL.md filter for precision).
  A NEW source `installerSkillNamesOnDisk` (id-aware: `resolveContext` + list `bundles/<id>/installer-skills/`).
  `installer-skills add` → `["installer-skills-on-disk"]`.
- `installer-skills remove <name>` — completes from the **REGISTERED** helpers' names (AC79#4 "completes from
  registered bundle helpers"): a NEW source `installerSkillNamesRegistered` reading
  `installerSkills.map(s => s.name)` for the host id (the id-aware `resolveContext` + `parseBundleManifest` shape
  of `skillNamesRegistered`, projecting from the new `installerSkills` field). `installer-skills remove` →
  `["installer-skills-registered"]`.
- Register both in `defaultRegistry()`. Add to `PER_BUNDLE_COMPLETION_SPECS`:
  ```ts
  "installer-skills add": { args: ["installer-skills-on-disk"] },
  "installer-skills remove": { args: ["installer-skills-registered"] },
  ```

> NOTE the deliberate asymmetry: `add` completes from ON-DISK (attachable helpers, matching `list`'s scan view),
> while `remove` completes from the REGISTRY (AC79#4 is explicit: "registered bundle helpers"). This is consistent
> with the scan-vs-registry split — `add` attaches what's on disk; `remove` deregisters what's registered.

## PART 5 — TEST PLAN (unit in-process + real-binary E2E; every AC mapped)

### Schema unit (`test/unit/schema/bundle.test.ts`, EXTEND)
- absent `installerSkills` ⇒ `[]` (and `payload` round-trip UNAFFECTED).
- populated `installerSkills: [{name:"d",path:"installer-skills/d/SKILL.md"}]` round-trips.
- `serialize` always emits `installerSkills` (empty ⇒ `[]`).
- malformed: `installerSkills` not a list / an entry not a mapping / an entry missing `name` or `path` → rejected
  naming `installerSkills`.
- a bundle.yml with BOTH a populated `payload.skills` AND a populated `installerSkills` → both round-trip
  independently (proves the two registries don't collide).

### CLI unit (`test/unit/cli/bundle-installer-skills-commands.test.ts`, NEW — mirror `bundle-skills-commands.test.ts`)
Seed `/proj` with bundle `a` (comment + known key order, NO `installerSkills` key — the old-bundle shape; a target
`claude-code` in the manifest). Init the authoring backlog + seed the project template snippets INCLUDING
`installer-skill.SKILL.md.tmpl` (so SCAFFOLD render + ④ RERENDER resolve). The seed must also seed the front-door
+ orchestrator snippets the rerender needs (copy O's seed).
- **77#1 attach (conventional)** — place a valid SKILL.md at `bundles/a/installer-skills/detect/SKILL.md`;
  `installer-skills add detect` → exit 0; `installerSkills` has `{name:detect, path:installer-skills/detect/
  SKILL.md}`; file bytes UNCHANGED; comment + key order preserved; SUMMARY says "attached"; NO `materialised:`
  line.
- **77#1 attach via --path** — place at `bundles/a/elsewhere/SKILL.md`; `installer-skills add d2 --path
  elsewhere/SKILL.md` → registered with that path.
- **77#1 attach invalid frontmatter** — place a SKILL.md with no `description`; `installer-skills add bad` → exit
  1 (ValidationError naming the field); bundle.yml byte-identical.
- **77#2 scaffold** — `installer-skills add fresh` (no file, no --path) → exit 0; a stub at
  `bundles/a/installer-skills/fresh/SKILL.md` (frontmatter `name: fresh` + the snippet's placeholder description,
  NO invented prose — assert the stub/TODO marker present); `installerSkills` registered; the authoring task
  **"Write content for install-time skill fresh in a"** materialised (assert via the fake backlog); SUMMARY +
  `materialised: 1`.
- **77#3 --path-but-missing** — `installer-skills add ghost --path installer-skills/ghost/SKILL.md` (nothing
  there) → exit 1 (typed NotFound naming the path + "omit --path"); bundle.yml byte-identical; NO stub written.
- **77#4 alias-ensure** — after `installer-skills add fresh` on the `claude-code`-target project, the bundle's
  scope alias exists at `bundles/a/.claude/skills` (assert via the in-memory fs: the alias link path exists /
  resolves to `bundles/a/installer-skills`). ALSO: on a NO-target project, add → exit 0, NO alias, helper still
  registered (the no-target edge).
- **77#5 outside-project** — exit 1 naming `manifest.yml` + `init`; **id completes from enabled bundles**.
- **77#6 help** — Usage + `<name>` + `--path` + Example.
- **78#1 list (scan)** — manually place TWO helper folders `installer-skills/one/SKILL.md` +
  `installer-skills/two/SKILL.md` (WITHOUT `add` — proving the SCAN sees author-placed helpers) → `installer-
  skills list` stdout = `one\ntwo\n` (sorted). ALSO: a registered-but-then-removed helper whose file is left
  STILL appears in `list` (the scan-vs-registry divergence — register `three` via add, `remove three`, then
  `list` still shows `three` because the SKILL.md is on disk).
- **78#1 empty** — `list` on a bundle with no installer-skills dir → `(no installer skills)`.
- **78#2 read-only** — manifest + bundle.yml unchanged after `list`.
- **78#3 outside-project** — exit 1 naming `manifest.yml`; id completes.
- **78#4 help** — Usage + Example.
- **79#1 remove** — register a helper (scaffold `fresh`), `installer-skills remove fresh` → gone from
  `installerSkills`; SUMMARY contains "left at installer-skills/fresh/"; exit 0.
- **79#2 file-left-on-disk** — after remove, the SKILL.md STILL exists with unchanged content.
- **79#3 not-registered** — `installer-skills remove nope` → exit 1 (NotFound); bundle.yml unchanged.
- **79#4 outside-project** — exit 1 naming `manifest.yml`; **name completes from REGISTERED helpers**
  (`__complete bundle a installer-skills remove <tab>` → registered names).
- **79#5 help** — Usage + `<name>` + Example.
- **end-to-end in-process** — scaffold `fresh` → list (shows `fresh`) → remove → list (STILL shows `fresh`,
  because the stub is left on disk — the deliberate scan-vs-registry behaviour) → the materialised task present +
  comment survives. (Contrast O's e2e where list-after-remove is empty; here the SCAN keeps showing the left file
  — assert this explicitly + note it in a comment.)
- **rerender** — after add, `${PROJ}/AGENTS.md` exists.
- **installer-skills group help** — lists add/list/remove.

### Real-binary E2E (append to `test/integration/cli.bundle-id.e2e.test.ts`, `describeIfBuilt`)
Through `dist/cli.js` + real `NodeFileSystem` tmpdir + real `backlog` (the materialise path MUST run, not skip).
Add a `placeInstallerSkill(proj, bundle, name, content)` helper writing
`bundles/<bundle>/installer-skills/<name>/SKILL.md`, and reuse `validSkillMd`.
- **attach** — place `bundles/web/installer-skills/detect/SKILL.md` (valid); `bundle web installer-skills add
  detect` → exit 0; `bundles/web/bundle.yml` gains `installerSkills:` … `- name: detect` / `  path:
  installer-skills/detect/SKILL.md` (real eemeli/yaml round-trip); SUMMARY attached; file bytes unchanged; NO
  `materialised:` line.
- **scaffold + materialise (cold)** — `bundle web installer-skills add fresh` → exit 0; SUMMARY scaffolded +
  `materialised`; a stub at `bundles/web/installer-skills/fresh/SKILL.md` with frontmatter `name: fresh` + a TODO
  marker (NOT invented prose); registered in bundle.yml; **the authoring task "Write content for install-time
  skill fresh in web" materialised in `.authoring-backlog`** (assert via `backlog task list --plain` in
  `<proj>/.authoring-backlog`). The loop-closure proof.
- **--path-but-missing error** — `bundle web installer-skills add ghost --path installer-skills/ghost/SKILL.md` →
  exit ≠ 0; bundle.yml unchanged; no stub written.
- **list (scan)** — manually place `installer-skills/manual/SKILL.md` (no `add`); `bundle web installer-skills
  list` → stdout contains `manual` (proves the SCAN shows author-placed helpers, not just registered ones); a
  fresh bundle prints `(no installer skills)`.
- **alias-ensure (77#4)** — after `bundle web installer-skills add fresh` on the init'd project (which targets
  `claude-code` — VERIFY init's default target; if init seeds no target, run `project targets add claude-code`
  first), the bundle scope alias EXISTS at `bundles/web/.claude/skills` (existsSync on the link) pointing at
  `installer-skills`. Record in the test comment that this is delivered by ④ RERENDER's scopePlan.
- **remove (deregister, file left + scan still shows)** — `bundle web installer-skills remove detect` → exit 0;
  stdout contains "left at installer-skills/detect/"; the entry gone from bundle.yml; the SKILL.md STILL on disk;
  AND `installer-skills list` STILL shows `detect` (the scan-vs-registry divergence on the real binary).
- **not-registered remove error** — `bundle web installer-skills remove not-there` → exit ≠ 0; bundle.yml
  unchanged.
- **completion** — `__complete bundle web installer-skills add` → lists on-disk helper folder names;
  `__complete bundle web installer-skills remove` (after add) → lists registered names.
- **help** — `bundle web installer-skills add --help` → contains `bundle web installer-skills add`, `<name>`,
  `--path`, Example.
- **OLD-bundle.yml compat (real binary)** — a `bundle.yml` with NO `installerSkills` key still drives
  `installer-skills list` (`(no installer skills)`) and `installer-skills add` (adds the field) — absent ⇒ empty
  end-to-end.

---

## Dev Notes

### Files to ADD
- `src/completion/installer-skills-on-disk.ts` — the `installer-skills-on-disk` source (on-disk helper folder
  names under `bundles/<id>/installer-skills/`).
- `src/completion/installer-skills-registered.ts` — the `installer-skills-registered` source (registered
  `installerSkills` names).
- `test/unit/cli/bundle-installer-skills-commands.test.ts` — the new CLI suite.
- (No new model/service/operation FILES — P reuses O's `skill-refs.ts` / `scaffold-skill.ts` / `frontmatter.ts`;
  it only ADDS a descriptor + a scan list spec INTO `skill-refs.ts`.)

### Files to CHANGE
- `src/core/model/bundle.ts` — add `installerSkills: readonly SkillRef[]` to `BundleManifest` (+ JSDoc).
- `src/core/services/schema/bundle.ts` — `BundleManifestData.installerSkills` + parse via (generalised)
  `parseSkillRefs(data.installerSkills, ctx, "installerSkills")` + wire into `parseBundleManifest` +
  `serializeBundleManifest`.
- `src/core/operations/create-bundle.ts` — init `installerSkills: []`.
- `src/core/operations/skill-refs.ts` — add `BUNDLE_INSTALLER_SKILLS_DESCRIPTOR` + `scanInstallerSkillsSpec` +
  `ScanListInput`.
- `src/cli.ts` — add `bundleInstallerSkillsModule`; append to `PER_BUNDLE_MODULES`; add `formatInstallerSkillList`
  + `installerSkillNames`; the two completion specs; imports.
- `src/completion/registry.ts` — register `installer-skills-on-disk` + `installer-skills-registered`.
- `test/unit/schema/bundle.test.ts` — extend with the `installerSkills` round-trip / absent / malformed / both-
  registries cases.
- `test/integration/cli.bundle-id.e2e.test.ts` — append the installer-skills real-binary E2E block +
  `placeInstallerSkill` helper.
- **Test fixtures (every `BundleManifest`-typed literal)** — add `installerSkills: []` beside `payload: {...}` in
  each `BundleManifest`-typed fixture. GREP for `payload: {` / `skills: []` to find them (the O story listed:
  `test/unit/model/aggregates.test.ts`, `validate.test.ts`, `validate.acceptance.test.ts`,
  `version-constraint.acceptance.test.ts`, `derived-artefacts.test.ts`, `derived-artefacts.acceptance.test.ts`,
  `create-bundle.test.ts` — re-grep, since O already touched them). Schema-test fixtures passing untyped DATA into
  `parseBundleManifest` need NO change.

### Architecture constraints (doc 13 — HARD)
- **Core boundary**: the new descriptor + `scanInstallerSkillsSpec` stay PURE — import only model/lifecycle-types/
  `node:path`, NEVER `node:fs`/`commander`/`execa`. The fs SCAN for `list` lives in the CLI shell
  (`installerSkillNames`), threaded into the pure read — exactly as `bundle <id> show` walks the tree in the shell.
  The 3-way existence PROBE for `add` also stays in the shell (the O pattern). (`core-boundary.test.ts` + Biome
  enforce.)
- **Core is synchronous**; all actions sync.
- **Error model** (docs/13 §7): `--path`-but-missing (add) and not-registered (remove) → `NotFoundError` (exit 1).
  Broken frontmatter on attach → `ValidationError` (exit 1). Outside-project → the routing's `NotFoundError` (exit
  1). No `UsageError` path (no bad-arg validation — `<name>` is a free string, `--path` a free path). [P, unlike F,
  has NO reserved-name refusal — that is F-only (AC45#4).]
- **Lifecycle**: attach/scaffold/remove ride `runMutation` (④ RERENDER auto — which is what DELIVERS AC77#4's
  alias-ensure). ONLY scaffold has ⑤ MATERIALISE (doc-11 — attach materialises nothing). list rides `runRead`.
  Structure-not-content: add NEVER authors the SKILL.md body; remove NEVER deletes the file.
- **⑤ MATERIALISE target**: the harness materialises into `join(root, AUTHORING_BACKLOG_DIR)` — already handled by
  `runMutation`. Confirm the real-binary E2E sees the task in `<proj>/.authoring-backlog`.

### Reuse — do NOT reinvent
- The skill-ref core (attach/scaffold/remove/`conventionalSkillPath`), the stub renderer (`renderSkillStub`), the
  frontmatter validator (`validateSkillFrontmatter`): REUSE from O unchanged. P adds a descriptor + a scan list
  spec, nothing more in the core.
- The registry add/remove MECHANICS + the comment-preserving `editYaml` `setIn`/`deleteIn`: already in O's specs
  (over the descriptor's `registryPath` = `["installerSkills"]`).
- The CLI module shape + the 3-way-existence-check-in-CLI: `bundleSkillsModule`.
- The scan walk: mirror `bundleFileTree` (the shell's recursive lister) but to immediate subdir names containing a
  SKILL.md.
- The completion id-aware source shape: `skillNamesOnDisk` / `skillNamesRegistered` (O's sources — copy against
  `installer-skills/` + the `installerSkills` registry).
- The alias-ensure: `scopePlan` + `applyRerender` (the ④ RERENDER beat) — already plans + creates the bundle's
  installer-skills aliases. CONFIRM with a test; add NO alias code.

### Project Structure Notes
- P is the FIRST installer-skills twin and the proof that O's core generalises: P = a `SkillRefDescriptor` + one
  module + a NEW bundle-level registry field + a SCAN list spec. If P had to re-implement attach/scaffold/remove,
  the generalisation would be leaking — it does NOT (those come straight from `skill-refs.ts`).
- The NEW registry is `BundleManifest.installerSkills` (NOT under `payload:`) — because installer-skills are NOT
  delivered payload (doc-06:77/07:51). It is the bundle analogue of F's `Manifest.installerSkills` (project
  scope), which F adds next.
- The scan-vs-registry split is the deliberate payload-vs-installer-skill distinction: payload skills = registered-
  for-build (O, registry-authoritative `list`); installer-skills = union-scanned-at-install (P/F, SCAN-based
  `list`, registry for add/remove/completion). Record this in the Completion Notes (a doc-10-led refinement).
- "Never a bare `skills/`" (doc-06:153) holds: the conventional dir is `installer-skills/`, and the scope aliases
  (`.claude/skills` → `installer-skills`) come from `aliasPathFor`, never a bare `skills/`. `scopePlan` obeys it.

### References
- [Source: docs/10-authoring-cli.md §Per-command actions rows 173/174/175 (`bundle <id> installer-skills
  add|list|remove`); §command tree lines 112–114; line 32 (the scaffold-or-attach principle + install-skills
  scaffold-branch render+materialise); line 25 (Structure, not content); line 34 (implicit re-render).]
- [Source: docs/11-authoring-process.md §3 (materialised by the skill-adding commands, scaffold branch only — the
  installer-skill content task).]
- [Source: docs/06-project-skeleton.md lines 77/96/117/129/153 (installer-skills = install-time helpers, NOT
  delivered; union-scanned; bundle-scoped at `bundles/<id>/installer-skills/`; self-similar surfaces; never a bare
  `skills/`); docs/07-install-contract.md line 51 (install-time tooling excluded from delivery);
  docs/05-native-agent-surfaces.md (SKILL.md frontmatter: name+description required; install-time helper scope).]
- [Source: docs/13-core-architecture.md §1 (ports/purity; operations MAY call the fs port; reads stay pure), §5/§8
  (six-beat lifecycle: ④ RERENDER — which delivers the alias-ensure — + ⑤ MATERIALISE), §7 (error model → exit
  codes), §4 (services tier — frontmatter, render).]
- [Source: src/core/operations/skill-refs.ts (the descriptor-driven skill-ref core — REUSED; P adds a descriptor +
  scan list spec); src/core/operations/scaffold-skill.ts (`renderSkillStub` — REUSED);
  src/core/services/frontmatter.ts (`validateSkillFrontmatter` — REUSED);
  src/core/services/derived-artefacts.ts (`scopePlan` — already plans the bundle installer-skills aliases);
  src/core/operations/lifecycle.ts (`applyRerender` — ④ RERENDER creates the aliases via `fs.ensureAlias`);
  src/core/services/schema/bundle.ts (`parseSkillRefs`/`serializeBundleManifest` — extend for `installerSkills`);
  src/core/operations/create-bundle.ts (the payload init — add `installerSkills: []`);
  src/cli.ts `bundleSkillsModule` + `PER_BUNDLE_MODULES` + `PER_BUNDLE_COMPLETION_SPECS` + `bundleFileTree`;
  src/completion/skills-on-disk.ts + skills-registered.ts (the id-aware source skeleton);
  templates/project/minimal/snippets/installer-skill.SKILL.md.tmpl (the scaffold snippet — uses `{{skill-name}}`).]
- [Source: _bmad-output/implementation-artifacts/stories/story-cli-bundle-skills.md — Family O, the established
  skill scaffold-or-attach core P reuses; this story is its installer-skills twin at bundle scope.]

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — BMAD build worker. Skills actually run (Rule 3 evidence): `bmad-create-story` (this
story), `bmad-dev-story` (the descriptor + scan-list spec + model/schema/CLI/completion + unit tests),
`bmad-qa-generate-e2e-tests` (the real-binary E2E block: attach / scaffold+materialise / --path-missing error /
list-scan / alias-ensure / remove-leaves-file / not-registered error).

### Completion Notes List
- **BMAD skills run (Rule 3 evidence):** `bmad-create-story` → this story; `bmad-dev-story` → the model/schema +
  core descriptor/scan-spec + CLI module + completion + unit tests; `bmad-qa-generate-e2e-tests` → the real-binary
  E2E block in `cli.bundle-id.e2e.test.ts`.
- **Scan-vs-registry decision (the central refinement, doc-10-led — not a user gate):** kept a REGISTRY (the new
  top-level `bundle.yml` `installerSkills` field, `{name,path}`) for `add`/`remove`/completion, and made `list`
  SCAN the directory (`bundles/<id>/installer-skills/*/SKILL.md`). Because `remove` deregisters but LEAVES the
  SKILL.md, a scan-based `list` keeps showing a removed helper until the author deletes the file — the deliberate
  payload-vs-installer-skill split (payload = registered-for-build [O, registry `list`]; installer-skills =
  union-scanned-at-install [P, scan `list`], registry only for the deregister contract + completion). Proven by a
  dedicated in-process e2e test (`list` after `remove` STILL shows the helper) AND the real-binary e2e.
- **Registry shapes:** `bundle.yml` gains a TOP-LEVEL `installerSkills: [{name, path}]` (a SIBLING of `payload`,
  NOT under it — installer-skills are not delivered payload, doc-06:77/07:51). Reuses O's `SkillRef` type. Absent
  ⇒ `[]` (old/partial bundle.yml compat, verified at schema-unit + real-binary level). `serializeBundleManifest`
  always emits `installerSkills: []`. The shared `parseSkillRefs` validator was generalised with a `fieldBase`
  param so it serves both `payload.skills` and `installerSkills` (errors name the right registry).
- **P step 5 / AC77#4 (alias-ensure) — RERENDER-COVERED, no explicit alias code:** `scopePlan`
  (derived-artefacts) ALREADY plans the bundle's `installer-skills/` scope aliases per declared target, and
  `runMutation`'s ④ RERENDER (`applyRerender` → `fs.ensureAlias`) creates each missing one on every mutation.
  Since `add` is a mutation, the bundle's `.claude/skills` alias is ensured automatically. The leaf adds NO alias
  code — it rides the lifecycle (exactly like O). Confirmed by tests: (a) after `add` on a `claude-code`-target
  project, `bundles/<id>/.claude/skills` exists (in-process via the memory-fs alias set; real-binary via
  `existsSync` after a `project targets add claude-code`); (b) on a NO-target project, `add` still succeeds with
  no alias created (the deferral `init` documents — correct, not a violation).
- **Core reuse (the generalisation held):** P added ZERO new core operation files — it reuses O's
  `attachSkillRefSpec`/`scaffoldSkillRefSpec`/`removeSkillRefSpec`/`conventionalSkillPath`/`renderSkillStub`/
  `validateSkillFrontmatter` unchanged, supplying only `BUNDLE_INSTALLER_SKILLS_DESCRIPTOR` + the scan list spec
  `scanInstallerSkillsSpec` (both added INTO `skill-refs.ts`). The scan's fs walk lives in the CLI shell
  (`installerSkillNames`), threaded into the pure read — like `bundle <id> show` threads its file tree — so the
  core read path stays fs-free and the import-boundary holds.
- **Main-installer-name exclusion is F-only, not P:** P's `list` scans the BUNDLE's `installer-skills/`, which
  never contains the project's main `<project>-installer` or the `<id>-advisor` (those live at the project root),
  so P needs no exclusion. F (the project-scoped twin) is where the exclusion/refusal applies.
- **Error model:** `--path`-but-missing (add) and not-registered (remove) → `NotFoundError` (exit 1, message
  "omit --path to scaffold" / "is not registered … nothing to deregister"). Broken frontmatter on attach →
  `ValidationError` (exit 1). Outside-project → the routing's `NotFoundError` (exit 1). No `UsageError` path (no
  reserved-name refusal — that is F-only, AC45#4).
- **Completion:** `installer-skills add` → on-disk helper-folder names (subdirs with a SKILL.md under
  `installer-skills/`); `installer-skills remove` → registered `installerSkills` names (AC79#4). Both id-aware.
- **Test-harness change (justified, project-philosophy-aligned):** added `testTimeout`/`hookTimeout: 60000` to
  the INTEGRATION vitest project. Each integration test drives the REAL `backlog` CLI over several subprocess
  round-trips (init + multiple `bundle new` + the command), so a single test legitimately takes several seconds;
  run serially under load, the heaviest families (requires/installer-skills) exceeded vitest's 5s default. The
  robust fix for a stateful-external serial suite is a realistic time budget, NOT retries (the config's own
  rationale). The unit project keeps the fast default. With the budget raised, the full bundle-id E2E file passes
  70/70 (~164s).

### File List
ADD:
- `src/completion/installer-skills-on-disk.ts` — the `installer-skills-on-disk` completion source (on-disk helper
  folder names under `bundles/<id>/installer-skills/`).
- `src/completion/installer-skills-registered.ts` — the `installer-skills-registered` completion source
  (registered `installerSkills` names).
- `test/unit/cli/bundle-installer-skills-commands.test.ts` — the in-process CLI suite (25 tests).

CHANGE:
- `src/core/model/bundle.ts` — add `BundleManifest.installerSkills: readonly SkillRef[]`.
- `src/core/services/schema/bundle.ts` — `BundleManifestData.installerSkills`; generalise `parseSkillRefs` with a
  `fieldBase` param; wire `installerSkills` into `parseBundleManifest` + `serializeBundleManifest`.
- `src/core/operations/create-bundle.ts` — init `installerSkills: []`.
- `src/core/operations/skill-refs.ts` — add `BUNDLE_INSTALLER_SKILLS_DESCRIPTOR` + `scanInstallerSkillsSpec` +
  `ScanInstallerSkillsInput`.
- `src/cli.ts` — add `bundleInstallerSkillsModule` (appended to `PER_BUNDLE_MODULES`); `formatInstallerSkillList`
  + `installerSkillNames` helpers; the two completion specs; imports.
- `src/completion/registry.ts` — register `installer-skills-on-disk` + `installer-skills-registered`.
- `test/unit/schema/bundle.test.ts` — the `installerSkills` round-trip / absent / malformed / both-registries
  cases.
- `test/integration/cli.bundle-id.e2e.test.ts` — the installer-skills real-binary E2E block (10 tests) +
  `placeInstallerSkill` helper.
- `vitest.config.ts` — integration `testTimeout`/`hookTimeout: 60000` (real-`backlog` serial suite budget).
- Test fixtures (+`installerSkills: []` on each `BundleManifest`-typed literal):
  `test/unit/model/aggregates.test.ts`, `test/unit/services/validate.test.ts`,
  `test/unit/services/validate.acceptance.test.ts`, `test/unit/services/version-constraint.acceptance.test.ts`,
  `test/unit/services/derived-artefacts.test.ts`, `test/unit/services/derived-artefacts.acceptance.test.ts`,
  `test/unit/operations/create-bundle.test.ts`.

### Status
review — implementation complete, all 77/78/79 ACs satisfied. Left UNCOMMITTED for the orchestrator to review,
tick the backlog ACs, commit, and merge (per the worker brief: do not commit / touch sprint-status / sdlc-state).
