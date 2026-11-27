# Native agent surfaces & skill roles (distilled from `docs/05-native-agent-surfaces.md`)

How an AI agent *discovers* and *acts on* what you ship — the rules that decide whether a skill ever fires, and
where each kind of skill must live. Place skills by role; a misplaced skill is silently inert.

> Source: distilled from `docs/05-native-agent-surfaces.md` (skill discovery + the five roles), reconciled with
> the epic-3 build truth. The author-owned front-door mechanic is in `conventions.md` — referenced, not
> repeated, below.

## The surfaces compose as layers

An agent meets a project through a few *native* surfaces; they stack rather than compete:

- **`AGENTS.md`** — auto-read context: recognition + the install loop (the front door).
- **A skill** (`SKILL.md` folder) — a model-invoked capability: the installer, advisors, helpers, the payload.
- **CLI / MCP** — how the executor operates each bundle's backlog and changes the environment.
- **The plain-markdown backlog** — the irreducible floor *and* the one stateful substrate the others lack:
  per-task status + acceptance criteria are what make an install resumable. The skill carries capability, the
  backlog carries state, the manifest carries the selection contract — compose them, don't conflate them.

## Discovery is location-bound

- An agent catalogues a skill **only from a scanned scope, at session start**, and fires it **only when a
  prompt matches the skill's `description`** — the description is the load-bearing match field, so write it to
  the *trigger*, not the implementation.
- A skill anywhere else is **inert** until placed or symlinked into a scanned scope — and one **cloned into a
  scope mid-session won't activate until the session restarts.** (This is why an install *relocates* a skill:
  the move into a scanned scope is the product landing.)
- Each agent scans **cwd → up to repo root, plus one personal scope.** `.agents/skills/` is the consolidating
  cross-tool standard (Codex + Hermes); add `.claude/skills/` and `.openclaw/skills/` as symlink aliases to one
  canonical dir. Skills compose as a **union** up the tree — a bundle's scope lights up *in addition to* the
  root's when that bundle is the cwd.

| Agent | Repo / project scope | Personal scope |
|---|---|---|
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| Hermes | `~/.agents/skills/` (+ native "tap") | `~/.hermes/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| OpenClaw | `.openclaw/skills/` | `~/.openclaw/skills/` |

## The five skill roles — place each by role

| Role | What it is | Where it lives | Triggers on |
|---|---|---|---|
| **Installer** | orchestrates the whole-project install loop; project-named | `installer-skills/{project}-installer` | "install this project" |
| **Vendored discipline** | a third-party skill copied in to *enforce* a workflow (pinned, license kept; not authored) | `installer-skills/` | its own upstream description |
| **Advisor** | pull-UX: recommends a bundle *before* install; one per bundle (auto-scaffolded) | `installer-skills/{bundle}-advisor` — **root-scoped** | the user's *need* |
| **Install-time helper** | a reusable mid-install helper, not an orchestrator | project- or `bundles/<id>/installer-skills/` | its own description, during install |
| **Payload** | the delivered product; install copies it into scope | `bundles/<id>/payload/agent-skills/` — **non-scanned** | the bundle's *runtime* use |

Roles 1–4 are install-time and get scanned-scope **alias symlinks**. Role 5 (payload) deliberately gets **no
alias** — so it can't fire *before* install; the install moving it into a scanned scope is what lands it. The
advisor is root-scoped (not per-bundle) so it's catalogued *before* any bundle is entered; bundle-scoped
`installer-skills/` are helpers only.

## Two placement traps

- **Never a bare `skills/`** at any level, root or bundle — Hermes and "tap" tooling seed it and would fire
  things unbidden. Use only the role-named dirs above, with `installer-skills/` reached via the scope aliases.
- **Never put a payload skill in a scanned scope** (or give it an alias): it would activate before its bundle is
  installed. Payload stays nested under `payload/agent-skills/` — a name chosen so it matches no scope convention.

## The executor front door & per-target aliases

The shipped artifact's recognition surface is **`AGENTS.md`** at the archive root — auto-read at session start,
no registration, carrying recognition + kickoff + the install loop. Per **target agent** the build adds an alias
beside it: `CLAUDE.md` (claude-code), `GEMINI.md` (gemini); agents that read `AGENTS.md` natively get none. The
alias set = exactly `manifest.targets`. The same front-door mechanic recurs per bundle
(`bundles/<id>/AGENTS.md`, closest-wins).

You never author those names. You write the **author-owned `_AGENTS.md`** (reserved leading-underscore); the
build strips it to `AGENTS.md` and creates the aliases. That reserved-prefix mechanic and *why* it exists are in
`conventions.md` §"The deliverable executor front door is `_AGENTS.md`" — read it there; this page adds only the
surfaces/roles model around it.
