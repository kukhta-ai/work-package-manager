# 06 · Project Skeleton

The current, settled structure of a ready-to-install bundle-project, using `hermes-handoff` as the worked example (a plugin that lets an agent hand the interface back to the human, organised as several independent bundles with `requires` dependencies between them). Names are kebab-case throughout; the only exceptions are externally-standardized filenames (`AGENTS.md`, `CLAUDE.md`, `README.md`, `SKILL.md`, `LICENSE.txt`, Backlog.md's `config.yml`), which their specs fix. Run-time state and the uninstall receipt live inside the bundle backlogs' task records — not in a separate store; the field-level templates are in `07`.

## Authoring workspace vs. shipped artifact

The structure below is the **shipped artifact** — what the end user receives and the executing agent installs. During authoring it does not sit bare at the project root; the builder generates an **authoring workspace** that wraps it, so the deliverable's executor-facing front door never collides with the authoring agent's own surface. The workspace has three regions, named the same way across the design set:

- **authoring workspace root** (the *workspace root*) — the authoring surface: the authoring front door and the authoring backlog (`.authoring-backlog/`, gitignored and builder-time only; `11`). This is where the authoring agent works.
- **deliverable subdirectory `wip/`** — the bundle-project skeleton below (manifest, bundles, installer-skills, the executor front door — author-owned content the build promotes to the live front door at the archive root — and scope-alias symlinks) lives **under `wip/`** while it is being authored.
- **build-output directory `builds/`** — where the build writes its archives, isolated from both the authoring surface and the deliverable.

The **built archive is the `wip/` deliverable un-nested to the archive root, with its content unchanged** — the build lifts everything under `wip/` to the top level of the package, dropping nothing and rewriting only the executor front door's reserved prefix (`_AGENTS.md` → `AGENTS.md`, plus the build-created `CLAUDE.md`/`GEMINI.md` aliases per targets; `12`). The workspace wrapper — the authoring front door, `.authoring-backlog/`, and `builds/` — is **never part of any shipped artifact**. So this document's contract is untouched by the workspace; only the deliverable's *location during authoring* moves under `wip/`. Everything below describes that deliverable: the contents of `wip/`, which are the contents of the built archive's root *after that prefix-strip*. The workspace's own layout is in `11` (the authoring backlog) and `12` (the generated scaffold).

```
LEGEND  [REQ] required   [OPT] optional
        Only AGENTS.md is live without registration; every skill in the repo is INERT
        until it sits in (or is symlinked into) an agent's scanned skills scope.
        Run-time state (progress + the uninstall receipt) accumulates inside each
        install-backlog's task records — there is no separate state directory.

hermes-handoff/                       the deliverable (= contents of wip/ during authoring; the archive root once built)
│
├── AGENTS.md                  [REQ]  always-live front door: recognition + kickoff + the install shape +
│                                     standing rules (contents in 07; full file-content catalogue below).
│                                     Auto-read on entry, no registration.
├── CLAUDE.md                  [OPT]  → AGENTS.md  (symlink; Claude Code reads CLAUDE.md)
├── RALPH-LOOP.md              [OPT]  plain doc we author: the install task statement + per-iteration SDLC
│                                     instructions (the prompt an unattended loop feeds each fresh instance).
│                                     Prose only — the loop RUNNER is a separate vendored plugin (see below).
├── README.md                  [OPT]  short human entry; points into docs/
├── manifest.yml               [REQ]  project release identity + flat list of enabled bundle IDs +
│                                     target agents. Per-bundle metadata (version, summary, requires-map)
│                                     lives in each `bundles/<id>/bundle.yml` (see 07).
├── wpm.lock             [OPT]  pins each VENDORED third-party artifact (discipline skill, loop
│                                     runner) to an exact version + content hash; verified at build (08).
│                                     Present only when the project vendors such content.
├── docs/                      [OPT]  project-wide on-demand reference; AGENTS.md links into it by path.
│
├── installer-skills/          [OPT]  CANONICAL install-time skills — authored once, here.
│   ├── hermes-handoff-installer/    main installer skill ("install this bundle-project"); named <project>-installer
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── journaling.md         the receipt convention + Backlog.md recording mechanics (07)
│   ├── test-driven-development/      OPTIONAL vendored third-party discipline skill (e.g. from superpowers,
│   │   └── SKILL.md                 MIT) — copied in verbatim by the author to enforce a workflow; see below
│   ├── systematic-debugging/        another vendored discipline skill (illustrative; any/none may be present)
│   │   └── SKILL.md
│   ├── ralph-skills/                OPTIONAL vendored loop-runner plugin (e.g. snarktank/ralph, MIT): its
│   │   ├── .claude-plugin/          own .claude-plugin manifest + skills + ralph.sh runner. Drives the
│   │   ├── skills/                  unattended fresh-context loop; reads RALPH-LOOP.md as its prompt.
│   │   └── ralph.sh                 (may instead live in the agent's plugin scope; see below)
│   ├── web-handoff-advisor/          per-bundle "when & why to add web handoff" (powers pull-UX)
│   │   └── SKILL.md
│   └── doc-handoff-advisor/
│       └── SKILL.md
│
│   ── scanned-scope aliases: symlink each target agent's skills scope to installer-skills/ so the
│      install-time skills are recognised when the repo is the working dir. Ship them so they exist
│      at session start. The set of scopes = exactly the agents the manifest targets. The same alias
│      mechanic recurs inside each bundle (see core/ below) for bundle-local install-time skills.
├── .agents/skills    → installer-skills/   [OPT]  PRIMARY shared scope (Codex + Hermes; emerging std)
├── .claude/skills    → installer-skills/   [OPT]  Claude Code
├── .openclaw/skills  → installer-skills/   [OPT]  OpenClaw
│                                                   (Hermes also reads ~/.agents/skills, or use a tap)
│
└── bundles/                   [REQ]  independent bundles; each its own backlog root + state-in-tasks
    │
    ├── core/                         base bundle: the handoff channel. Others depend on it via `requires`,
    │   │                             so it runs first; later bundles use it to ask the user things mid-install.
    │   ├── AGENTS.md          [OPT]  per-bundle scope notes; same front-door mechanic as root ("closest wins")
    │   ├── CLAUDE.md          [OPT]  → AGENTS.md   per-bundle symlink alias, same as root (GEMINI.md etc. too)
    │   ├── installer-skills/  [OPT]  bundle-local install-time skills — helpers active while working THIS bundle
    │   │   └── <skill>/SKILL.md
    │   ├── .agents/skills → installer-skills/   [OPT]  bundle-level scope aliases (+ .claude/skills, .openclaw/skills)
    │   ├── bundle.yml         [OPT]  bundle-local metadata: id (STABLE across versions), version (current),
    │   │                             confirmation levels. id-vs-version = MSI UpgradeCode-vs-ProductCode (see 08)
    │   ├── docs/              [OPT]  bundle-specific depth, agent-loadable by path
    │   ├── payload/           [OPT]  EVERYTHING the bundle delivers (the data.tar analog), by destination:
    │   │   ├── files/                → environment: authoritative reference files (code, data, config).
    │   │   │                           NOT a guaranteed-verbatim placement — the receipt checksums what
    │   │   │                           was actually placed, so agent/user divergence is detected, not assumed away.
    │   │   ├── templates/            → environment: parameterized files (the lower-trust tier of the gradient)
    │   │   └── agent-skills/         → agent scope: PAYLOAD skills (the runtime product). Plain, NON-scanned
    │   │       └── handoff-core/       name; inert until install copies them into the agent's scope.
    │   │           └── SKILL.md        Namespaced; descriptions written for RUNTIME triggers, not install.
    │   ├── installer-scripts/ [OPT]  install-time TOOLING — runs DURING install (probes, smoke tests); not delivered
    │   ├── backlog → install-backlog  [REQ]  relative symlink so the Backlog.md CLI resolves the recipe from
    │   │                                     inside the bundle (at authoring time AND when the executor works it)
    │   └── install-backlog/   [REQ]  THE RECIPE — shipped, versioned, replaced wholesale on update; holds NO receipt.
    │       │                         The agent stamps a persistent working copy elsewhere (the var/lib analog) and
    │       │                         fills THAT in — the filled-in copy is the receipt; its done migration tasks
    │       │                         are the applied-migration ledger. Recipe vs receipt split: see 07/08.
    │       ├── config.yml            init --no-git; sets task_prefix to the bundle id (self-describing IDs
    │       │                         like web-handoff-3) and carries the Definition-of-Done that REQUIRES the
    │       │                         receipt fields (ownership, undo, checksum, version, …) before Done — see 07
    │       └── tasks/                two kinds by label (see 08): kind:state (detect→setup→verify; idempotent,
    │                                 re-run = Repair; editable across versions) and kind:migration (run once,
    │                                 oldest-first, gated on recorded from-version; immutable once shipped)
    │
    ├── web-handoff/                  bundle: hand off web pages. `requires: {core: "^…"}`. Pulls Chromium.
    │   ├── AGENTS.md  bundle.yml  docs/                          (same shape as core/)
    │   ├── payload/ └── files/  templates/  agent-skills/handoff-web/SKILL.md   payload: use Chromium handoff
    │   ├── installer-scripts/
    │   └── install-backlog/   [REQ]  detect (Chromium present?) → setup (install or reuse) → verify
    │
    └── doc-handoff/                  bundle: hand off documents. `requires: {core: "^…"}`. Pulls OpenOffice.
        └── …                         (same shape: payload/{files,templates,agent-skills} installer-scripts/ install-backlog/ …)
```

## Three skill states

`AGENTS.md` is always live, auto-read on entry, needs no registration — it carries recognition and the loop, and it's what guarantees the install works on any agent. The **install-time skills** (the `hermes-handoff-installer` skill and the advisors in `installer-skills/`) are inert in the repo and become live only when their scope is scanned; the symlinked scopes above make that happen when the repo is the working dir, and they additionally drive the "pull" UX (the agent suggesting a bundle when the need arises). The **payload skills** (`handoff-web`, in each bundle's `payload/agent-skills/`) are inert in the repo and become live only when the install copies them into the agent's scanned scope — that relocation *is* the product landing.

Mechanically, install-time and payload skills are the same move (relocate a folder into a scanned scope); they differ only in purpose and in why/when they're registered. That is why both live in plain repo paths and neither auto-activates merely by being shipped.

## Scanned scopes

The verified per-agent scope table is canonical in `05` (Native Agent Surfaces); the short version: `.agents/skills/` is the consolidating standard (read by Codex and Hermes), with `.claude/skills/` and `.openclaw/skills/` as agent-specific aliases, plus the personal `~/.agents`, `~/.hermes`, `~/.claude`, `~/.openclaw` scopes.

Symlinks are sanctioned (Codex follows them) but fragile in git on Windows, so the robust fallback is to have `AGENTS.md`'s first step create the links/copies for the current agent at install time. Either way the scopes must exist at session start to be picked up, which is why they ship in the repo. For Hermes specifically, the whole project can instead be consumed as a "tap" (a GitHub repo with a `skills/` directory), which seeds skills into `~/.hermes/skills/`.

## Self-similar surfaces (root and bundle)

The two agent-surface mechanics — a front-door instruction file (`AGENTS.md`, with `CLAUDE.md`/`GEMINI.md`/… as symlink aliases) and an install-time skills folder (`installer-skills/`, with `.agents`/`.claude`/`.openclaw` scope aliases) — are not root-only. They recur, unchanged, inside each bundle, because a bundle is already a working root in this design: it's its own Backlog.md root, operated with the bundle as cwd. So whatever an agent does at the project root, it can also do one level down.

Composition follows the agents' own discovery rule, which walks from the current directory up to the repo root. Skills compose as a **union**: when the agent is working with a bundle as cwd, that bundle's `installer-skills/` light up *in addition to* the root's. Instruction files compose by **closest-wins**: the root `AGENTS.md` always applies, and the bundle's `AGENTS.md` refines or overrides it for that scope. This is why bundle-local install-time skills are the natural home for helpers used only during one bundle's install (a Chromium-detection helper for `web-handoff`, say) — they stay out of the root catalogue and activate exactly when that bundle is in focus.

One asymmetry is deliberate. Advisor skills that power the "pull" UX must be catalogued at session start, before any bundle has been entered, so they live in the **root** `installer-skills/`, not per bundle. Bundle-level `installer-skills/` are for install-time *helpers*, not pull-UX advisors. And payload skills never enter a scanned scope at any level — the recursion applies to instruction files and install-time skills only.

## What the template's files actually say

A directory tree shows where files sit, not what they contain — yet for this project the *content* of a handful of files is where the real mechanics live. These files ship in the project template (`12`) and are copied into every generated project at `init`; an author specialises them, but their backbone is fixed because the executing agent (`03`, `09`) depends on it. This is the catalogue the tree can't show: for each load-bearing file, what instructional content it carries and why.

**`AGENTS.md` (root).** The always-live front door, and the only file guaranteed read without registration, so it carries what no skill can be relied on to do. Three things, no more (it must stay lean enough to sit in context all session — full spec in `07`): (1) **recognition and kickoff** — flip the agent's stance from "edit this repo" to "install this project," and name the entry points: pointing an agent here, the `⟨project⟩-installer` skill, or a `/goal`-style kickoff; (2) the **install shape** — orient on the manifest, detect, offer the bundle menu, resolve `requires`, preview for consent, then work each selected bundle's backlog, resuming across restarts, closing with how-to-use; it states the per-task workflow (detect→…→verify→record) in brief and leaves the procedural expansion to the orchestrator skill; (3) the **standing rules** — record only what inspection can't recover, reuse recorded decisions, reverse only what you installed, decide shared-dep removal from the graph, checksum-before-overwrite, contain failures, pause at confirmation points. It also points the agent at any vendored discipline skills present in `installer-skills/` and notes that `RALPH-LOOP.md` governs unattended runs.

**`installer-skills/⟨project⟩-installer/SKILL.md`.** The orchestrator, per-project (it names the project and knows its bundles). Its description triggers on "install this project." Its body is the procedural expansion of the install shape — the actual commands for orienting, detecting, offering, resolving, and driving the loop — plus, in `references/journaling.md`, the exact receipt-recording mechanics (which Backlog.md fields hold which facts, how to write them). Front door states policy; this skill supplies procedure.

**`installer-skills/<vendored-discipline-skill>/SKILL.md` (optional).** Where an author wants the executing agent held to a disciplined workflow — not just *told* to follow one in prose — the move is to **vendor a real, existing discipline skill** into `installer-skills/`, not to write one. The ecosystem already ships these as plain SKILL.md folders under permissive licenses: obra's **superpowers** (MIT) carries composable skills like `test-driven-development` (enforced red-green-refactor), `systematic-debugging` (root-cause-before-fix), `brainstorming`, `writing-plans`, `subagent-driven-development`, and `code-review`; **BMAD-METHOD** and **Spec Kit** are alternatives with a more spec- or lifecycle-centric shape. Vendoring is mechanically just copying the skill folder in (it's a SKILL.md plus references), after which it sits in the install-time scope and activates on its own description triggers exactly like any other install-time skill. The author picks which, if any, to include based on how much workflow rigor a given install warrants; a simple install may vendor none and rely on `AGENTS.md` + the orchestrator skill alone, while a complex one might bundle TDD and code-review skills so the agent literally cannot skip the test or the review. Two cautions: these are third-party code, so they carry the supply-chain risk the rest of the system already flags about bundled skills (Snyk found prompt-injection patterns in a third of audited skills), and they should be vendored at a pinned version and surfaced in the plan-preview, not pulled live; and because they're someone else's content, the author keeps their license intact. Crucially, this is *not* a new entity in our design — it's the existing install-time-skill slot (`05`) filled with real skills instead of authored ones, which is why there's no `install-discipline` artifact for us to maintain: the discipline comes from the ecosystem, and our job is only to make `installer-skills/` the place it goes.

**`RALPH-LOOP.md` (root).** A plain markdown doc — just text, no machinery — that we write to hold the install **task statement plus the per-iteration SDLC instructions**: work one task at a time, use the receipt (not conversation memory) to know what's done and resume, halt on a handoff or a DoD failure. It is the per-iteration *prompt content* an unattended loop feeds to each fresh agent instance — the analogue of the `prompt.md` / `CLAUDE.md` prompt template that real Ralph runners copy into a project, not a runner itself. Because it's plain prose it also serves as the **portable fallback**: an agent with no loop tooling can simply re-read this file and the receipt each pass and behave loop-like. This file is ours to author and ships in the template.

The **loop runner itself is a separate, separately-named artifact** — and a real one can be vendored rather than written. A Claude Code / Codex Ralph plugin (e.g. **`snarktank/ralph`**, MIT — installed via `/plugin marketplace add snarktank/ralph` then `/plugin install ralph-skills@ralph-marketplace`) is a structured package: a `.claude-plugin/` manifest for marketplace discovery, `skills/` (its `/ralph` and `/prd` slash-command skills), and a `ralph.sh` loop script that spawns the fresh-context iterations. Vendoring it means dropping that package into the project's `installer-skills/` (or installing it into the agent's plugin scope) the same way a discipline skill is vendored; `RALPH-LOOP.md` is then the prompt content that plugin (or a bare agent) executes against. So the two are not the same thing and don't share a name: `RALPH-LOOP.md` is the task-and-SDLC doc we author; the Ralph **plugin** (`ralph-skills`, or `ralph-wiggum`, or Ralph TUI) is the optional third-party runner — pinned, surfaced in the plan-preview, license kept, like any vendored skill.

**`installer-skills/⟨bundle-id⟩-advisor/SKILL.md`.** One per bundle, optional, root-scoped (must be catalogued before any bundle is entered). Its description triggers on the *user's need* — "I want to hand a webpage to my browser" — and its body recommends the bundle that delivers it and points at how to install. This is the pull-UX content: it's why a user who never asked for "web-handoff" by name still gets offered it. The CLI scaffolds the stub; the agent writes the trigger and recommendation prose (`10`, `11`).

**`bundles/<id>/install-backlog/` tasks.** Not template content (the author writes these per bundle), but the place the install's actual *behaviour* lives, so worth naming here: each task carries instructions + acceptance criteria + the `kind:`/`step:` labels (`08`), and at runtime its filled-in copy in the receipt carries the recorded facts. The template ships only the `config.yml` (the Definition-of-Done that gates recording); the tasks themselves are authored.

**`bundle.yml` and `manifest.yml`.** Structured data, not prose, but they carry mechanics the tree flattens: `manifest.yml` holds the release identity, the flat enabled-bundle list, and the target agents (which determines the scope aliases to ship); each `bundle.yml` holds the bundle's stable `id`, moving `version`, user-facing `summary` (the menu line), confirmation levels, and the `requires` map (the dependency contract, with npm-style version constraints). The schemas are in `10`; the versioning semantics in `08`.

## Lifecycle

Install is the default mode, expressed by each `install-backlog` running its uniform loop — detect (idempotent; "already done?" → skip), setup (honoring the author's trust-gradient and confirmation-level choices), verify (against acceptance criteria, possibly handing off to the user), and record (write the receipt into the task before it may be marked Done). The receipt is not a separate store: it lives in the task's notes and file references, and the bundle's Definition-of-Done makes recording it a precondition for Done (see `07`). Following proven package-manager practice, the agent journals only the facts it can't re-derive by inspection — installed-vs-adopted, the inverse step, any overwritten user file, the choice it made — and re-derives everything else (presence, registration, file integrity) by looking.

Uninstall replays those recorded inverse ops in reverse: it removes only what was installed (never an adopted dependency), and it decides whether a shared dependency is still needed from the requires-graph plus the still-installed bundles rather than from a stored counter. An authored `uninstall-backlog/` is an optional escalation for genuinely complex reverse logic; by default the recorded journal is enough. Placed files are handled conffile-style: `payload/files/` is the author's authoritative reference, the receipt records the checksum of what was actually placed, and on repair/upgrade/uninstall a user-modified file is preserved with a keep/replace/merge offered rather than blind-overwritten or deleted. Code that must be built on the target rather than placed is the legitimate fallback — an install-backlog task performs the build and records the resulting artifacts' provenance. Repair is the same detect→act loop run in reconcile mode: re-verify, find drift, re-apply. Reversal is soft, not transactional — it undoes the recorded changes reliably and is best-effort on side effects that aren't cleanly reversible.

Update is Repair against a bumped target version: the agent runs the new recipe against the persistent receipt, the idempotent `kind:state` tasks reconcile, and the pending `kind:migration` tasks fire oldest-first, gated on the recorded from-version. Because the receipt persists outside the replaceable recipe, an update never loses install state; the full convention and rules are in `08`.

## Minimal package vs. full

The minimal viable package is `AGENTS.md` + `manifest.yml` + one bundle with an `install-backlog/` (its `config.yml` carrying the Definition-of-Done). Everything else scales the project up: `payload/files/` (+ `templates/`) and `installer-scripts/` for reliable setup, `payload/agent-skills/` for the delivered capability, `installer-skills/` + scope aliases for recognition and pull-UX, `docs/` for depth, and an authored `uninstall-backlog/` only where reverse logic is complex. Progress, resume, and the uninstall receipt all live in the install-backlog task records — there is no separate state store.

## Hard rules

Nothing skill-shaped in the repo lives in a scanned scope except the `installer-skills/` aliases — payload skills stay nested at `<bundle>/payload/agent-skills/` (a name chosen so it can't match any scanned-scope convention; in particular never a bare `skills/`), and there is never a bare `skills/` at *any* level, root or bundle (Hermes and tap tooling would seed it). The front-door and install-time-skill mechanics recur per bundle, but advisor skills that power pull-UX stay in the root `installer-skills/` so they're catalogued before any bundle is entered; bundle-level `installer-skills/` are install-time helpers only. The `manifest.yml` is the single source of truth for which agents are targeted, and therefore which scope aliases to ship, and for which bundles are installable — a directory under `bundles/` that the manifest doesn't list is **disabled** (and therefore inert: the executor never offers it, the build never includes it, the review tasks never consider it). And the install-backlog task records *are* the receipt: every setup step must record the non-recoverable facts — installed-vs-adopted, the inverse op, any overwritten files, decisions made — enforced by Definition-of-Done, because uninstall and repair replay from them. Field-level templates for the front door, the DoD config, and the receipt block are in `07`. The shipped `install-backlog/` is the replaceable recipe and the filled-in persistent copy is the receipt — never store the receipt inside the recipe, a shipped `kind:migration` task is immutable (fix forward), and a bundle's `id` stays stable while its `version` moves; the full versioning/migration rules are in `08`.
