# Story task-19 — Implement the derived-artefacts service (incl. scope-alias planning)

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned
> — steered from docs 13 §4/§8, 06, 05, 10 + the task-10 model + task-16 render). Phase C services tier.
> doc 13 §4 `derived-artefacts` + `scope-plan`; §5 step ④ RERENDER. PURE projection of desired on-disk state;
> the operation does the I/O. Synchronous.

## Story
As every MUTATING operation (the §5 RERENDER step), I need a pure projection that, from the loaded `Project`,
derives the always-read front door (`AGENTS.md`), the `<project>-installer` orchestrator skill, and the set
of scope aliases that should exist — and a pure diff so re-deriving onto an already-current project writes
nothing — so derived artefacts never drift (doc 10) and re-running an unchanged operation is a no-op.

## Acceptance criteria (the contract)
1. Given a project, the always-read front-door file (AGENTS.md), the orchestrator skill, and the set of scope
   aliases that should exist are derived from it (doc 13).
2. The derived aliases correspond to the project's declared target agents, at both project and bundle level.
3. Deriving twice from the same project yields identical results, and re-deriving onto an already-current
   project changes nothing.

## Developer context (the docs)
- doc 13 §4: "`derived-artefacts` — `(Project)` → the rendered `AGENTS.md`, the orchestrator skill, and the
  *set of scope aliases that should exist*. A pure projection of desired on-disk state; the operation diffs
  it against reality and applies it. Idempotent by construction: same `Project` ⇒ same output." And
  "`scope-plan` — `(targets)` → the alias paths that should exist at root and per bundle (using the built-in
  agent-name → alias-path map). Pairs with `FileSystem.ensureAlias`."
- doc 13 §5 step ④ RERENDER: re-render AGENTS.md + orchestrator skill + scope aliases, **idempotent** (writes
  only what differs).
- doc 10: derived artefacts are pure derivatives of `manifest.yml` + each `bundle.yml`; "`{{bundles}}` = the
  list of summaries pulled from each `bundle.yml`"; no separate `update`/`regenerate` command — every mutating
  command re-renders.
- doc 06: the front-door `AGENTS.md` + the per-project `<project>-installer` orchestrator skill; scope aliases
  are symlinks from a scanned scope to `installer-skills/`; the front-door + install-time-skill surfaces
  **recur per bundle** (self-similar surfaces).
- **doc 05 (the alias map source), lines 114–119**: the canonical agent → scanned-scope table —
  `Codex → .agents/skills/`, `Hermes → reads .agents/skills/` (the consolidating standard), `Claude Code →
  .claude/skills/`, `OpenClaw → .openclaw/skills/`; `.agents/skills/` is primary, add `.claude/skills/` and
  `.openclaw/skills/` as agent-specific aliases (symlinks to one canonical dir); **never a bare `skills/`**.

## The built-in agent → alias-path map (AC#2) — `src/core/services/agent-aliases.ts` (doc 12 names this file)
Grounded in doc 05 (lines 114–119). `AgentName` is kebab. The cwd-scope (project-relative) alias path each
agent reads:
| AgentName | alias path (project-relative) | doc 05 |
|---|---|---|
| `claude-code` | `.claude/skills` | line 116 |
| `codex` | `.agents/skills` | line 114 (the consolidating standard) |
| `hermes` | `.agents/skills` | line 115 (reads `.agents/skills`) |
| `openclaw` | `.openclaw/skills` | line 117 |
Export `ALIAS_PATHS: Record<string, string>` (keyed by the agent-name string) + a lookup
`aliasPathFor(agent): string | undefined`. An agent not in the map → `undefined` (surfaced as "unknown" by
the caller). Never emit a bare `skills/`. Cite doc 05 in the JSDoc.

## Design — `src/core/services/derived-artefacts.ts` (PURE; boundary rule applies)
- **`AliasPlanEntry = { target: AgentName; linkPath: string; aliasTo: string }`** — `linkPath` is where the
  symlink is created (project-relative, e.g. `.claude/skills` at root, `bundles/<id>/.claude/skills` per
  bundle); `aliasTo` is the `installer-skills/` dir it points at (`installer-skills` at root,
  `bundles/<id>/installer-skills` per bundle). `node:path` (pure, allowed in core) for joins.
- **`AliasPlan = { aliases: AliasPlanEntry[]; unknownTargets: AgentName[] }`**.
- **`scopePlan(targets: readonly AgentName[], bundleIds: readonly BundleId[]): AliasPlan`** (AC#2): for each
  target with a known alias path, emit a root entry (`linkPath = <aliasPath>`, `aliasTo = "installer-skills"`)
  AND one per bundle (`linkPath = bundles/<id>/<aliasPath>`, `aliasTo = bundles/<id>/installer-skills`) —
  self-similar surfaces (doc 06). Targets NOT in the map → `unknownTargets`. Deterministic order (targets ×
  [root, then bundles in id order]).
- **`deriveArtefacts(project, snippets): DesiredArtefacts`** (AC#1): pure projection.
  - `snippets: { frontDoor: TemplateFile; orchestrator: TemplateFile }` — passed as DATA (operation resolved
    them via the template-resolver; built-in CONTENT is tasks 30–31). `TemplateFile = {path, content}`.
  - Compute render params FROM the `Project`: `project-name` = `project.manifest.meta.name`; `bundles` = the
    bundle summaries joined into one string (one `- <summary>` line per enabled bundle, in manifest
    `bundles` order, looked up from `project.bundles`); optionally `version`, etc. — keep to what the docs
    name (`{{project-name}}`, `{{bundles}}`). Build a `RenderParams` map.
  - Render front-door via `renderSnippet(snippets.frontDoor, params)` and orchestrator via
    `renderSnippet(snippets.orchestrator, params)` (task-16). The orchestrator path snippet may carry
    `{{project-name}}` in its PATH (`installer-skills/{{project-name}}-installer/SKILL.md.tmpl`) — render
    handles that.
  - Return `DesiredArtefacts = { files: RenderedFile[]; aliasPlan: AliasPlan }` (files = [front-door,
    orchestrator]; aliasPlan from `scopePlan(targets, enabledBundleIds)`).
- **Idempotency / diff (AC#3)**:
  - `deriveArtefacts` is PURE + DETERMINISTIC: same `Project` + same `snippets` → deep-equal output (test).
  - **`planChanges(desired: DesiredArtefacts, current: CurrentState): ChangeSet`** — `current` is the actual
    on-disk state SUPPLIED AS DATA by the operation: `{ files: ReadonlyMap<string, string> (path→content);
    aliases: ReadonlySet<string> (existing linkPaths) }`. Produce a `ChangeSet = { filesToWrite:
    RenderedFile[]; aliasesToCreate: AliasPlanEntry[] }` containing ONLY what differs: a file whose
    `current.files.get(path) === content` is SKIPPED (no write — idempotent); a missing/different file is in
    `filesToWrite`; an alias whose `linkPath` is already in `current.aliases` is SKIPPED; absent ones are in
    `aliasesToCreate`. EMPTY ChangeSet when `current` already matches `desired`. Pure (the operation reads
    reality + applies the delta; doc 13 §4 "the operation diffs it against reality and applies it").
- **PURE**: import only `render` (task-16) + the task-10 model + the alias map + `node:path`. NO `node:fs`/
  `commander`/`execa` — boundary clean on `src/core/services/`.
- Export: `scopePlan`, `deriveArtefacts`, `planChanges`, `AliasPlanEntry`, `AliasPlan`, `DesiredArtefacts`,
  `CurrentState`, `ChangeSet`.

## Tests (`test/unit/services/derived-artefacts.test.ts` + `agent-aliases.test.ts` — pure)
- agent-aliases: each known agent → its doc-05 path; unknown → undefined; never bare `skills/`.
- AC#1: fixture `Project` (manifest name + 2 enabled bundles w/ summaries + targets) + fixture snippets with
  `{{project-name}}`/`{{bundles}}` (and the orchestrator path placeholder) → `deriveArtefacts` returns the
  rendered front-door + orchestrator with the project name substituted and the bundle summaries listed; the
  orchestrator output path carries the project name.
- AC#2: `scopePlan([claude-code, codex], [core, web-handoff])` → root entries for `.claude/skills` +
  `.agents/skills`, AND per-bundle entries (`bundles/core/.claude/skills`, `bundles/web-handoff/...`, etc.);
  an unknown target (e.g. `cursor`) → in `unknownTargets`, not in `aliases`.
- AC#3: determinism (`deriveArtefacts` ×2 deep-equal); `planChanges(desired, current=exact match)` → empty
  ChangeSet; `planChanges(desired, current=stale content)` → that file in `filesToWrite`;
  `planChanges(desired, current=missing alias)` → that alias in `aliasesToCreate`; current with everything
  present+matching → empty.

## DoD
- Pure (boundary clean — verify biome on `src/core/services/`). `tsc --noEmit` clean, `biome check .` clean,
  `vitest run` green (single process), `npm ci` clean (no new deps). JSDoc every public fn/type; no dead code.

## Previous-story intelligence (carried forward)
- task-16 `renderSnippet(file, params)` → `RenderedFile {path, content}`; substitutes in path + content,
  strips `.tmpl`, throws on unresolved placeholder. task-17 resolver returns the Template (with files +
  snippets) the operation passes here. node:path allowed in core (task-17). Run `biome check --write` before
  the gate; run vitest as a SINGLE process (task-18 concurrency caveat).

## Boundaries (do NOT do here)
- No fs / no symlink creation (the operation applies via `FileSystem.ensureAlias`, task-12). No resolving
  templates from disk (task-17). No authoring the built-in snippet CONTENT (tasks 30–31 — fixtures only). No
  wiring into operations (task-25/26). No new deps. Don't edit docs/, AGENTS.md, backlog/, .bmad/ (incl.
  sprint-status), task-5's biome.json, task-10–18.
