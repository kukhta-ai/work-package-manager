# Product Brief — work-package-manager (`wpm`)

> **BMAD SHIM — NOT A SOURCE OF TRUTH.**
> The authoritative product brief for this project is **docs/00–05** (committed design documents).
> This file is a BMAD-required projection of those docs, produced so BMAD tooling has a `product-brief.md`
> artifact to consume. On any conflict between this file and docs/00–05, the docs win.
> Source citations are in parentheses throughout.

---

## Problem

Getting software onto someone else's machine has always been hard because you can't see their machine.
Installers and package managers spent decades solving this for deterministic software — fixed steps producing
fixed artifacts. Two things have now changed: what people increasingly want installed is **capabilities for
their AI agent** (skills, integrations, tools, setups), and the person on the other end has a capable,
general-purpose agent of their own. (docs/00 §"What this is, and why")

Traditional setup scripts and installers break when the target environment is unknown — which is always.
There is no first-party tool for distributing structured, verifiable capability-setup instructions that a
user's agent can execute, adapting to their specific machine, while still guaranteeing the author's intent
was met. (docs/00 §"What this is, and why")

---

## Core Thesis

Instead of shipping finished software or a brittle setup script, you ship a **package of backlog bundles**:
structured instructions, each paired with acceptance criteria, and the **user's own agent executes them** to
stand the capability up in their environment. The bet: *intent plus verification, executed by a reasoning
agent* beats *fixed steps, executed by a dumb engine* exactly when the target environment is unknown.

The agent adapts to the machine in front of it; the verification proves the adaptation worked. You give up
determinism; you gain an install that bends to reality instead of breaking on it. (docs/00 §"The new-generation thesis")

---

## Product

**`wpm` (work-package-manager)** — a single Node.js + TypeScript package distributed via npm that provides:

1. **The `wpm` CLI binary** — the authoring surface (fully specified in docs/10).
2. **Built-in project and bundle templates** — scaffolded by `wpm init` / `bundle new`; they carry the
   instructional content (orchestrator skill, front-door text, per-task workflow) that makes generated
   installs work. (docs/12 §"What the installer-builder is")
3. **The builder's own agent skill** (`installer-builder/SKILL.md`) — packaged alongside the CLI so an
   agent reading it knows how to drive the CLI to author a bundle-project. The meta-skill that closes the loop.
   (docs/12 §"What the installer-builder is")

The CLI is the **agent's tool**, not a screen a human operates directly. Both the author and the end user
act through their own agents; neither touches bespoke installer chrome. (docs/01 §intro)

---

## The Three Roles

**Author** (docs/01) — A person who wants to package and distribute a capability for others to install.
They work through an authoring agent in conversation, driving the `wpm` CLI. They own three decisions:
the trust gradient per step (pinned reference vs. adaptive intent), verification as the bundle's organizing
principle, and confirmation level per step. The authoring agent draws out their tacit knowledge and shapes
it into a bundle (detect → setup → verify), reviewing with the author before anything is final.

**End user** (docs/02) — A person who wants to install a capability onto their machine. They never touch a
UI this project built; they work through their own AI agent in ordinary conversation. The agent offers
bundles by their human-readable `summary` field, derives dependencies silently, previews the plan for
consent, narrates progress at the bundle level, handles human-in-the-loop pauses, and closes with a
how-to-use summary. After install, the project is re-enterable: add a bundle later, update, repair,
or uninstall without disturbing unrelated bundles.

**Executing agent** (docs/03) — The end user's AI agent, which actually runs the install. The package gives
it: a front door (one entry file explaining the model and loop), a selection protocol (resolve `requires`
transitively, version-check, produce order), a uniform per-bundle loop (detect → plan → do → verify →
record), and explicit boundaries (don't touch other bundles, don't assume undeclared prerequisites, only
reverse what was installed). The receipt — written into task records as execution proceeds — is what keeps a
forgetful executor honest across runs, repairs, and uninstalls.

---

## Explicit Out-of-Scope (v1)

The following are future-conversation items, not missing pieces. (docs/12 §"What's deliberately not in the architecture")

- **No plugin system** — third-party commands cannot be loaded at runtime.
- **No telemetry** — no usage pings, no error beacons, no analytics.
- **No template registry or sharing** — templates resolve from project-local → built-in only; no hub, no
  marketplace, no `template publish`.
- **No language bindings** — TypeScript only; docs/00–14 are the language-neutral spec for re-implementations.
- **No GUI / web UI** — CLI, `--help`, tab completion, the agent skill, and the design docs are the whole UX.

---

## Cross-References (canonical docs)

| Topic | Canonical source |
|---|---|
| Model, thesis, vocabulary | docs/00 |
| Author experience + authoring loop | docs/01 |
| End-user experience + maintenance | docs/02 |
| Executing agent protocol | docs/03 |
| Authoring agent protocol | docs/04 |
| Native agent surfaces (AGENTS.md, skills) | docs/05 |
| Project/bundle artifact structure | docs/06 |
| Install contract | docs/07 |
| Versioning and migrations | docs/08 |
| Installation process end-to-end | docs/09 |
| Authoring CLI surface | docs/10 |
| Authoring process | docs/11 |
| Builder project architecture | docs/12 |
| Builder core (internal) architecture | docs/13 |
| Installer/package-manager lineage | docs/14 |
