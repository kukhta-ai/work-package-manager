# Story task-91: Deliver the authoring skill into the agent skill scope

Status: ready-for-dev

<!-- Created by driving bmad-create-story from the design docs (stated fallback): task-91 lives in the
     Backlog.md `backlog/` root, not in the epic-1 sprint-status mirror, so the skill's sprint-driven
     auto-discovery cannot select it. Per CLAUDE.md "How the doc-set maps onto BMAD", the planning
     artifacts are docs/00-14; this story is steered from docs 12/10/05 + the task ACs. sprint-status.yaml
     is intentionally NOT mutated. -->

## Story

As an **authoring agent's human author** who has just installed `wpm`,
I want a command that copies the bundled `installer-builder` authoring skill into my agent's user (personal) skill scope, and an `init` that points me at it,
so that my agent can drive the CLI *idiomatically* — the distribution gap doc 12 calls out (the skill ships in the npm package but never reaches the agent) is closed.

## Acceptance Criteria

(verbatim from `backlog task 91 --plain`)

1. A command installs the bundled installer-builder skill into the user agent skill scope for the detected target agents.
2. Re-running the install is idempotent and reports what it did.
3. When no supported agent scope is detected, the command reports this and exits non-zero without writing anything.
4. init surfaces, in its summary or the authoring front door, how to install the authoring skill when it is absent.
5. The command names the scope or scopes it wrote to.
6. Installing the skill never places it inside any workspace deliverable subdirectory; it targets the user agent scope only.

## Tasks / Subtasks

- [ ] Add the personal-scope map (AC: #1, #5)
  - [ ] Extend `src/core/services/agent-aliases.ts` with `USER_SCOPE_PATHS` (doc 05 lines 114-117 personal-scope column) + a `userScopePathFor` helper.
- [ ] Pure operation `installAuthoringSkill` (AC: #1, #2, #3, #5, #6)
  - [ ] New `src/core/operations/install-authoring-skill.ts`, composing the FileSystem + Environment ports only.
  - [ ] `detectUserAgentScopes(fs, home)` — an agent is detected when its personal config dir (`~/.claude`, `~/.agents`, `~/.hermes`, `~/.openclaw`) exists.
  - [ ] No scope detected → throw `UsageError` (exit 2) before any write.
  - [ ] Per detected scope: copy `<bundledSkillsRoot>/installer-builder/` to `<HOME>/<scope>/installer-builder/`; report `installed` (new) vs `updated` (pre-existing).
- [ ] Thread `bundledSkillsRoot` through DI (AC: #1)
  - [ ] Add to `CliDeps`; set in `makeRealDeps` via `fileURLToPath(new URL("../agent-skills", import.meta.url))`.
- [ ] CLI command `skill install` (AC: #1, #2, #5)
  - [ ] New top-level `skill` group + `install` leaf in `src/cli.ts`; format output naming each scope + status.
- [ ] init hint + front door (AC: #4)
  - [ ] `init` prints a `wpm skill install` tip when the skill is absent from the detected scopes.
  - [ ] Add the "how to install" line to `templates/project/minimal/snippets/authoring-front-door.md.tmpl`.
- [ ] Doc 10 (consistency)
  - [ ] Add the `skill install` entry to doc 10's command tree + per-command table (what-not-how).
- [ ] Tests (DoD)
  - [ ] Unit over MemoryFileSystem + FakeEnvironment: detect→copy, idempotent re-run, no-scope→exit-2/no-writes, scope naming, AC#6 (only writes under HOME).
  - [ ] CLI/integration test for `skill install` with a pinned HOME.

## Dev Notes

- **Command name & placement** — doc 12 line 349 names it `installer skill install` (`installer`/`wpm` is the bin), i.e. a top-level `skill` group with an `install` leaf. Doc 10's tree has no `skill` group yet, so add a minimal entry (noted as a divergence-record). It is project-independent, like `completion install` (doc 12) — no `resolveContext`.
- **Personal (user) scope** — doc 05 §"Where skills live" canonical table (lines 112-119): Claude Code `~/.claude/skills/`, Codex `~/.agents/skills/`, Hermes `~/.hermes/skills/`, OpenClaw `~/.openclaw/skills/`. The existing `ALIAS_PATHS` is the *project-relative* scope suffix and collapses Codex+Hermes onto `.agents/skills`; the personal scope is distinct (Hermes = `~/.hermes/skills/`), so a dedicated `USER_SCOPE_PATHS` map is the faithful encoding.
- **Detection rule** — an agent is "detected" when its personal config dir exists under HOME (`~/.claude`, `~/.agents`, `~/.hermes`, `~/.openclaw`) — the broad "agent is present" signal the prompt suggests ("the agent's user config/scope dir exists"). The skills subdir is created on install via `copyTree` (its parents are made).
- **Purity (doc 13 §1/§3)** — the operation composes ports only: FileSystem (`copyTree`, `exists`) + Environment (`getEnv("HOME")`, precedent `src/util/completion-install.ts`). No `node:fs`/`node:os`/`child_process` (Biome enforces the core boundary). `node:path` is permitted (init-project.ts uses it).
- **Exit-code contract (doc 13 §7)** — AC#3 "no supported agent scope detected" → `UsageError` → exit **2** (the environment precondition for installing is unmet; closest fit in the taxonomy, and matches the prompt's expectation). A missing bundled source (packaging bug, should never happen) → `NotFoundError` (exit 1).
- **AC#6** — the operation takes no project context and never reads cwd; it writes only under `<HOME>/<personal-scope>/installer-builder/`. Test asserts every changed path is under the pinned HOME and none contains `/wip/`.
- **Idempotency (AC#2)** — `FileSystem.copyTree` merges/overwrites, so a re-run reproduces an identical tree; the operation reports `updated` on the second run (vs `installed` on the first).

### Project Structure Notes

- New core operation lives under `src/core/operations/` (the established home; siblings `installer-skills-project.ts`, `targets.ts`).
- `USER_SCOPE_PATHS` joins `ALIAS_PATHS` in `src/core/services/agent-aliases.ts` (the canonical agent→scope map).
- `bundledSkillsRoot` threads through `CliDeps`/`makeRealDeps` exactly like `builtinTemplatesRoot` (typed optional to avoid churning ~29 test deps-literals that never exercise this command; always populated in production).

### References

- [Source: docs/12-builder-architecture.md#Distribution-and-the-users-install-experience] (line 349: `installer skill install`)
- [Source: docs/12-builder-architecture.md#The-bundled-agent-skill] (post-install copy into `~/.claude/skills/`, `~/.agents/skills/`; opt-in)
- [Source: docs/05-native-agent-surfaces.md#Where-skills-live] (lines 112-131: personal-scope table, never a bare `skills/`)
- [Source: docs/10-authoring-cli.md] (command-tree + per-command-table conventions)
- [Source: docs/13-core-architecture.md#ports / errors] (FileSystem/Environment ports; UsageError→exit 2)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMAD worker, dev-story driven from docs as stated fallback)

### Debug Log References

### Completion Notes List

- BMAD: `bmad-create-story` was invoked (loaded) but gates on the epic-1 sprint-status mirror, which excludes
  task-91 (and I must not mutate it); `dev-story` / `qa-generate-e2e-tests` gate the same way. Per CLAUDE.md
  Rule 3's stated-fallback, all three were driven from the docs (12/10/05) + the task ACs. This story is the
  create-story artifact; the unit + CLI + integration tests are the qa artifact.
- Command: `wpm skill install` (doc 12 line 349 `installer skill install`). New top-level `skill` group, leaf
  `install`. Project-independent (no project context), like `completion install`.
- User scope: `USER_SCOPE_PATHS` (doc 05 personal-scope column). Detection = agent personal config dir exists
  (`~/.claude`/`~/.agents`/`~/.hermes`/`~/.openclaw`); install target = `<HOME>/<scope>/installer-builder/`.
- AC#3 typed error: `UsageError` → exit 2 (doc 13 §7). Bundled-source-missing → `NotFoundError` (exit 1).
- Gate: typecheck clean, biome clean, `npm test` 1062 passed / 134 skipped (8 e2e self-skip without dist).

### File List

- `src/core/services/agent-aliases.ts` (added `USER_SCOPE_PATHS` + `userScopePathFor`)
- `src/core/operations/install-authoring-skill.ts` (new pure operation + `detectUserAgentScopes` + `authoringSkillPresent`)
- `src/cli.ts` (`bundledSkillsRoot` on `CliDeps` + `makeRealDeps`; `skillModule` + formatter; `init` AC#4 hint)
- `templates/project/minimal/snippets/authoring-front-door.md.tmpl` (AC#4 durable "how to install" line)
- `docs/10-authoring-cli.md` (added `skill install` to the command tree + per-command table)
- `test/unit/operations/install-authoring-skill.test.ts` (new)
- `test/unit/cli/skill-commands.test.ts` (new — `skill install` + `init` hint)
- `test/integration/cli.skill-install.test.ts` (new — real NodeFileSystem + tmpdir HOME)
