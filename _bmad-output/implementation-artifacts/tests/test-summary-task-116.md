# Test Automation Summary — TASK-116 / Story 2.3

## Scope

Literal `bmad-qa-generate-e2e-tests` ran in YOLO mode for the portable `wpm-author-recipe` workspace skill.
TASK-116 adds a packaged authoring knowledge surface, not an API or browser/UI surface, so QA used the
repository's existing Vitest unit and real-filesystem/package journeys, the official skill validator, and
fresh source-free Codex evidence. Authenticated live Claude behavior remains assigned to the approved
post-TASK-127 exact-final-revision family gate and is neither invoked nor claimed here.

## Workflow and Customization Evidence

- Skill: `bmad-qa-generate-e2e-tests`.
- Resolver:
  `_bmad/scripts/resolve_customization.py --skill /home/agent/.codex/skills/bmad-qa-generate-e2e-tests --key workflow`.
- Workflow override: none.
- Activation prepend/append steps: none.
- Persistent fact: `file:{project-root}/**/project-context.md`; no matching file.
- Completion hook: empty.
- Framework: Vitest `4.1.7`, using the existing unit and integration projects.
- QA audited all six ACs and found no missing executable seam after the dev-story automation. No product or
  test byte was added or changed during QA; this summary is the only QA-created file.

## Generated / Strengthened Automation

- [x] `test/unit/agent-skills/wpm-author-recipe-skill.test.ts` — covers strict portable frontmatter and focused
      discovery, one authoritative install backlog, current Backlog surfaces, detect/setup/verify outcomes,
      state-versus-migration semantics, immutable migration history, explicit dependency graph checks,
      completion-gated receipt facts without authoring receipts, aggregate fail-closed readiness, adjacent
      specialist routing, identical Codex/Claude placement bytes, and absence of checkout-relative resources.
- [x] `test/integration/distribution-preparation/package-preparation.test.ts` — adds the exact recipe-skill entry
      to the declared clean-revision ship set, proves source/archive byte equality, deletes the copied source,
      re-reads the complete extracted skill, and places identical bytes at both supported native paths.
- [x] `test/integration/cli.build.e2e.test.ts` — plants the workspace skill and its unique content marker, then
      proves neither its path nor content enters representative tar, Git, or conditional-zip work-package
      deliverables.
- [x] Existing public-surface automation scans all packaged authoring-skill Markdown for prohibited public
      acquisition/publication claims.
- [x] No API or UI test was generated because TASK-116 exposes neither surface.

## Acceptance-Criteria Coverage

| Criterion | Principal evidence | Verdict |
| --- | --- | --- |
| AC1 — new outcome becomes explicit detect/setup/verify work with dependencies in one recipe source | focused skill contract cases; fresh unnamed Codex outcome verified through Backlog.md `1.45.2` | PASS |
| AC2 — current desired state is distinct from prior-gated immutable migrations | focused state/migration, prior-version, immutable-history, and fix-forward assertions | PASS |
| AC3 — context-less observable outcomes and completion-gated receipt facts support resume | observable what-not-how, independent verify, complete receipt-gate, no-authoring-receipt cases; live three-task read-back | PASS |
| AC4 — missing verification, ambiguity, unresolved/cyclic dependencies aggregate and never appear ready | focused aggregate blocker/result assertions; explicit live invocation returned one complete `blocked` report without writes | PASS |
| AC5 — exact packed package exposes a source-free independent skill | real clean-revision archive entry/bytes, extraction, source deletion, source-free re-read, and native placement equality | PASS |
| AC6 — generated deliverables contain no authoring skill | non-vacuous path plus unique-content rejection across tar, Git, and conditional zip | PASS |

Coverage: **6/6 acceptance criteria** have focused automated or through-the-edges evidence.

## Skill-Creator and Official-Source Evidence

- Official Codex helper invoked literally:
  `/home/agent/.codex/skills/.system/skill-creator/scripts/init_skill.py wpm-author-recipe --path agent-skills`.
- Helper SHA-256:
  `6656e54755638e8efcf275a472b9672eaa8a9a1b9e59dc210e275b03b59e1e66`.
- Its precise what/when description, focused one-file structure, absence of unused resources/UI metadata, and
  forward-evaluation guidance produced one self-contained `SKILL.md`.
- Hosts: Node `v22.22.1`, npm `10.9.4`, TypeScript `6.0.3`, Vitest `4.1.7`, Biome `2.4.16`, Codex CLI
  `0.148.0`, and Claude Code `2.1.158`.
- Official sources checked **2026-08-22**:
  - Codex skills: <https://learn.chatgpt.com/docs/build-skills>
  - Claude Code skills: <https://code.claude.com/docs/en/skills>
  - Anthropic skill-authoring guidance:
    <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>

Tests preserve stable identity, path, trigger, behavior, and portability boundaries without freezing volatile
documentation prose.

## Revised Story DoD4 Evidence

- **Fresh helper/source/version:** the official helper was invoked during TASK-116; its hash, current host
  versions, sources, and access date are recorded above.
- **Deterministic Codex contract:** the exact extracted bytes are valid and self-contained at
  `.agents/skills/wpm-author-recipe/SKILL.md`; frontmatter identity gives explicit `$wpm-author-recipe`, while
  the focused description covers recipe requests and excludes bundle, skill/front-door, review, and unrelated
  work.
- **Deterministic Claude Code contract:** the identical extracted bytes are valid and self-contained at
  `.claude/skills/wpm-author-recipe/SKILL.md`; directory/frontmatter identity gives explicit
  `/wpm-author-recipe`, with the same focused trigger/non-trigger boundary.
- **Source-free portability:** exact byte equality, source deletion, extracted re-read, and no local-resource
  references prove both native placements consume one portable asset.
- **Live Codex behavior:** fresh discovery, explicit blocked invocation, unnamed natural activation with an
  observable Backlog outcome, and unrelated non-trigger/no-mutation evidence are recorded below.
- **Exact pack/non-leakage:** the accepted clean-revision archive and real generated-deliverable journey are
  green.

Verdict: **PASS for revised TASK-116 DoD4**. No live Claude inference was attempted; authenticated behavioral
parity remains due only at the post-TASK-127 final family gate.

## Exact Package and Non-Leakage Evidence

- Clean synthetic revision: `9e06a5b70b400c31213652b37191a95c26d385fa`.
- Accepted `wpm-0.1.0.tgz`: **431 entries**, **474,013 bytes**, SHA-256
  `7850b514741225a1415ddb1378a93b490fac8f1f47cbc08af6de6aaf699adcc2`.
- Recipe skill source/extracted SHA-256:
  `0cc30eaf3678784dd84ef7c0352a148bf5c1e9ba4efe0d58be6b88a7ad93ad4d`.
- The source checkout was deleted before the extracted skill was re-read and copied to both native paths.
- The generated-deliverable journey first planted
  `.claude/skills/wpm-author-recipe/SKILL.md` and marker
  `The bundle's install backlog is the single recipe task source:`, then rejected both path and marker from
  tar, Git, and conditional-zip outputs.

## Fresh Codex Evidence

- All successful sessions ran with Codex `0.148.0` in isolated disposable hosts. `wpm` resolved only from the
  accepted archive's installed `dist/cli.js`, never repository `dist`.
- Discovery named `wpm-author-recipe`, explicit `$wpm-author-recipe`, Claude Code
  `/wpm-author-recipe`, and the focused author/revise-install-recipe trigger, with no writes.
- Explicit invocation intentionally omitted the bundle and contract facts. The skill returned one aggregate
  `blocked` result listing every unresolved decision and unavailable verification/graph/history check, and
  changed no files.
- An unnamed, fully specified natural-language request selected `wpm-author-recipe` on the required current
  Backlog.md `1.45.2` surface. It returned `ready` and revised exactly three To Do `kind:state` tasks at
  milestone `0.1.0`: detect -> setup -> verify with explicit dependencies, command-success plus semantic-version
  outcomes, adaptive preserve-or-install behavior, independent verification, six unchanged receipt gates,
  no migration, no checked AC/DoD, and no authoring receipt. `backlog sequence list --plain` showed the valid
  chain as one task in each successive dependency stage, and `wpm build dry-run` passed. The only incidental
  extra delta was Backlog's semantic config normalization in the disposable host.
- A fresh unrelated session answered only `667`, invoked no tools, and preserved the read-only host exactly.

## Verification Results

- Official `quick_validate.py`: PASS.
- Focused RED baseline: **10/10 failed** while `wpm-author-recipe` was absent.
- Combined workspace-skill band: **19/19 passed across 2 files**.
- Independent final focused gates: unit **19/19**; exact package **1/1** (5 skipped); packaged public surface
  **1/1** (10 skipped); generated tar/Git/conditional-zip non-leakage **1/1** (24 skipped).
- `npm run typecheck`: PASS.
- Repository-wide `npm run lint`: PASS over **242 files**.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- Exact full `npm test`: **122/122 files and 1526/1526 tests passed** in 568.82s.

A focused package run initially failed during `npm ci` with host `ENOSPC`. The reviewer used npm's supported
cache cleanup while preserving the accepted archive and evidence; the corrected single rerun passed. This was
an environment-capacity failure, not a product assertion.

Stable product/test aggregate SHA-256 over the four files below:
`168b95390c543bff4ecb8687fc8760c89f81ba00d28b71daf3a5389295a92b54`.

## QA Checklist Verdict

The QA automation checklist passes: standard Vitest APIs, clear independent cases, happy and blocked/error
coverage, isolated roots, no hardcoded waits, tests in established directories, and this coverage summary.
API status-code, browser E2E, and semantic-locator items are not applicable.

QA/review verdict: **PASS / APPROVE**. All 6 ACs and the revised helper/source/version, deterministic
two-platform native contract, exact-package/source-free/non-leakage, and live Codex evidence pass. No TASK-116
finding or blocker remains.

## Exact Remaining Actions

1. After TASK-127, the final gate owner runs authenticated live Claude discovery, explicit invocation,
   natural-language trigger, unrelated non-trigger, and representative outcome for all six WPM skills against
   one exact final packed revision before handoff or activation.

## Independent Review Cycle 1

The literal `bmad-story-automator-review` skill ran in automatic-fix mode. Its customization resolver found no
`customize.toml`, workflow override, activation prepend/append step, persistent context match, or completion
hook, so the installed default workflow ran directly.

Six findings were confirmed and resolved before the stable full gate:

1. **HIGH:** block detached/copied platform fallbacks unless `backlog` and `install-backlog` resolve to the same
   canonical recipe directory.
2. **MEDIUM:** make the verified Backlog.md 1.45.2 read/config/edit surfaces and unsupported config-set boundary
   explicit.
3. **HIGH:** leave shipped tasks `To Do`, every AC/DoD unchecked, and all target-machine receipt facts unwritten.
4. **MEDIUM:** never permit `--no-dod-defaults` to yield an empty DoD; retain explicit effect verification.
5. **HIGH:** replace acceptance criteria safely, preserve exact dependency IDs/case, interpret numbered
   sequences as dependency stages, re-read managed state, and forbid editor-driven task-file rewrites.
6. **MEDIUM:** inspect tar content before the Git artifact overwrites the destination so all three generated
   formats retain independent, non-vacuous path-and-content evidence.

One exploratory Backlog mutation probe was mistakenly launched from the repository rather than its intended
temporary directory and created only untracked TASK-128. Root removed that exact CLI-created file because
Backlog.md 1.45.2 exposes no delete command; `backlog task TASK-128 --plain` then returned not found, no tracked
Backlog byte changed, and later mutation probes used explicit disposable working directories. An early
disposable natural run that misread sequence headings and attempted an editor rewrite was interrupted and
superseded by the hardened final skill and accepted evidence.

Final review outcome: **APPROVE, 0 open findings**. Authenticated live Claude was neither invoked nor claimed;
it remains the approved post-TASK-127 final-family gate.
