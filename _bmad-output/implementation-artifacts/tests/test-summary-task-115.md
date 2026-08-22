# Test Automation Summary — TASK-115 / Story 2.2

## Scope

Literal `bmad-qa-generate-e2e-tests` ran in YOLO mode for the portable `wpm-author-bundle` workspace skill.
This story adds a packaged authoring knowledge surface, not an API or browser/UI surface. QA therefore used the
repository's existing Vitest unit and real-filesystem/package journeys, the official skill validator, and fresh
native Codex and Claude Code evidence. The user-approved 2026-08-22 Correct Course proposal reassigns
authenticated live Claude behavioral parity to the post-TASK-127 exact-final-revision gate. Under revised DoD4,
TASK-115 is complete and independently approved; the preserved expired-OAuth diagnostics are not a story
blocker.

## Workflow and Customization Evidence

- Skill: `bmad-qa-generate-e2e-tests`.
- Customization resolver:
  `_bmad/scripts/resolve_customization.py --skill /home/agent/.codex/skills/bmad-qa-generate-e2e-tests --key workflow`.
- Activation prepend/append steps: none.
- Workflow override: none.
- Persistent fact declaration: `file:{project-root}/**/project-context.md`; no matching file.
- Completion hook: empty.
- Framework: Vitest `4.1.7`, using the existing unit and integration projects.
- Review continuation: literal `bmad-dev-story` applied the approved Moderate Direct Adjustment from
  `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-22.md`. No executable/test gap was found, so
  `bmad-qa-generate-e2e-tests` was not rerun and no product/test byte changed.

## Generated / Strengthened Automation

- [x] `test/unit/agent-skills/wpm-author-bundle-skill.test.ts` — validates portable frontmatter and discovery,
      self-contained boundary planning, existing WPM surfaces, explicit defaults/lifecycle/dependency behavior,
      pending specialist boundaries, fail-closed outcomes, and absence of checkout-specific resources.
- [x] `test/integration/distribution-preparation/package-preparation.test.ts` — strengthens the real clean-revision
      package journey with the exact new entry and byte equality, then deletes the copied source revision and
      proves the extracted one-file skill remains independently readable and complete.
- [x] `test/integration/cli.build.e2e.test.ts` — strengthens the existing tar/Git/conditional-zip journey with
      path and unique-content checks proving the package-owned authoring skill never enters generated
      work-package deliverables.
- [x] Existing static/dynamic public-surface automation scans the packaged skill documents for prohibited
      acquisition/publication claims.
- [x] No API or UI test was generated because TASK-115 exposes neither surface.

## Acceptance-Criteria Coverage

| Criterion | Principal automated evidence | Verdict |
| --- | --- | --- |
| AC1 — explicit belongs/dependency/separate/unresolved boundary without bootstrap invention | focused skill cases for self-contained use, four boundary lists, minimum decisions, defaults-not-agreement, and no auto-init | PASS |
| AC2 — agreed purpose/lifecycle/metadata/dependencies/payload are represented or unresolved; no false completion | focused WPM surface, lifecycle sequence, explicit range, registration-vs-content, result-state cases; fresh Codex state journey | PASS |
| AC3 — recipe, skill/front-door, and whole-package review remain pending yet independently usable | exact specialist names plus pending/independently-usable assertions | PASS |
| AC4 — invalid/conflicting workspace, identity, and dependency fail closed | invalid workspace/identity, self/cycle/constraint/missing/disabled/version-conflict, blocked/no-success assertions | PASS |
| AC5 — exact packed package exposes a source-free skill | clean-revision package test, exact archive entry/bytes, source deletion and extracted re-read | PASS |
| AC6 — generated deliverables contain no workspace-authoring skill | real tar/Git/conditional-zip path plus unique-content non-leakage assertions | PASS |

Coverage: **6/6 acceptance criteria** have focused automated or through-the-edges product evidence. Revised
story DoD4 also passes; authenticated live Claude behavioral parity remains separately required at the
post-TASK-127 exact-final-revision gate and is not claimed here.

## Skill-Creator and Official-Source Evidence

- Official Codex helper invoked literally:
  `/home/agent/.codex/skills/.system/skill-creator/scripts/init_skill.py wpm-author-bundle --path agent-skills`.
- Helper SHA-256:
  `6656e54755638e8efcf275a472b9672eaa8a9a1b9e59dc210e275b03b59e1e66`.
- The helper's focused-job, precise what/when trigger, concise self-contained instructions, and forward-testing
  guidance resulted in one portable `SKILL.md`; no unused resources, scripts, assets, or UI metadata remain.
- Verification hosts: Node `v22.22.1`, npm `10.9.4`, TypeScript `6.0.3`, Vitest `4.1.7`, Biome `2.4.16`, Codex
  CLI `0.148.0`, and Claude Code `2.1.158`.
- Official sources checked **2026-08-22**:
  - Codex skills: <https://learn.chatgpt.com/docs/build-skills>
  - Claude Code skills: <https://code.claude.com/docs/en/slash-commands>
  - Anthropic skill guidance:
    <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>
  - Anthropic's official helper source:
    <https://github.com/anthropics/claude-plugins-official/blob/main/plugins/skill-creator/skills/skill-creator/SKILL.md>

Tests assert stable behavior and boundaries rather than copying volatile documentation prose.

## Revised Story DoD4 Evidence

- **Fresh helper/source/version:** the official Codex helper was invoked during TASK-115; its hash, Codex and
  Claude host versions, current official sources, and 2026-08-22 access date are recorded above.
- **Deterministic Codex contract:** the exact extracted skill is self-contained at
  `.agents/skills/wpm-author-bundle/SKILL.md`; strict frontmatter fixes identity as `wpm-author-bundle`, which
  gives explicit `$wpm-author-bundle` invocation, while the focused description supplies the bundle trigger and
  excludes recipe, skill/front-door, whole-package review, and unrelated work.
- **Deterministic Claude Code contract:** the identical extracted bytes are self-contained at
  `.claude/skills/wpm-author-bundle/SKILL.md`; directory/frontmatter identity gives explicit
  `/wpm-author-bundle`, and Claude Code 2.1.158 initialization actually reported the skill in both
  `slash_commands` and `skills`. The same focused description supplies its trigger/non-trigger contract.
- **Source-free portability:** exact archive-byte equality, extracted re-read after source deletion, and the
  absence of local references prove that both native placements consume the same portable asset.
- **Live Codex behavior:** fresh discovery, explicit invocation, unnamed natural activation, unrelated
  non-trigger, observable WPM state, and no-write hashes are recorded below.
- **Exact pack/non-leakage:** the accepted package and real tar/Git/conditional-zip generated-deliverable proofs
  remain story-owned and green.

Verdict: **PASS for revised TASK-115 DoD4**. Authenticated live Claude explicit/natural/non-trigger/outcome
parity is intentionally unclaimed here and remains a hard external prerequisite for the final family gate.

## Exact Package and Non-Leakage Evidence

- Isolated reviewed exact package: `wpm-0.1.0.tgz`, **430 entries**, **469,924 bytes**, SHA-256
  `9291cffc2110b4a98f2e55c24ca128caaca2e11de05d17bc70269de18afcc9c6`.
- It contains exactly `package/agent-skills/wpm-author-bundle/SKILL.md` for this skill and no accompanying local
  resource. The automated clean-copy journey independently extracts the archive, deletes the source checkout,
  and validates the surviving skill.
- The representative generated tarball and Git layouts match, with zip checked when available. The test first
  plants the exact skill at the native `.agents/skills/wpm-author-bundle/SKILL.md` workspace path, confirms its
  marker is present, and then proves all generated formats reject both the path and the marker
  `Turn the request into four short lists:`.
- The archive search found no test, story, sprint, Backlog, `_bmad-output`, or `.serena` entry.

## Fresh Host Evidence

### Codex — complete and source-free

- Reviewer replacement archive: accepted clean synthetic revision
  `72bad8d21dbafbdb17dd374ccb6f35f0db1001e2`, **430 entries**, **469,924 bytes**, SHA-256
  `9291cffc2110b4a98f2e55c24ca128caaca2e11de05d17bc70269de18afcc9c6`. Its extracted, installed, and native
  workspace skill bytes all have SHA-256
  `54cee6e7527556448fa81a8daf879587d1cc419ec4c27038beb058ffbee84cd7`.
- Native workspace discovery: fresh isolated Codex sessions read
  `.agents/skills/wpm-author-bundle/SKILL.md` from that extracted package asset and named the focused skill.
  The host `wpm` command resolved only to the package-installed `dist/cli.js`, never repository `dist/`.
- Explicit invocation: `$wpm-author-bundle` received an ambiguous bundle request, separated belongs/external/
  separate/unresolved concerns, reported `incomplete`, did not invent pending capabilities, treated the absent
  target as separate package incompleteness, and changed no WPM state; the complete host-tree hash remained
  `2defffbb641e3586f5d465e27a7391de687d2dcf53ef8cd6481c19610fec3804`.
- Natural-language trigger: a fresh prompt did not name the skill. Codex selected it, inspected WPM, created
  enabled `audit-export` version `0.3.0`, recorded purpose `exports signed audit reports`, preserved safe
  confirmation with no dependencies, payload, scripts, helpers, or advisor, re-read every relevant WPM family,
  and left the empty target set unchanged despite the package-level validation finding.
- Focused existing-bundle trigger: another unnamed fresh session preserved all WPM-managed bytes, reported the
  coherent bundle boundary as independently usable but incomplete, and named recipe, user-facing skill/front
  door, whole-package review, and target selection as distinct pending boundaries. The host-tree hash remained
  `6a92fc99108206b0c116f692e88424021e7879ea091cc3635e83dfef0577fc1e`.
- Non-trigger: a fresh unrelated `17 * 19` prompt returned only `323`, with no skill or command activity.
- Sandbox note: workspace-write reproduced the already diagnosed `bwrap` launcher denial once. The single
  retry used full access confined to this isolated temporary host; no credential or repository source was
  accessed.

### Claude Code — native discovery complete; live parity deferred to the final gate

- A fresh isolated project exposed the extracted skill at `.claude/skills/wpm-author-bundle/SKILL.md`.
- Claude Code `2.1.158` initialization reported `wpm-author-bundle` in both `slash_commands` and `skills`, which
  is direct native discovery evidence.
- Before explicit invocation could execute, the configured first-party `claude.ai` session failed with:
  `401 OAuth access token has expired. Re-authenticate to continue.`
- `claude auth status --json` reported the existing session as logged in with `authMethod: claude.ai` and
  `subscriptionType: max`. The evidence preserves all three authorized 401 probes. The final minimal
  no-settings probe exited 1 after 29,825 ms with zero input/output tokens, zero server-tool use, no permission
  denial, and terminal reason `completed`; no blind retry followed.
- No credential was inspected or changed and no interactive authentication was launched. Claude explicit
  invocation, natural-language trigger, unrelated non-trigger, and observable bundle outcome are **not
  claimed**. Under the approved correction, they are an external prerequisite for the post-TASK-127 exact
  final-package gate rather than a TASK-115 blocker.

## Verification Results

- Official `quick_validate.py`: PASS.
- Combined focused workspace-skill band: **23/23 passed across 2 files**.
- Clean-revision exact-package/source-free journey: **1/1 passed**; 5 unrelated cases skipped.
- Static/dynamic packaged-skill public-surface case: **1/1 passed**; 10 unrelated cases skipped.
- Real tar/Git/conditional-zip generated-deliverable journey: **1/1 passed**; 24 unrelated cases skipped.
- `npm run typecheck`: PASS.
- Repository-wide `npm run lint`: PASS over **241 files**.
- `npm run build`: PASS before the built/package journey.
- `git diff --check`: PASS.
- Review-continuation recheck: official validator PASS; **23/23** focused tests PASS across 2 files; typecheck
  PASS; repository-wide Biome PASS over **241 files**; Codex CLI `0.148.0`, Claude Code `2.1.158`, and helper
  SHA-256 `6656e54755638e8efcf275a472b9672eaa8a9a1b9e59dc210e275b03b59e1e66` reverified unchanged.
- Independent review cycle 2: official validator PASS; **23/23** focused skill tests; clean-package,
  public-surface, and generated-deliverable non-leakage cases each **1/1**; typecheck, repository-wide Biome over
  **241 files**, build, and `git diff --check` PASS. A direct pack reproduced **430 entries**, **469,924 bytes**,
  and SHA-256 `9291cffc2110b4a98f2e55c24ca128caaca2e11de05d17bc70269de18afcc9c6`.
- Exact full `npm test`: **PASS** — **121/121 test files and 1516/1516 tests passed** in 443.09 seconds on the
  unchanged stable product/test diff.
- Review-operation deviation: a double-quoted evidence-search pattern accidentally expanded the literal
  `npm test` text as shell command substitution. The reviewer detected it at the first 10-second yield,
  terminated the exact spawned shell/npm/Vitest process tree, confirmed that no descendant remained, and
  obtained no test verdict or file change. It is not counted as the reserved exact full gate.

Stable reviewed product/test aggregate hash over the four product/test files:
`25153454f2dcb6ba070fe96e77ddbf484a631cec0c7fa154db3449696c49dcab`.

## QA Checklist Verdict

The generated automation checklist passes: standard Vitest APIs, clear independent cases, happy/blocked/error
coverage, isolated roots, no hardcoded waits, appropriate test directories, and this coverage summary. API
status-code and semantic UI-locator items are not applicable.

QA verdict: **PASS / INDEPENDENT REVIEW APPROVED** under the approved revised DoD4. All 6 ACs and
story-owned helper/source/version, deterministic two-platform native contract, exact-package/non-leakage, and
live Codex evidence pass. The product/test hash is unchanged. The preserved Claude 401 evidence neither
disappears nor becomes a success claim; its authenticated behavioral matrix remains due at the final gate.

## Exact Remaining Actions

1. After TASK-127, the final cold-gate owner obtains an externally authenticated Claude Code session and runs
   discovery, explicit invocation, natural-language trigger, unrelated non-trigger, and representative outcome
   for all six WPM skills against one exact final packed revision before final handoff or activation.

If that final family gate exposes a defect, correct the owning skill, rerun its focused/package evidence,
produce new exact final bytes, and rerun the consolidated gate. Do not retrofit credentials, login, or agent
session ownership into WPM.
