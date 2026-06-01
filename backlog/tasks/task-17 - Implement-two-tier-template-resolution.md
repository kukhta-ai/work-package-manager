---
id: TASK-17
title: Implement two-tier template resolution
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 01:05'
labels: []
dependencies:
  - TASK-11
  - TASK-12
ordinal: 17000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Resolving a template name finds a project-local template before a built-in one of the same name (doc 10/12)
- [x] #2 Templates can be listed, filtered to those valid for a project versus for a bundle
- [x] #3 A name matching no template yields a clear not-found outcome
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Two-tier template resolver src/core/services/template-resolver.ts (PURE over the FileSystem port; imports node:path(pure) + parseYaml(task-13) + parseTemplateDescriptor(task-11) + model(task-10) + FS port -- NO node:fs). resolveTemplate(name, scope, deps): project-local root checked BEFORE built-in (first existing dir wins -> project-local shadows built-in, AC#1); reads the hit into a full task-10 Template (template.yml via parseYaml+parseTemplateDescriptor; recursive files/+snippets/ with paths RELATIVE to files/ so resolve->render compose -- proven by the acceptance test). listTemplates(deps, filter?): merges both roots keyed by scope/name (project-local shadows same-(name,scope) built-in; cross-scope does NOT shadow -- reviewer-verified), filters by scope (AC#2). Miss -> discriminated {found:false, name, scope, searched:[...]} naming the tiers, NOT a throw (AC#3; to be mapped to the Not-found DomainError at task-23). Error-model split (miss=data; malformed-found template.yml=descriptive throw) consistent with task-11/16. SKILLS RUN (Rule 3): worker bmad-create-story + bmad-dev-story + bmad-qa-generate-e2e-tests (all head-less, sprint-status writes suppressed); reviewer bmad-story-automator-review (report-only) -> APPROVE. No new deps. Gate green (tsc 0 / biome 66 / vitest 234 / npm ci clean). 2 non-blocking NITs: DEFERRED F1 a found template dir missing template.yml throws a raw ENOENT instead of a wrapped 'missing template.yml' message (future polish: fs.exists(descriptorPath) check in readTemplate); F2 TemplateSummary/TemplateResolution exported but referenced via signatures only (not dead -- public API).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
