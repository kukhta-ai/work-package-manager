# work-package-manager (`wpm`)

> Distribute instructions for AI agents to run.

**wpm** is a way to deliver a complex setup to someone whose environment you can't see. Instead of
shipping finished software, or a brittle README/setup script that assumes a machine it never saw, an
author uses `wpm` to produce a self-contained **work-package** — a status-tracked **backlog of
instructions**, with the **skills it needs bundled in** and **adapted per agent** — and the
recipient's own AI agent runs it to install, verify, update, and remove the setup in their
environment.

It earns its place over a shared markdown prompt in three ways a flat prompt can't:

1. **it packs every skill needed** to do the work (the skills travel inside the package),
2. **the backlog has statuses** — real project-management structure (dependencies, state, acceptance
   criteria), not flat text,
3. **it adapts for agents** — the same package is made runnable across different agent harnesses.

Today `wpm` is the **builder** (the `rpmbuild` / `electron-builder` slot — the tool that *produces*
the package). The roadmap grows it into the full *work package manager* the name promises — author →
build → publish → discover → install — by adding a registry and distribution layer on top of a
stable builder and install contract.

- **npm package:** `work-package-manager` · **command:** `wpm`

---

## Prerequisites

`wpm` requires **[Backlog.md](https://github.com/MrLesk/Backlog.md)** — a separate, external tool it
**shells out to** for every task operation (it is the runtime engine behind the install-backlogs the
builder produces; see `docs/12` §"Backlog.md adapter"). It is **not bundled**: `wpm` declares it as a
`peerDependency`, so you install it yourself, globally, alongside `wpm`:

```bash
npm i -g backlog.md        # the required peer — install this first
```

Node.js **>= 20** is also required (`wpm` is an ESM-only package).

> If Backlog.md is missing at runtime, the relevant command will tell you it's needed and point you at
> `npm i -g backlog.md`. (That runtime check ships with the Backlog.md adapter.)

## Getting started — author a work-package

You don't author a work-package by editing files yourself. `wpm` scaffolds an **authoring workspace**
and your **AI agent** authors the deliverable inside it, driving the CLI through a bundled skill. The
first run is five steps:

```bash
# 1. Install wpm and its required peer (see Prerequisites above).
npm i -g work-package-manager backlog.md

# 2. Install the authoring skill into your agent's user skill scope.
wpm skill install

# 3. Scaffold a workspace, then enter it.
wpm init my-handoff
cd my-handoff

# 4. Author through your agent — point it at the workspace and let it work.
#    The agent reads the authoring front door (AGENTS.md) and drives `wpm`
#    against the authoring backlog (.authoring-backlog/) to build out the deliverable under wip/.

# 5. Build the distributable: wpm packages the wip/ deliverable into builds/.
wpm build dry-run        # validate + preview what would ship, producing nothing
wpm build package        # write the distributable archive into builds/
```

**The authoring skill is the authoring-agent's instruction surface.** `wpm skill install` copies the
bundled `installer-builder` skill into the user (personal) skill scope of every supported agent it
detects on your machine (`~/.claude/skills/`, `~/.agents/skills/`, …), so your agent catalogues it at
its next session and knows how to drive the CLI idiomatically rather than guessing from `--help`. It is
**idempotent** — re-run it any time to install or update the skill, and it reports which scopes it wrote
to and whether each was a fresh install or an update. (`wpm init` also reminds you to run it when the
skill isn't present yet.) The workspace's authoring front door points the agent at this skill.

### The authoring workspace layout

`wpm init <name>` creates a workspace that **wraps** the deliverable so the deliverable's own
executor-facing front door never collides with the authoring agent's surface. It has three regions:

```
my-handoff/                  ← the authoring workspace ROOT (authoring-only — never ships)
├── AGENTS.md                ← authoring front door: flips your agent into "author a work-package" mode
├── CLAUDE.md                ← alias of the authoring front door
├── .authoring-backlog/      ← the authoring agent's own work tracker (gitignored, builder-time only)
├── wip/                     ← the DELIVERABLE under construction (manifest, bundles, installer-skills, …)
│   └── _AGENTS.md           ← the deliverable's executor front door (author-owned, build-stripped prefix)
└── builds/                  ← BUILD OUTPUT: the archives `wpm build` writes (gitignored)
```

**Only `wip/` ships.** `wpm build` lifts the `wip/` deliverable, un-nested, to the archive root with its
content unchanged (stripping the reserved `_AGENTS.md` prefix back to the live `AGENTS.md`), and writes
the archive into `builds/`. The wrapper around it — the authoring front door, the `.authoring-backlog/`,
and `builds/` itself — is **never part of any shipped artifact**. So the deliverable is authored under
`wip/`, not at the workspace root, and everything outside `wip/` is authoring-only scaffolding.

## What's in here

```
README.md                 ← you are here
ROADMAP.md                ← direction: where it is today and the version milestones ahead
FAQ.md                    ← "how is this different from X?" — the busy neighbours, answered
AGENTS.md                 ← the development front door: how an agent should build wpm
docs/
  00-foundation-and-lineage.md … 14-lineage-reference.md   ← the design specification (read in order)
  SDLC.md                 ← the build SDLC as a Mermaid sequence diagram
builder-backlog.tar.gz    ← wpm's own foundational dev backlog (33 dependency-ordered tasks)
research/
  research-prior-art.md   ← competitive landscape / prior art
  research-code-quality.md← toolchain & code-quality decisions
```

## Where to start

- **To understand the design:** read `docs/00` first (the model, the core bet, the shared
  vocabulary), then `docs/01`–`docs/14` in order. Forward references are everywhere; follow them only
  when curious.
- **To see how it's positioned:** `FAQ.md` distinguishes `wpm` from skill package managers,
  spec-driven frameworks, autonomous loops, classic installer builders, MCP, plugins, and app
  stores.
- **To see the direction:** `ROADMAP.md`.
- **To build it:** unpack `builder-backlog.tar.gz`, then read `AGENTS.md` (the development front
  door) — it explains reading the docs, initializing the SDLC, and working the 33-task backlog
  bottom-up along the hexagonal core.

## Development

Standard Node + TypeScript (ESM) workflow. After `npm install` (which also installs the git pre-commit
hook):

```bash
npm run build        # clean dist/, then compile src/ → dist/ (tsc; emits sourcemaps + .d.ts)
npm run clean        # remove dist/ (cross-platform; run on its own if you just want a clean slate)
npm run dev          # live-rebuild: tsc --watch, recompiles dist/ on every source change
npm run typecheck    # type-check only (tsc, no emit) — separate from the test run
npm test             # the whole vitest suite (npm run test:unit / test:integration for a split)
npm run lint         # biome check (lint + format check, incl. the core import-boundary rule)
```

To exercise the in-development command **as if it were installed**, link it onto your `PATH`:

```bash
npm run build && npm link    # exposes the `wpm` (and `installer`) commands, pointed at your build
wpm --version                # → the in-progress build's version
npm rm -g wpm                # unlink when done (removes the global symlink)
```

`build` always cleans first, so a rebuild never carries stale output from a since-deleted source, and the
emitted sourcemaps map `dist/*.js` back to the original `src/*.ts` for source-level debugging. See
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for branching, PR, and versioning conventions.

## A note on the word "installer"

`wpm` *builds* an **agent-native installer** — so "installer" appears throughout the docs as a
**category** (contrasted with traditional installers like WiX/MSI in `14`) and as an **install-time
role** (e.g., `installer-skills/` are the skills that run *during* install). That is deliberate and
distinct from the tool's name, which is **`wpm`**.
