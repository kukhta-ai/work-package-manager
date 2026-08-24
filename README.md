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

> **Public distribution is inactive.** No npm coordinate or GitHub release channel has been approved or
> published. `wpm` is the local product and command name, not a claim that an npm package named `wpm` or
> `work-package-manager` is publicly obtainable.

- **public package:** inactive; coordinate unresolved · **local command:** `wpm`

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
and your **AI agent** authors the deliverable inside it, driving the CLI through a bundled skill. Until
later distribution activation is approved, the first run starts from a checked-out source tree:

```bash
# 1. Prepare the local WPM command and its required peer.
npm install
npm run build
npm link
npm i -g backlog.md

# 2. Configure exactly the personal authoring clients you authorize.
wpm authoring setup --client codex
# Repeat --client claude-code on the same command to configure both.

# 3. Scaffold a workspace using those retained authoring-client defaults, then enter it.
wpm init my-handoff
cd my-handoff

# 4. Author through your agent — point it at the workspace and let it work.
#    The agent reads the authoring front door (AGENTS.md) and drives `wpm`
#    against the authoring backlog (.authoring-backlog/) to build out the deliverable under wip/.

# 5. Build the distributable: wpm packages the wip/ deliverable into builds/.
wpm build dry-run        # validate + preview what would ship, producing nothing
wpm build package        # write the distributable archive into builds/
```

**Personal setup is explicit consent, not agent detection.** `wpm authoring setup` installs exactly one
`wpm-create-package` skill into each selected personal scope (`~/.agents/skills/` for Codex and
`~/.claude/skills/` for Claude Code). Repeat `--client` for the complete selection, or omit it only in a
direct terminal to use the two-client chooser and one combined confirmation. Re-running reports each scope as
installed, unchanged, updated, or migrated and preserves unrelated personal content. The selected IDs become
defaults for a later `wpm init`; explicit `wpm init --authoring-client …` flags always replace those defaults.
The old detected-all `wpm skill install` entry point is retired and performs no write.

After setup, invoke `$wpm-create-package` in Codex or `/wpm-create-package` in Claude Code for the guarded
workspace bootstrap flow. Personal setup itself does not create a workspace or claim a prepared handoff.

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

### Declaring additional template authoring work

A project or bundle template may declare an inert, revisioned list of **additional** authoring tasks in its
`template.yml`. `wpm template show <name> --scope project|bundle` previews the contribution; inspection never
creates a project, bundle, or Backlog task. A contribution cannot replace or disable WPM's mandatory work.

```yaml
name: example
scope: project
revision: "rev-1"
authoring-tasks:
  - key: collect-license
    title: "Collect license for {{wpm.project.name}}"
    acceptance-criteria:
      - "The license for {{wpm.project.name}} is recorded"
    depends-on:
      - wpm:project:set-metadata
```

Keys are lowercase kebab-case and local to one template producer and revision. `self:<key>` names another
task in the same contribution. Mandatory dependencies use the documented stable references below; raw task
titles and Backlog IDs are not references.

- Project: `wpm:project:set-metadata`, `wpm:project:confirm-target-agents`,
  `wpm:project:verify-manifest`, `wpm:project:verify-scope-aliases`,
  `wpm:project:verify-front-door`, `wpm:project:verify-helpers-and-advisors`,
  `wpm:project:bump-release-version`, `wpm:project:build-dry-run`.
- Bundle: `wpm:bundle:plan`, `wpm:bundle:fill-install-backlog`, `wpm:bundle:author-payload`,
  `wpm:bundle:scaffold-payload-skill`, `wpm:bundle:verify-step-slugs`, `wpm:bundle:verify-dod`,
  `wpm:bundle:verify-payload-references`, `wpm:bundle:verify-skill-registration`,
  `wpm:bundle:verify-version-constraints`, `wpm:bundle:review-install-backlog-independence`,
  `wpm:bundle:simulate-fresh-install`.

Task text is literal except for WPM-provided context. Project contributions may use
`{{wpm.project.name}}`; bundle contributions may additionally use `{{wpm.bundle.id}}` and
`{{wpm.bundle.version}}`. These are separate from scaffold parameters: prompts, hooks, executable
interpolation, arbitrary template parameters, and cross-template dependencies are unsupported. Generic
inspection renders symbolic previews (`<project-name>`, `<bundle-id>`, `<bundle-version>`) and reports all
declaration, context, collision, dependency, and cycle findings together.

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
npm run package:inspect -- --revision HEAD  # clean-build, pack, and inspect the local npm boundary
npm run package:verify-install -- --report ../wpm-package-report.json  # install the accepted archive freshly
npm run package:prepare-candidate -- --inspection ../wpm-package-report.json --install ../wpm-install-report.json --quality ../wpm-quality-report.json --tag <proposed-tag> --notes ../release-notes.md --output ../wpm-candidate
npm run package:assess-github -- --candidate ../wpm-candidate --policy ../github-policy.json --observation ../github-observation.json
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

`package:inspect` is local, non-publishing preparation: it requires a clean checkout at the requested Git
revision, creates a fresh build, inspects the actual `.tgz`, and reports its exact paths and metadata. It does
not activate a public package coordinate or create tags, releases, registry writes, or remote state.

To prove the consumer journey, save the inspection report outside the clean checkout, then pass that report to
`package:verify-install`. For example, run `npm run package:inspect -- --revision HEAD --output
../wpm-package-evidence > ../wpm-package-report.json`, followed by the verification command above. Verification
freezes those inspected archive bytes, installs them into a disposable HOME/workspace/global prefix, invokes
every declared executable, resolves the declared package paths, and confirms installation did not change
representative Codex or Claude Code configuration. It remains local and non-publishing.

After saving the verifier's JSON output and a local accepted quality report, `package:prepare-candidate`
persists one exact archive, its SHA-256/SHA-512 digests, the inspection/quality/install evidence, and a
release-note preview. Repeating the same binding reuses its stable candidate identity; changed evidence is
reported without replacing it. The record explicitly remains inactive and release-ineligible, and the command
has no tag, release, registry, trust, credential, or remote-write capability.

`package:assess-github` revalidates that persisted candidate and compares it with caller-supplied local GitHub
policy and observation JSON. Its structured report lists the exact required tag, draft metadata, asset,
checksums, notes/evidence, missing work, matches, unverifiable facts, and hard conflicts. It only reads those
inputs: matching state is reused in the report, while activation remains disabled and no Git or GitHub object
is created or changed.

## A note on the word "installer"

`wpm` *builds* an **agent-native installer** — so "installer" appears throughout the docs as a
**category** (contrasted with traditional installers like WiX/MSI in `14`) and as an **install-time
role** (e.g., `installer-skills/` are the skills that run *during* install). That is deliberate and
distinct from the tool's name, which is **`wpm`**.
