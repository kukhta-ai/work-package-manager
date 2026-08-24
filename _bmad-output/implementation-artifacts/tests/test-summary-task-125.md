# TASK-125 QA Summary — Declare and Inspect Template Authoring Tasks

Date: 2026-08-24
Story: 3.1
Status: independent review approved; full gate green

## Scope and Risk Model

QA exercised the existing read-only `wpm template show` path with optional inert `template.yml`
authoring-task declarations. The high-risk boundaries were registry path confinement and producer provenance,
strict declaration/context parsing, aggregate graph findings, mandatory-catalog byte compatibility,
template-controlled terminal text, and proof that both valid and invalid inspection perform no filesystem or
Backlog mutation.

No Backlog port, adapter, materialiser, initialization path, bundle mutation, WPM-owned skill, personal/workspace
onboarding state, process/auth/session surface, or package manifest was added for TASK-125.

## Generated and Extended Automated Evidence

- `test/unit/schema/template.test.ts`
  - exact valid and malformed authoring-task source retention;
  - descriptor round-trip; and
  - backward-compatible no-pack behavior.
- `test/unit/services/template-authoring-tasks.test.ts`
  - valid project and bundle symbolic context rendering;
  - producer-scoped identities and same-local-key/different-producer coexistence;
  - local and mandatory stable dependency resolution;
  - strict future concrete-context behavior and concrete rendered-title collisions;
  - aggregate duplicate-key, duplicate-dependency, malformed member, rendered-title, mandatory-title,
    unavailable/unsupported context, unresolved-reference, unsafe-text, and disconnected cycle findings;
  - explicit no-contribution result; and
  - exact unique mandatory references with byte-identical existing project/bundle task specs and conditional
    advisor exclusion from the unconditional bundle reference set.
- `test/unit/services/template-resolver.test.ts` and acceptance coverage
  - resolver-derived built-in/project-local provenance;
  - portable strict registry names before any filesystem probe;
  - descriptor registry-identity agreement; and
  - typed malformed-YAML/base-schema failures.
- `test/unit/cli/template-commands.test.ts`
  - valid/none/invalid output and exit semantics through the public command surface;
  - all findings displayed together;
  - terminal-control/bidi-safe metadata formatting;
  - complete in-memory root snapshots; and
  - a Backlog port that throws on any access, proving inspection is backlog-free.
- `test/unit/docs/template-documentation-drift.test.ts`
  - the shipped README declares the exact descriptor, context vocabulary, unconditional mandatory references,
    and append-only relationship.
- `test/integration/cli.template-show.e2e.test.ts`
  - real built CLI and Node filesystem over one disposable workspace;
  - valid project, valid bundle, no-contribution built-in, and multi-finding invalid bundle cases;
  - same local key under distinct project/bundle producers;
  - exact derived materialisation scopes and dependency identities; and
  - byte-identical complete workspace snapshot with no Backlog/build surface after every invocation.

## Acceptance-Criteria Trace

| AC | Evidence |
|---|---|
| 1 | Valid project/bundle unit and built-CLI cases show source/scope/name producer identity, revision, local/full key, rendered title/outcomes, dependencies, and derived scope. |
| 2 | Every valid result/CLI block says `additional`/append-only and mandatory task title collisions fail; catalog parity tests prove core work remains unchanged. |
| 3 | Closed `wpm.project.name`, `wpm.bundle.id`, and `wpm.bundle.version` tables prove symbolic preview, strict concrete rendering, unavailable-scope rejection, and no arbitrary parameter/prompt execution. |
| 4 | Same-pack `self:*` and documented `wpm:project:*` / `wpm:bundle:*` references resolve; raw titles, Backlog IDs, cross-scope refs, ambiguity, and missing refs fail. |
| 5 | Service and real-binary cases prove the same `write-docs` local key remains distinct across semantic producers. |
| 6 | Duplicate keys under one producer/revision are aggregated as `duplicate-key` and never returned as compiled tasks. |
| 7 | Legacy/built-in templates without a pack emit `Additional authoring tasks: none` and keep prior metadata/tree behavior. |
| 8 | Pure and CLI multi-finding fixtures aggregate schema, duplicate, title, context, reference, cycle, unsafe, and non-declarative findings; invalid results carry no compiled task union. |
| 9 | Throw-on-access Backlog fake plus in-memory and real-root snapshots prove successful/findings-bearing inspection is wholly read-only. |

## Focused Gate Results

- Task-focused schema/service/resolver/CLI/docs unit band: **6 files, 93 tests passed**.
- Mandatory operation/template/materialisation compatibility band: **7 files, 90 tests passed**.
- Real template/materialisation/docs/bundle-template integration band: **4 files, 10 tests passed**.
- `npm run lint`: passed (263 files).
- `npm run typecheck`: passed.
- `npm run build`: passed; the real-binary TASK-125 E2E passed against the resulting `dist/cli.js`.
- Clean package preparation: **1 file, 6 tests passed**.
- `git diff --check`: passed before the evidence-only story/QA sync; no product/test byte changed afterward.

The exact stable full `npm test` is intentionally not run by the worker; it remains owned by the independent
reviewer per the per-story fast-feedback policy. Live Claude is outside TASK-125 and remains deferred to the
post-TASK-127 exact-final-revision gate.

## QA Decision

Focused QA: **PASS for review handoff**. All nine acceptance criteria have executable evidence. The
architectural realization intentionally extends the established template-read command directly over pure
resolver/inspection services instead of adding a second read-operation abstraction; this preserves the
existing command contract and ports-and-adapters boundary without expanding scope.

## Independent Review Evidence

- Literal workflow: `bmad-story-automator-review`, auto-fix mode.
- Verdict: **APPROVE — 9/9 ACs pass, 0 open findings.**
- Stable path-sorted 16-file README/product/test aggregate:
  `413c4ca9c057479c0d3ce81ab4fffcb28b1efb5333196b3c7dd670ef9588644f`.
- Review fixes closed six concrete findings: erased custom YAML tags, producer/template identity disagreement,
  unsafe or empty concrete context substitution, recursive deep-graph stack exhaustion, recoverable YAML
  parse errors bypassing aggregate inspection, and base-resolver error-classification drift.
- Final focused evidence: task-specific plus generic CLI acceptance **7/114**; mandatory operation/template
  compatibility **7/90**; real built integration **4/10**; package preparation **1/6**; typecheck, lint
  (**263 files**), build, and diff-check pass.
- First full `npm test`: **135/136 files, 1,865/1,866 tests** in 530.60s. The sole failure was the existing
  no-stack substring assertion against the new base-descriptor message; focused diagnosis exposed and fixed
  the underlying domain-vs-authoring-error compatibility regression.
- Required replacement full `npm test` on the final stable bytes: **136/136 files, 1,866/1,866 tests** in
  545.93s. No further full-suite rerun was made.
