---
id: TASK-22
title: Implement the integrity service (vendored-content hashing + wpm.lock)
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 02:22'
labels: []
dependencies:
  - TASK-12
ordinal: 22000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each vendored third-party artifact is pinned to a recorded source, resolved version, and content fingerprint (doc 08/13)
- [x] #2 Verification passes when vendored content matches its pinned fingerprint and fails when the content has drifted
- [x] #3 The recorded pins are sufficient to determine later exactly which version of each artifact was bundled and from where
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrity service src/core/services/integrity.ts (PURE: node:crypto [pure hashing, allowed -- NOT on the core-boundary forbidden list] + the task-13 yaml leaf; boundary-clean). hashArtifactFiles(files): deterministic, ORDER-INDEPENDENT (path-sorted), LENGTH-PREFIXED <bytes>:<path><bytes>:<content> per file -> INJECTIVE sha256 (reviewer adversarially attacked it -- classic {a|bc}vs{ab|c}, colon-in-path/content, digit-boundary, content-mimicking-a-prefix, unicode byte-vs-char via Buffer.byteLength, DEEP stream-reparse -- ALL distinct), 'sha256:'-prefixed; rename AND content-change both alter it. buildLockfile(artifacts) -> Lockfile {version:1, artifacts: name->{source, version, hash}} (AC#1; AC#3 source = provenance string rich enough for 'from where'). verifyLockfile(lock, current) -> {ok, drifted, missing, extra} -- PASSES on match, FAILS naming drifted on a single-byte change (the --frozen-lockfile catch), DATA not throws (AC#2). serializeLockfile/parseLockfile (plain YAML, machine-managed) round-trip LOSSLESSLY (pins recoverable, AC#3); a malformed/tampered wpm.lock THROWS descriptively (all 9 shapes) -- correct data-vs-throw split. SKILLS RUN (Rule 3): worker bmad-create-story + bmad-dev-story + bmad-qa-generate-e2e-tests (all head-less, sprint-status suppressed); reviewer bmad-story-automator-review (report-only) -> APPROVE with ZERO findings. No new deps (node:crypto built-in). Gate green (tsc 0 / biome 83 / vitest 315 / npm ci clean, single process). Completes Phase C (services tier: schema/render/template-resolver/version-constraint/derived-artefacts/validate/materialisation/integrity).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
