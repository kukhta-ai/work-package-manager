# Story task-7 — Establish the build and dev workflow

> Lean implementation spec (BMAD create-story output). Refines task-1's scripts per `docs/12`
> §"Development workflow" + §"Distribution". Mostly script + manifest + README work; no src logic.

## Acceptance criteria (the contract)
1. A clean build leaves no artefacts from a previous build, and source-level debugging maps back to the
   original source.
2. A developer can run a live-rebuilding mode while working.
3. A developer can exercise the in-development command as if it were installed.
4. Backlog.md is treated as an external prerequisite, not bundled, and a user missing it is told how to
   obtain it (doc 12).

## What exists (refine, don't rebuild)
- Scripts: `build` = `tsc -p tsconfig.build.json`, `dev` = `tsc -p tsconfig.build.json --watch`,
  `typecheck`/`test*`/`lint`/`format`/`prepare`. No `clean`. No `peerDependencies`.
- `tsconfig.build.json` already emits `sourceMap` + `declarationMap` (task-1); `dist/*.js.map` exist and
  must reference `../src/*.ts`.
- backlog.md latest = `1.45.2` (the repo's pinned global). Pre-commit hook is live → keep `biome` clean.

## Approach / deliverables
1. **Clean build (AC#1).** Add a **cross-platform** `clean` script (Windows CI too — NO bare `rm -rf`):
   dep-free node one-liner `node -e "require('node:fs').rmSync('dist',{recursive:true,force:true})"`. Make
   `build` clean first: `"build": "npm run clean && tsc -p tsconfig.build.json"` so a build never carries
   stale artefacts (incl. outputs of since-deleted sources). Keep `dev` NOT cleaning (watch shouldn't nuke
   on each start). Confirm `sourceMap`/`declarationMap` produce `dist/*.js.map` whose `sources` = `../src/
   *.ts` (source-level debugging maps back). PROVE AC#1: build, add a throwaway `src/_stale_probe_.ts`,
   build (its `.js` appears), delete the source, `npm run build`, show the stale `dist/_stale_probe_.js` is
   gone.
2. **Live-rebuild (AC#2).** `dev` = `tsc -p tsconfig.build.json --watch` already; VERIFY it rebuilds on a
   source edit (run watch in background, touch a source, confirm dist updates, kill it). Dep-free tsc watch
   is sufficient — no nodemon/tsx.
3. **Run as if installed (AC#3, doc 12 `npm link`).** Verify `npm run build && npm link` then `wpm
   --version` / `installer --version` → `0.1.0`; then `npm rm -g wpm` to leave no global state. If `npm
   link` is sandbox-blocked, fall back to `npm install -g --prefix <tmp> .` (task-1 proof) and document the
   `npm link` workflow. Add a short **Development** section to README documenting build/dev/link.
4. **Backlog.md as external peer (AC#4, doc 12).** Add `"backlog.md": ">=1.0.0"` to **`peerDependencies`**
   (NOT `dependencies` — must not bundle; doc 12). Add `peerDependenciesMeta: { "backlog.md": { optional:
   false } }` to be explicit it's a required peer the user installs. Add a **Prerequisites** section to
   README: Backlog.md is a required peer, installed separately with `npm i -g backlog.md`; the builder
   shells out to its CLI (doc 12 §"Backlog.md adapter"). NOTE the boundary: the runtime "missing backlog.md
   → how to install" CHECK is task-14 (the adapter); task-7 = the peer declaration + README guidance.

## Gate / DoD
- `tsc --noEmit` clean, `biome check .` clean (hook enforces), `vitest run` green. New scripts documented
  (their purpose); no dead code. README edits are markdown (outside lint/type/test).

## Boundaries (do NOT do here)
- No runtime backlog.md detection (task-14). No `build` package/publish command or `release.yml` (later).
  Don't add nodemon/tsx. Don't edit `docs/`, `AGENTS.md`, `backlog/`, `.bmad/`, task-5's `biome.json`/
  boundary test, or the package `name` (the README's `work-package-manager` vs manifest `wpm` naming
  tension is out of scope).
