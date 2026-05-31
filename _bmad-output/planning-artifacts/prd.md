# PRD — work-package-manager (`wpm`) — BMAD projection shim

> **Authoritative source**: `docs/00-foundation-and-lineage.md` through `docs/05-native-agent-surfaces.md`
> plus the CLI surface in `docs/10-authoring-cli.md`. This file is a BMAD-required projection of those
> documents; it is NOT a second source of truth. Where this file and the docs disagree, the docs win.
> All statements below cite their doc number; consult the referenced doc for the full rationale.

---

## Goals and context  (doc `00`)

`wpm` solves the problem of distributing capabilities to AI agents on machines the author has never seen.
Instead of shipping a deterministic installer, the author ships a **work-package** — a status-tracked
backlog of intent-plus-verification tasks — and the recipient's own agent executes them, adapting to
the environment as it goes. The trade: give up fixed steps, gain an install that bends to reality.

Two invariants flow from this thesis (doc `00` §"New-generation thesis"):
1. **Verification travels inside each bundle** — the bundle carries its own proof of success.
2. **Receipt, not lockfile** — the facts the agent cannot re-derive by inspection are recorded in the
   task records themselves; external state files are not used.

Success metric: an author with domain knowledge and an AI agent can package a capability as a
work-package project, and a recipient's agent can install it on an unknown machine with no bespoke
installer chrome on either side.

---

## Users and roles  (docs `01`/`02`/`03`)

Three roles; no role requires a GUI or wizard screen the builder ships.

| Role | Goal | Surface |
|---|---|---|
| **Author** (`01`) | Package a capability as bundles; own the domain truth, trust/confirmation decisions, and verification acceptance criteria | `wpm` CLI (this product) + their AI agent |
| **End user** (`02`) | Install a capability via their AI agent; make two decisions: which agent to wire and which bundles to select; everything else is silent | Their own AI agent reading the generated work-package |
| **Executing agent** (`03`) | Execute the uniform detect→plan→do→verify→record loop per bundle; write the receipt; respect confirmation levels; survive restart | The generated project's `AGENTS.md` + orchestrator skill |

The author is the only human who directly uses `wpm`; the end user and executing agent interact
with what `wpm` generates, not with `wpm` itself (doc `01` §"The authoring loop").

---

## Functional scope — the `wpm` authoring CLI  (doc `10`)

The product is the `wpm` binary. Its complete command surface is specified in `docs/10-authoring-cli.md`
§"The command tree"; this section names the command groups only.

```
wpm init          — scaffold a new work-package project from a built-in template
wpm template      — list/show available templates (project-local + built-in)
wpm project       — project metadata, version, target-agent list, project-scoped install-time skills, validation
wpm bundle        — create/enable/disable/remove bundles; per-bundle: metadata, version, requires, files,
                    templates, scripts, payload skills, install-time skills, advisor
wpm build         — dry-run / package / publish the project for distribution
```

Design principles governing every command (doc `10` §"Design principles"):
- **One command per author intent**, hiding multi-store implementation details.
- **Structure, not content**: the CLI manages project structure; the agent writes prose via the filesystem.
- **Above Backlog.md**: task operations are not wrapped; the agent invokes `backlog` directly per bundle.
- **Derived artefacts stay current** automatically on every mutating command (no separate `regenerate`).
- **Every command discoverable**: tab completion + `--help` are contract requirements, not nice-to-haves.

---

## Non-functional constraints  (doc `12` §"Engineering decisions"; doc `13` §0)

- **Language and runtime**: Node.js + TypeScript, ESM-only (no CommonJS dual-build). Required because
  Backlog.md (a hard peer dependency) is itself Node.js ESM; sharing the ecosystem keeps the install
  to `npm i -g` (doc `12`).
- **Distribution**: single global npm install — `npm i -g <package-name>`. Backlog.md is a `peerDependency`,
  not bundled. No plugin system, no registry, no telemetry, no login (doc `12` §"Distribution").
- **Core boundary** (doc `13` §0, enforced by a `noRestrictedImports` Biome rule): nothing under
  `src/core/` may import the CLI framework, subprocess library, or OS/file-system modules. The core
  is pure; effects live behind injected ports. This invariant is a fixed principle; the specific
  module shapes that realize it are refinable.
- **SDLC-agnosticism**: the builder's own development method must not appear anywhere in `src/core/`
  (doc `13` §0). The Backlog.md authoring-backlog pattern, BMAD, etc., are building-time concerns.
- **Testing**: vitest (TS-native, ESM-friendly); three flavors — unit (pure logic, no I/O), integration
  (real command sequences in tmpdir), snapshot (rendered AGENTS.md/SKILL.md stability) (doc `12`).
- **CI**: GitHub Actions, matrix on Node LTS × {Linux, macOS, Windows}; three-command gate —
  `biome ci`, `tsc --noEmit`, `vitest` (doc `12`; enforced via task-8 in FOUNDATION.md).

---

## Out of scope  (doc `12` §"What's deliberately not in the architecture (yet)")

The following are explicitly excluded from v1 and are future-conversation items, not missing pieces:

- No plugin system (third-party runtime command loading).
- No telemetry, analytics, or opt-in error reporting.
- No template registry, `template add/publish/update`, or shared template marketplace.
- No language bindings (TypeScript only; the doc set 00-14 is the language-neutral spec for others to re-implement).
- No GUI or web UI (`wpm dashboard`). The CLI, `--help`, tab completion, the agent skill, and the docs are the whole UX.

---

## Success criterion

Success is the **walking skeleton defined by task-33 in FOUNDATION.md** — the 33-task foundational
backlog (epic-1) culminating in a runnable `wpm` binary that proves the layered architecture composes
end-to-end. The foundational tasks are grouped in phases (see `FOUNDATION.md`): Phase A (repo/toolchain,
tasks 1–9), Phase B (domain model and ports, 10–15), Phase C (services, 16–22), Phase D (operations
and lifecycle, 23–28), Phase E (CLI adapter and content, 29–32), Phase F (walking skeleton, 33).

All 33 tasks must pass the project-level Definition of Done: typecheck clean, Biome clean, tests green,
no core-boundary violation. That gate is itself dogfooded via Backlog.md tracking the builder's own
development (doc `12` §"Dogfooding").

---

*PM specialist: John (BMAD) — Phase 2 conformance review against docs/00–05 + 10.*
*Written 2026-05-31. Revision policy: update only when a committed doc changes; treat the referenced docs as authoritative.*
