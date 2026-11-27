---
id: TASK-30
title: Author the minimal project template
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 04:45'
labels: []
dependencies:
  - TASK-16
ordinal: 30000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Initialising from the minimal project template produces a working project: a manifest, an always-read front-door file, the unattended-loop instructions, an entry README, and the project's orchestrator skill (doc 06/07)
- [x] #2 The front-door file carries recognition-and-kickoff, the install shape, and the standing rules described in doc 07
- [x] #3 On-demand stubs for an advisor skill, an install-time skill, and a payload skill are available for later use (doc 06)
- [x] #4 Every placeholder in the template is substituted in the produced project, leaving no unresolved markers
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Authored the real minimal project template at templates/project/minimal/ (doc 06/07). template.yml + files/ (manifest.yml.tmpl with single-space inline comments, AGENTS.md.tmpl front-door, README.md.tmpl, RALPH-LOOP.md.tmpl unattended-loop prompt, installer-skills/{{project-name}}-installer/SKILL.md.tmpl orchestrator + references/journaling.md.tmpl) + snippets/ (AGENTS.md + orchestrator SKILL.md for re-derivation, plus advisor/installer-skill/payload skill stubs). AC2: the front-door substantively carries doc-07 recognition-and-kickoff, the install shape (orient/detect/menu/requires/per-task detect-setup-verify-record/resume/close), and the seven standing rules, with mechanics deferred to references/journaling.md (reviewer verified end-to-end vs doc 07, not just keywords). AC3: the three stubs carry the three distinct trigger disciplines (advisor=user NEED, install-time helper=while-working-scope, payload=RUNTIME). AC4: full render leaves no {{}} markers in content or paths (incl the {{project-name}}-installer/ directory segment). Packaging: templates/ added to package.json files. BMAD skills: worker ran create-story, dev-story, qa-generate-e2e-tests (the worker was cut off at the final lint step; orchestrator finished the gate - biome --write + removed an unused import - and added the reviewer-requested drift-guard test). Reviewer ran story-automator-review, verdict APPROVE (6 probes pass, doc-07 substantive conformance, fidelity note honored). SHOULD resolved: added a drift-guard test pinning files/ copies byte-identical to their snippets/ source. Forward note for task-33: make the front-door + orchestrator snippets-only, render via the deriver in init (single source). Gate: tsc 0, biome 0 warnings, vitest 440 passed, npm ci 0.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
