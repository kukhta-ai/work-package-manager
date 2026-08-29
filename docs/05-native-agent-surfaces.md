# 05 · Native Agent Surfaces

The channels through which an AI agent discovers and acts on a project — catalogued, described, and weighed for a bundle-project. *(Current as of 2026; the agent-tooling landscape moves fast.)*

## How to read this

An agent meets a project through a small set of *native* surfaces. "Native" has two axes that don't always agree:

- **Auto-discovery** — does the agent find it on its own, without being told?
- **Reach** — does it work across many agents, or only one tool?

Each surface also serves one or both of two jobs: **identify** (recognize the project and orient) and **use** (actually operate it). The surfaces aren't rivals — they're layers. Roughly: AGENTS.md is *context*, a Skill is a *capability*, MCP is a *connection*, the CLI is an *interface*, and the markdown backlog is the *substrate*. A real bundle-project uses several at once.

## At a glance

| Surface | How the agent meets it | Identify / Use | Reach | Role in a bundle-project |
|---|---|---|---|---|
| **AGENTS.md** (CLAUDE.md / GEMINI.md) | Auto-loaded at session start, below the system prompt | Identify + orient | Broadest open standard | The front door — announces "this is installable, here's the loop" |
| **Agent Skill (SKILL.md folder)** | Model-invoked on description match; progressive disclosure | Both | Open standard, 26+ platforms | The install procedure as a portable capability, with bundled scripts |
| **MCP server** | Connects, then calls tools / reads resources | Use (resources orient) | Broad | Structured operations on each bundle's backlog |
| **CLI (via shell)** | Shells out; learns from `--help` or instructions | Use | Universal | Backlog ops *and* the environment changes |
| **Plain-markdown backlog** | On-demand file read | Use (presence = signature) | Universal | The irreducible floor — always readable |
| **Slash / custom commands** | Explicit invocation | Identify / trigger | Tool-specific | Ergonomic kickoff; convenience layer |
| **Subagents** | Orchestrator-spawned, isolated context | Use / orchestration | Tool-specific | One subagent per bundle for context isolation |

## The surfaces

### AGENTS.md (and CLAUDE.md / GEMINI.md variants)

A plain-markdown file at the repo root that tells agents how to work in the project — a "README written for agents rather than humans." It is an open standard stewarded under the Linux Foundation's Agentic AI Foundation.

The agent **reads it automatically at session start**, where it sits just below the system prompt as an ambient context layer — no prompting required. Its reach is the broadest of any surface: supported by Codex, Gemini CLI, Cursor, GitHub Copilot agent mode, Windsurf, Zed, Aider, Jules, Devin and others, with Claude Code using the sibling `CLAUDE.md` (the two can be symlinked). A useful property for multi-bundle work is **"closest file wins"** — nested AGENTS.md files scope to their subdirectory.

This is the natural **front door**. Because it is auto-read on entry, it is where you announce that the repository is an installable bundle-project, point to the manifest, and state the loop the agent should follow. The nesting rule maps directly onto per-bundle scoping: each bundle root can carry its own AGENTS.md without leaking into its neighbors.

### Agent Skills (SKILL.md folders)

A portable folder containing a `SKILL.md` file (YAML frontmatter plus markdown instructions) and optional supporting directories. It teaches an agent a *capability* — a workflow, domain expertise, or a packaged procedure. Originally created by Anthropic, it is now an open standard adopted across 26+ platforms.

Engagement is **model-invoked through progressive disclosure**: at startup the agent reads only each skill's name and description (about 30–50 tokens apiece); when a prompt semantically matches the description, the full SKILL.md body loads; supporting files load only when the instructions reach for them. Reach is broad and growing — Claude Code, Codex CLI, Gemini CLI, Copilot/VS Code, Cursor, OpenClaw, Hermes, Cline, OpenCode and more.

A skill can do **both jobs**: a skill whose description triggers on "install / set up X" recognizes intent, and its body plus bundled scripts carry out the work. For a bundle-project it is the natural home for the install procedure and its detection/verification helpers. The one caveat: skills are loaded at session start, so a skill *freshly cloned inside a repo mid-session* will not activate until the session restarts — which makes it better suited as a capability the user installs ahead of time than as a clone-and-run entry point. (Full folder anatomy below.)

### MCP (Model Context Protocol) servers

A protocol that exposes tools, resources, and prompts to an agent over a server connection. It was donated by Anthropic to the Linux Foundation in December 2025 and is broadly supported.

The agent **connects to the server and then calls its tools or reads its resources** — which means a connection/registration step must happen first. Backlog.md ships its own MCP server (`backlog mcp start`) that exposes task operations and a workflow resource the agent can read.

This is the richest *structured* way to **use** a bundle's backlog: requesting the next unblocked task, updating status, or reading the manifest as a resource, all through typed tools rather than parsed text. The price is the one-time setup to stand the server up and connect it. One constraint to know: Backlog.md has a **fixed task schema with no custom fields**, so the install receipt rides in the existing typed fields (file refs, acceptance criteria, dependencies) plus labels for enumerable facts (ownership, deferral) and a structured notes block for the irreducibly free-form residue (an undo command, a checksum, a decision) — never bespoke frontmatter keys, which the tool would normalize away.

### CLI (via the shell tool)

A command-line tool the agent drives through its shell/bash capability, learning the commands from `--help` or from AGENTS.md/skill instructions. Every coding agent has shell access, so reach is **universal**.

This is the workhorse, and it covers two distinct needs: operating the backlog (`backlog task list --plain`, where `--plain` is the agent-friendly mode) *and* the environment-changing work — installing Chromium, editing config — that is not a backlog operation at all. It has the lowest friction of any "use" surface because there is nothing to stand up. The common rule of thumb: reach for MCP when wrapping structured systems and APIs, and for the CLI when the tool already has a mature command interface.

### The backlog as plain markdown (direct file read)

The task files themselves — markdown the agent reads with its native file tools, no CLI, MCP, or skill required. Reach is **universal** because file reading is.

This is the **irreducible floor**: even an agent with no support for any other surface can read the tasks and reason over them, and the mere presence of a `backlog/` folder is itself a recognition signature. The tradeoff is that editing the files directly can drift their metadata, so writes should still go through the CLI or MCP where available.

### Slash / custom commands

Named commands the user (or agent) invokes explicitly, defined as files such as Claude Code's `.claude/commands/*.md`. Engagement is **explicit invocation**, and reach is **tool-specific** — there is no unified cross-agent standard.

Useful as an ergonomic trigger (`/install-handoff`), but a convenience layer rather than a backbone, precisely because it does not travel across agents.

### Subagents

Specialized worker agents an orchestrator spawns with isolated context — Claude Code's `.claude/agents/*.md` and the Task tool, with analogues elsewhere. Reach is **tool-specific**, though the pattern recurs across tools.

The interesting fit is **orchestration**: running each bundle in its own subagent keeps that bundle's context isolated, a natural match for the per-bundle isolation principle. This is an advanced execution technique, not a recognition mechanism.

## Agent Skills, in depth

The folder anatomy is worth its own section because it is the surface that most directly realizes the "code + scripts + instructions" combination.

**The only required file is `SKILL.md`.** Everything else is optional and can be arranged freely. A representative real skill looks like this:

```
pdf/
├── SKILL.md      ← required: frontmatter + instructions
├── REFERENCE.md  ← reference doc, loaded only when needed
├── FORMS.md      ← reference doc, loaded only when filling forms
├── LICENSE.txt
└── scripts/      ← executable helpers the agent runs directly
    ├── fill_pdf_form_with_annotations.py
    ├── extract_form_structure.py
    └── … (several more)
```

**Frontmatter fields** (the block must be the very first content, fenced by `---`):

| Field | Required? | Purpose |
|---|---|---|
| `name` | Required | Unique id; lowercase-with-hyphens; matches the folder name |
| `description` | Required | When to activate — the load-bearing field the agent matches against |
| `version` | Optional | Semantic version |
| `author` | Optional | Creator |
| `tags` | Optional | Categorization |
| `agents` | Optional | Explicitly compatible agents |
| `license` | Optional (common) | Terms; used by production skills |

Everything after the closing `---` is the **instruction body** the agent follows once the skill is active. Conventional optional directories are `scripts/`, `references/`, `templates/`, `examples/`, and `assets/`, but the structure is free-form.

**Progressive disclosure** is the mechanism that makes the folder contents matter: name + description always resident (cheap), full body on match, supporting files on demand. This is why an agent can keep many skills installed and pay for each only when it fires.

**Where skills live (verified; canonical table — `06` references this).** Skills are discovered per agent by walking from the working directory up to the repo root, plus a personal scope:

| Agent | Repo / project scope | Personal scope |
|---|---|---|
| Codex | `.agents/skills/` (cwd up to repo root) | `~/.agents/skills/` |
| Hermes | reads `~/.agents/skills/`; native "tap" distribution | `~/.hermes/skills/` |
| Claude Code | `.claude/skills/` (start dir up to repo root) | `~/.claude/skills/` |
| OpenClaw | `.openclaw/skills/` | `~/.openclaw/skills/` |

`.agents/skills/` is the consolidating cross-tool standard — already read by both Codex and Hermes — so treat it as the primary shared scope and add `.claude/skills/` and `.openclaw/skills/` as agent-specific aliases (symlinks to one canonical dir, the same pattern as AGENTS.md/CLAUDE.md). Naming is strict: the folder is lowercase-with-hyphens and the file is exactly `SKILL.md` (case-sensitive). A plain SKILL.md works everywhere; individual tools extend it (Codex adds a metadata file, Claude Code adds context forking).

## Discovery is location-bound — and five skill roles follow

An agent catalogues only the SKILL.md files sitting in its scanned scopes *at session start*. A skill anywhere else is inert until it is placed or symlinked into a scanned scope — and a skill freshly cloned into a scope mid-session won't activate until the session restarts. This single fact shapes how a bundle-project uses skills, and it produces five distinct roles, each with a different trigger discipline:

- **Installer skill** (`{project-name}-installer`, in `installer-skills/`) — its description triggers on "install this project"; it orchestrates the loop. Project-named so two installed projects don't collide in a shared scope.
- **Vendored discipline skill** (any name, in `installer-skills/`, optional) — a *third-party* skill the author copies in to enforce a workflow the executing agent would otherwise only be told to follow: e.g. obra's superpowers (MIT) skills like `test-driven-development` or `code-review`, or skills from BMAD-METHOD / Spec Kit. We don't author these; the author chooses whether to vendor any, pins the version, and keeps the upstream license. They activate on their own description triggers like any install-time skill. This is how "the agent follows the workflow" becomes enforcement rather than hope — by reusing what the ecosystem already built, not reinventing it (`06`, `09`).
- **Advisor skill** (`{bundle-id}-advisor`, also in `installer-skills/`) — its description triggers on the user's *need*, recommending the bundle that would deliver what they're trying to do, before it's installed. This is the "pull" UX, which is why advisors must live in a scope catalogued at session start, before any bundle is entered. Advisors are optional and one-per-bundle; `bundle new` auto-scaffolds one unless told `--no-advisor`.
- **Install-time helper skill** (any name, in `installer-skills/` at project scope or `bundles/<id>/installer-skills/` at bundle scope) — a skill the executing agent reaches for *during* the install: not an orchestrator and not pull-UX, but a reusable helper like `detect-package-manager` or `request-elevated-permission`. Project-scoped helpers are always catalogued; bundle-scoped ones activate when that bundle is in focus. Managed by `project installer-skills` / `bundle <id> installer-skills` (`10`).
- **Payload skill** (in each bundle's `payload/agent-skills/`) — the delivered product; its description triggers on the bundle's *runtime* use, never on install. It stays in a non-scanned path so it can't fire early, and the install copies it into a scanned scope — that relocation *is* the product landing.

Install-time skills (installer, vendored discipline, advisor, helper) get scanned-scope aliases; payload skills deliberately do not. And nothing is ever placed in a bare `skills/` directory, which Hermes and tap tooling would seed. The front-door and install-time-skill mechanics also recur per bundle, because a bundle is its own working root (its own Backlog.md root, operated as cwd) — so bundle-local install helpers activate exactly when that bundle is in focus.

## Choosing for a bundle-project

No single surface does everything; the right design stacks them.

Use **AGENTS.md** as the recognition front door, since it is the one surface auto-read on entry and the most portable. Use the **CLI and/or MCP** to operate each bundle's backlog and to make the environment changes, with the **plain markdown** underneath as the floor that survives any agent. Reach for a **Skill** to package the install procedure and its scripts as a reusable capability, and consider **subagents** to run bundles in isolated contexts. For unattended execution, the project can vendor an agentic-loop *runner* — a Ralph plugin for Claude Code or Codex (`snarktank/ralph` and the like), which carries its own loop script and manifest — driven by the plain `RALPH-LOOP.md` prompt doc the project authors (`06`, `09`); and for enforced workflow, vendored discipline skills (superpowers and the like). All are install-time conveniences the author opts into, not discovery surfaces.

That leaves two distribution models. The **project-first** model ships a repo whose root AGENTS.md is auto-read the moment the user points an agent at the folder — most reliable for "here's a repo, install it now." The **capability-first** model ships the installer itself as a Skill the user adds to their agent ahead of time. The elegant combination is a small, portable `{project-name}-installer` Skill — triggered by "install this bundle-project" — that knows to go read the target repo's AGENTS.md and follow its loop, with per-project AGENTS.md and manifest in each repo, and `{bundle-id}-advisor` skills supplying the pull-UX that suggests a bundle before it's installed.

Two things to keep in view. First, **the backlog is the one layer none of these surfaces provides on its own**: a SKILL.md body or an AGENTS.md is prose instructions, not a stateful task graph with statuses and acceptance criteria. The skill carries the capability and code; the backlog carries the state; the manifest carries the selection contract. They compose, but conflating them loses the per-task status that makes an install resumable. Second, **bundling executable scripts is where the supply-chain risk lives** — a skill that runs code on the user's machine is exactly the surface the ecosystem is now building security scanners and audit practices around, which argues for keeping scripts minimal, legible, and surfaced in the plan-preview rather than hidden.
