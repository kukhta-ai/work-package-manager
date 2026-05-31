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

## A note on the word "installer"

`wpm` *builds* an **agent-native installer** — so "installer" appears throughout the docs as a
**category** (contrasted with traditional installers like WiX/MSI in `14`) and as an **install-time
role** (e.g., `installer-skills/` are the skills that run *during* install). That is deliberate and
distinct from the tool's name, which is **`wpm`**.
