# Test Automation Summary — TASK-124

## Scope

Story 2.11 completes the exact accepted packed-install-to-handoff family journey. The QA band exercises one
source-deleted accepted archive through inert acquisition, explicit personal setup, created and strictly
adopted workspaces, prepared handoff, receiving-agent verification and Backlog continuation, all six skill
identities, and tar/Git/conditional-zip deliverable exclusion.

## Generated and Extended Tests

### Cold installed-package journey

- [x] `test/integration/distribution-preparation/packed-install.test.ts`
  - snapshots the entire disposable HOME and workspace roots around inert package installation;
  - removes source-checkout PATH, Node, npm lifecycle, config, and credential influences for every installed
    continuation command;
  - uses isolated Codex-only, Claude-Code-only, and both-client HOME fixtures with exact selected-only personal
    skill bytes and one client-native next action;
  - proves retained and explicit workspace selection independently of empty and opposite/nonempty deliverable
    targets;
  - exercises `created` and exact `legacy-adopted` origins with five selected workspace skills, native front
    doors, one shared Backlog root, one prepared receipt, and no unselected integration;
  - exercises all six exact archive skills in isolated Codex and Claude Code native cells with strict identity,
    explicit invocation, positive trigger, adjacent non-trigger, and source-free checks;
  - launches installed-CLI handoff verification in a fresh process, performs the Backlog CLI snapshot/freshness
    barrier, claims exactly one eligible task, and reverifies resumable work; and
  - builds and inspects tar, Git, and conditional zip output while preserving the source deliverable tree.

### Package and native skill boundaries

- [x] `test/unit/agent-skills/wpm-author-bundle-skill.test.ts` — adds the missing exact Codex/Claude native-copy
  parity cell for `wpm-author-bundle`.
- [x] `test/integration/cli.build.e2e.test.ts` — composes personal setup quarantine evidence into the existing
  TASK-95/TASK-118 tar/Git/conditional-zip exclusion proof.
- [x] `distribution-preparation/verify-packed-install.js` — reports and enforces whole-root inert-install
  snapshots in addition to named coding-client surfaces, scrubs ambient Codex/Claude configuration and
  session variables, and gives cold dependency installation a bounded truthful timeout.
- [x] `test/unit/distribution-preparation/packed-install.test.ts` — proves repository/npm/credential context plus
  `CODEX_*`, `CLAUDE_*`, and `CLAUDECODE` cannot cross into installed-command children.

## Coverage

| Contract | Evidence |
| --- | --- |
| AC 1-2 | Accepted source-deleted archive, declared resources, whole-root inert snapshots |
| AC 3-5 | Three isolated explicit/headless selection cells, exact selected-only bytes, native next actions |
| AC 6-9 | Retained/explicit create plus strict legacy adoption, exact five-skill/front-door/backlog/receipt state |
| AC 10 | Six isolated package/native identity, invocation, trigger, non-trigger cells |
| AC 11-13 | Composed exact-byte readiness: independent installed verification, source-free Backlog claim/resume, prior byte-bound live Codex evidence, and explicit no process/auth/session/acceptance claim |
| AC 14 | Real journey tar/Git/zip inspection plus composed TASK-95/TASK-118 sentinel exclusion |

## Focused Results

- Six skill unit files: **6/6 files, 76/76 tests passed**.
- Package preparation: **1/1 file, 6/6 tests passed**.
- Exact packed-install unit and journey on the final bytes: **2/2 files, 15/15 tests passed**; the final focused
  journey run completed in **47.42s**.
- TASK-95/TASK-118 build non-leak cases: **2/2 passed, 24 skipped by name filter**.
- Lint, typecheck, production build, and `git diff --check`: passed.
- The repository exposes no standalone `check:boundaries` or `check:supply-chain` scripts. The Biome rule set
  provides the core-import boundary gate, while clean archive inspection and package-preparation tests provide
  the package/supply-chain evidence.

## Supplementary Live Codex Probe

- Exact accepted archive SHA-256:
  `e17183b05c4c446748c9c3bd2d6c9c513dedd89507faf813f01cf3f543022795`.
- Synthetic accepted source revision: `dd12a59ac8dee4c7a36d3bf268135df0405cbcfd`; archive size:
  **625,309 bytes**. The declared ship-set inspection reported zero violations and included every current WPM
  skill artifact plus the retained exact legacy migration source.
- Client/version: `codex-cli 0.148.0`; one ephemeral isolated session
  `01a03487-b231-7721-91bf-2c96e88c6ecc`, disposable HOME and `CODEX_HOME`, ignored user config/rules,
  workspace-write sandbox, approval policy `never`, no persisted rollout.
- The installed archive completed explicit Codex personal setup, retained-default workspace creation, and
  installed-CLI handoff verification before the live launch. Codex discovered and explicitly invoked
  `wpm-author`, but the host sandbox could not execute the workspace CLI (`bwrap: execvp .../codex: Permission
  denied`). It returned a truthful blocked result and performed no Backlog mutation.
- The deterministic failure was not retried. Source auth SHA-256, size, permissions, ownership, and mtime were
  unchanged before/after; the disposable auth copy was removed after the probe and no live Claude process was
  launched. A Backlog CLI postread showed all eight tasks remained To Do.
- The disposable workspace init first encountered a missing `EDITOR` prerequisite during Backlog init. The
  partial Backlog was repaired through its CLI (`backlog config set defaultEditor vim`) and the identical WPM
  init request converged; no Backlog file was hand-edited.

This probe is **BLOCKED supplementary evidence**, not a successful live AC11/12 run and not evidence for the
reviewer's final accepted archive. AC11/12 use the approved compositional disposition: the final deterministic
installed-package verification and exact Backlog claim/resume combine with unchanged current `wpm-author`
SHA-256 `272d37019235bec9ea657e49e1401f452a3b5f732ae47c887fa93b9e0984a8c8` and its prior byte-bound live Codex
discovery/claim evidence. Live Claude remains deferred until post-TASK-127.

## Independent Review Evidence

- Literal workflow: `bmad-story-automator-review`, auto-fix mode.
- Verdict: **APPROVE — 14/14 ACs pass, 0 open findings.**
- Stable path-sorted product/test aggregate:
  `742d7ac8237647f099850755c0fe2b2c9a5f2455160b778e8804b7a5b5b907fd` across exactly five files:
  `distribution-preparation/verify-packed-install.js`, `test/integration/cli.build.e2e.test.ts`,
  `test/integration/distribution-preparation/packed-install.test.ts`,
  `test/unit/agent-skills/wpm-author-bundle-skill.test.ts`, and
  `test/unit/distribution-preparation/packed-install.test.ts`.
- Reviewer accepted archive: synthetic revision `d2375eec330c5d3973166b93d2010e483788aa70`;
  `wpm-0.1.0.tgz` SHA-256 `2efd78fb057b442e0f06b30757983995ea08f4fcb31cc3b4e94ab82a39f365d1`;
  625,313 bytes; zero boundary violations. After source deletion, installed CLI/resources and whole-root inertness
  passed; all six skill hashes matched the repo; the archive contained no `src/` or `test/`.
- Review fixes closed ambient client-context leakage, incomplete exact selected/unselected matrix evidence,
  causal six-skill/Backlog continuation gaps, source-free/non-leak preservation gaps, and the cold-install
  timeout race exposed by the first full gate.
- Final focused/static evidence: packed-install unit/journey 15/15; six skill units plus package preparation
  82/82; TASK-95/TASK-118 non-leak 2/2; typecheck, lint, build, and diff-check pass.
- First full `npm test`: 133/134 files and 1,823/1,824 tests; sole failure was an outer `spawnSync` status `null`
  at the shared 300-second cold-install timeout. After ordered 600/660/720-second bounded budgets changed the
  executable/test bytes and produced the stable hash above, the required replacement full gate passed
  **134/134 files and 1,824/1,824 tests in 467.64s**.

## Boundaries and Deferred Evidence

- No API or UI exists; CLI/package integration tests are the applicable E2E layer.
- No hardcoded waits, repository-relative continuation resource, real-HOME write, or live Claude invocation is
  used. The exact local archive's declared npm peer dependency is resolved through npm with a bounded
  prerequisite timeout; there is no test retry or hidden source-checkout fallback.
- One isolated current Codex continuation reached inference and produced the truthful sandbox blocker recorded
  above. It supplements, but does not replace, the deterministic accepted-archive acceptance evidence.
- The independent reviewer-owned stable full gate is complete and green; no further full-suite rerun was made.
