# Test Automation Summary — TASK-114 / Story 2.1

## Scope

Literal `bmad-qa-generate-e2e-tests` ran in YOLO mode for the stable Codex and Claude Code
authoring-client contract. This is a local CLI/domain feature: API and browser/UI automation are not
applicable. QA used the repository's existing Vitest unit and real-filesystem integration projects and kept
the story at review for independent code review.

## Workflow and Customization Evidence

- Skill: `bmad-qa-generate-e2e-tests`.
- Customization resolver:
  `_bmad/scripts/resolve_customization.py --skill /home/agent/.codex/skills/bmad-qa-generate-e2e-tests --key workflow`.
- Activation prepend/append steps: none.
- Workflow override: none.
- Persistent fact declaration: `file:{project-root}/**/project-context.md`; no matching file.
- Completion hook: empty.
- Framework: Vitest `4.1.7`, using the existing `unit` and `integration` projects.

## Generated / Strengthened Automation

- [x] `test/integration/cli.authoring-clients.test.ts` — strengthened with one built-distribution journey that
      executes `dist/cli.js` for JSON inventory, human inventory, and help from an isolated workspace.
- [x] The added journey gives the built client a Claude configuration-root hint while the project declares
      only OpenClaw as a deliverable target, then proves the inventory stays Codex/Claude and every HOME and
      workspace byte remains unchanged.
- [x] No API or UI test was generated because the story exposes neither surface.

## Acceptance-Criteria Coverage

| Criterion | Principal automated evidence | Verdict |
| --- | --- | --- |
| AC1 — stable `codex` / `claude-code` inventory and names | service registry unit cases; CLI JSON/text/help cases; built CLI journey | PASS |
| AC2 — Codex paths/front door/detection/launch/reload | exact registry unit projection; detected/not-detected/unavailable and Windows path cases; CLI JSON/text | PASS |
| AC3 — Claude Code paths/front door/detection/launch/reload | exact registry unit projection; real Claude config-root observation; built CLI JSON/text | PASS |
| AC4 — authoring clients remain independent of `manifest.yml.targets` | in-memory differing-axis CLI case; real-filesystem Hermes/OpenClaw manifest snapshot; built OpenClaw-only snapshot | PASS |
| AC5 — selectable vs deferred vs invalid | table-driven identifier cases including empty/whitespace/near-miss/unknown; CLI and real-filesystem deferred/invalid results | PASS |

Coverage: **5/5 acceptance criteria** with unit plus through-the-edges evidence.

## Detection and Safety Semantics

- `detected` means only that the client's native personal configuration root was observed through the injected
  filesystem/environment boundaries. It does not mean installed, selected, configured, authorized, or running.
- Every support/inspection result explicitly keeps `configured: false` in this story.
- Codex and Claude Code are the only selectable definitions. Hermes/OpenClaw are `deferred`; empty and unknown
  identifiers are `invalid`. Those states are closed and machine-distinguishable.
- Inventory and identifier evaluation perform no setup, installation, personal/workspace write, manifest read
  or mutation, process launch, credential access, network operation, or session management.

## Official Primary Sources

Facts were checked on **2026-08-22** and the story records only the stable contract fields needed by tests:

- Codex/OpenAI: <https://learn.chatgpt.com/docs/build-skills>,
  <https://learn.chatgpt.com/docs/agent-configuration/agents-md>, and
  <https://learn.chatgpt.com/docs/codex/cli>.
- Claude Code/Anthropic: <https://code.claude.com/docs/en/slash-commands>,
  <https://code.claude.com/docs/en/claude-directory>, and
  <https://code.claude.com/docs/en/cli-usage>.

The tests assert paths, front-door names, launch commands, and stable reload rule discriminators rather than
copying upstream prose or version-specific presentation.

## Verification Results

- Focused unit/help/CLI band: **47/47 passed across 5 files**.
- Focused real-filesystem/core-boundary integration band: **6/6 passed across 2 files**.
- QA-strengthened authoring-client integration file: **3/3 passed**, including the built CLI journey.
- Selected generated-deliverable non-leakage regression: **1/1 passed**.
- `npm run typecheck`: PASS.
- Repository-wide `npm run lint`: PASS over **240 files**.
- `npm run build`: PASS on the stable product diff; the QA test then executed that built output.
- Built CLI manual JSON/deferred/help inspection: PASS.
- npm dry-pack: **429 entries**; both compiled authoring-client modules present; zero test, story, sprint, or
  authoring-client selection-state leaks.
- `git diff --check`: PASS.
- Exact full `npm test`: intentionally deferred to the independent reviewer under the repository's
  stable-diff policy.

Stable QA product/test aggregate hash over the six executable/test files:
`a7af5fa4515f92527bddb73940dd4ffe23da3788965543211f7f0f255762c68b`.

## QA Checklist Verdict

PASS. Tests use standard Vitest APIs, clear independent descriptions, isolated temporary roots, no hardcoded
waits, and cover the main inspection journey plus critical deferred/invalid/no-HOME/different-target/no-write
cases. API status-code and semantic UI-locator items are explicitly not applicable. Story and sprint status
remained `review` at QA handoff for independent review.

## Independent Review Evidence

- The literal `bmad-story-automator-review` skill ran in automatic-fix mode and resolved four medium- and one
  low-severity findings: runtime catalog mutability, unresolved relative HOME paths, file-as-directory false
  detection, human-output injection, and help/text contract drift. Final verdict: **APPROVE with 0 open
  findings**.
- Review added RED evidence with **7 failures / 31 tests** and made the same band **31/31 green**, including
  both/neither detection, absolute-HOME handling, directory-kind detection, stable runtime IDs, and escaped
  human output.
- Final focused evidence: **84/84** authoring/help/legacy-target unit tests, **21/21** generated-deliverable
  build regressions, and **6/6** real-filesystem/built-CLI/core-boundary integration tests.
- Typecheck, repository-wide Biome over **240 files**, build, `git diff --check`, unchanged `docs/00`–`docs/14`,
  and npm dry-pack (**429 entries, 0 test/story/state/backlog/.serena leaks**) passed.
- The reviewer ran the one exact stable-diff `npm test`: **120/120 files and 1,507/1,507 tests passed** in
  **484.03 seconds**.
- Final six-file executable product/test hash:
  `cbb1f41a4251edae93f20f4352fb849182b71d3e130181bdc23bc2cb2a1e8bef`.
- `node:path` remains an allowed pure string utility under the repository's enacted core-boundary rule; the
  explicit allowed/forbidden boundary integration test and Biome gate passed. No customization hooks or
  project-context facts applied, and no protected Backlog/state/policy/branch/commit/merge surface changed.
