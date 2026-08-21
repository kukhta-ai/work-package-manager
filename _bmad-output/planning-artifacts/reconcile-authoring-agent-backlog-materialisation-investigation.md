# Input Reconciliation — Authoring-Agent Backlog Materialisation Investigation

## Input

`_bmad-output/implementation-artifacts/investigations/authoring-agent-backlog-materialisation-investigation.md`

Compared with `_bmad-output/planning-artifacts/prd.md`, using
`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md` as the later approved authority.
No `addendum.md` exists for this run.

## Verdict

The PRD preserves the investigation's resolved direction: templates contribute inert, append-only
authoring-task packs; mandatory WPM work remains; identity is stable-key based rather than title-only; and
template evolution, drift reconciliation, backlog reconstruction, and generic reconciliation remain deferred.
Five approved story-level guarantees are not stated with equivalent force in the PRD.

## Gaps

1. **Initialization does not explicitly include pre-included bundles' template work.** PRD FR31 says a
   project-template pack materialises during initialization and bundle-template packs materialise during
   bundle creation or enablement. Approved Story 3.2 additionally requires initialization itself to give
   every pre-included bundle its applicable mandatory and template-defined tasks. Without that outcome,
   initialization could satisfy FR31 while handing off an incomplete backlog.

2. **Bundle scope is missing from the inspectable materialised-task identity.** PRD FR34 requires stable key,
   template origin, and defining revision in Backlog.md. Approved Story 3.3 also requires each bundle task to
   expose its bundle scope independently of its displayed title. This matters because producer-scoped keys can
   repeat across bundles and title identity is explicitly insufficient.

3. **Invalid-pack diagnostics may degrade to fail-fast reporting.** PRD FR35 requires malformed definitions,
   collisions, unavailable context, dependency failures, cycles, and ownership conflicts to be reported before
   mutation, but does not require all detected problems and affected contributions to be reported together.
   Approved Stories 3.1–3.3 require aggregated findings for both inspection and operation preflight.

4. **The inert-context restriction is explicit for task text but not for acceptance outcomes.** PRD FR30 and
   the shared constraint limit task text to literal text and documented WPM context. Approved Story 3.1 applies
   the same restriction when contextual values occur in acceptance outcomes. Leaving acceptance outcomes out
   permits a task pack to smuggle in promptable or executable interpolation through criteria while still
   appearing declarative.

5. **The non-regression boundary for unrelated task-producing commands is absent.** The investigation
   inventories eleven current command cases, and the approved epic's Additional Requirements state that
   unrelated command-triggered catalogs and their cardinalities remain unchanged. PRD NFR11 protects no-pack
   initialization/create/enable behavior, but does not protect version, dependency, target, skill, or advisor
   task producers from accidental scope expansion.

## Scope Boundary Preserved

None of these gaps calls for template-pack evolution, drift reconciliation, automatic retirement, legacy
task-pack adoption, missing-backlog or fresh-clone reconstruction, a generic authoring-task reconciliation
surface, or durable command-event history. Those outcomes remain explicitly deferred.
