---
id: TASK-135
title: Complete supported-host release boundaries
status: In Progress
assignee: []
created_date: '2026-08-28 19:21'
updated_date: '2026-08-29 05:00'
labels:
  - follow-up
  - ci
  - windows
  - filesystem
  - packed-install
  - release-gate
  - test-harness
dependencies:
  - TASK-134
priority: high
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #5 current-tip CI exposed Windows release-boundary defects, portable archive-representation differences, and real Backlog-driven integration journeys whose supported-host execution time exceeds the original generic ceiling. Restore the supported-host contract with narrow, evidence-backed changes and no broad filesystem, quoting, retry, or product-behavior expansion.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A missing confined file that is a direct child of a stable non-empty confinement root publishes the exact requested bytes on Windows and leaves no transient staging entry.
- [ ] #2 Direct-child confined publication still refuses an existing target, an escaped path, or a changed parent identity without replacing unrelated entries.
- [ ] #3 An installed npm command shim beneath a Windows path containing spaces executes through the resolved invocation with its exact arguments and reports the installed version.
- [ ] #4 Unsafe Windows command expansion or quoting syntax remains rejected, and a failed installed-command execution retains actionable diagnostics.
- [ ] #5 The real bundle-create and source-free packed-install journeys complete their publication and installed-command boundaries on supported Windows runners.
- [ ] #6 Every real-CLI integration journey completes on supported Windows runners within 120 seconds; a stalled journey still fails within that bound.
- [ ] #7 Existing and first-publication workspace state files that use request-bound quarantine publish exact bytes on Windows and retire their staged or prior evidence without residue.
- [ ] #8 Synthetic core-bundle release fixtures include the required minimal install backlog and remain aliasable through the supported Windows fallback.
- [ ] #9 Workspace-handoff integration expectations accept the product portable path dialect on every supported host without changing product path output.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Initial evidence: literal bmad-investigate @ PR #5 candidate b6254a3; push run 33196449021 and pull-request run 33196452919. Confirmed gaps: no-quarantine direct-child writeConfined geometry, Node default argv re-escaping of the cmd.exe outer envelope, and three observed 60-second E2E overruns. Preserve hard-link no-clobber publication, confinement/identity checks, unsafe cmd syntax rejection, and focused timeout policy. Reject NodeFS refactors, blanket EPERM handling, shell:true, retries, global timeout increases, and broad normalization. Cycle-2 evidence: literal bmad-investigate @ candidate 9be9a43, run 33207995447, Windows/Node20 job 98973889650. Direct no-quarantine NodeFS and isolated spaced-prefix Backlog pass. Remaining causes: quarantined state cleanup under a retained publication-parent handle; two invalid core fixtures missing install-backlog/config.yml; and three handoff expectations using native paths. Keep the cmd fix; reject alias fallback changes, product path normalization, retries, and broad filesystem refactors. Cycle-3 evidence: literal bmad-investigate @ candidate 7cbba3d, run 33215249287, Windows/Node20 job 98997319223. Complete log: 10 failed files / 113 failed tests, all one deterministic replacement defect. After the original public file is verified and renamed to quarantine .displaced, its owned initialPublicDescriptor remains open through unlink; Windows leaves the name delete-pending and retained lstat receives EPERM. Close and clear only that verified descriptor before displaced unlink; preserve identity, digest, lstat, cleanup, confinement, and no-clobber checks. Reject EPERM-as-missing, retries, sleeps, more directory-handle cases, or changes to aliases, paths, cmd handling, fixtures, or timeouts.

Cycle-4 evidence: literal bmad-investigate @ candidate 40b0f5c, run 33220544514, Windows/Node22 job 99013523303. The descriptor repair moved 79 failures to pass; NodeFS 55/55, state families, and cli.init pass with no EPERM/EACCES or contribution-record diagnostics, so another filesystem patch is rejected. Remaining observed boundaries are 23 real-CLI timeouts (22 at 60s and one at 90s), ten opaque bundle-new status assertions that discard captured diagnostics, and one archive assertion requiring an explicit directory entry even though its layout helper removes directory-only entries. Both Windows cells agree while all four POSIX cells pass. Measured Windows cost scales with real command count (about 40-43s per bundle and 85-95s for multi-command journeys); use one bounded 120s supported-host integration ceiling, accept an exact alias entry or a descendant under its prefix, and expose captured CLI failure diagnostics before considering any product change.

Cycle-4 source trace: the same literal bmad-investigate resolved the ten opaque bundle-new exits as a distinct Windows alias-currency defect. After targets add claude-code, the verified `.claude/skills` directory-copy alias is current and therefore omitted from aliasesToCreate; bundle new then mutates the canonical installer-skills tree by adding the bundle advisor and refreshing the project installer skill, refreshes only missing aliases, and its final complete-plan postcondition correctly rejects the now-stale copy. POSIX symlinks remain live. Repair only the already-verified copy alias at the existing planned alias boundary when this operation changes its source; preserve refusal of stale or unowned copies and do not change writeConfined.

Cycle-4 review: literal bmad-story-automator-review requested changes for one High finding. The proposed refresh revalidated the destination and then used in-place copyTree, whose merge/overwrite contract permits a check-to-copy destination edit to be overwritten and a mid-copy failure to expose a public mixed tree. Cycle 5 must retain frozen-preflight selection, ancestor containment, symlink exclusion, typed progress, and the final complete-plan postcondition while publishing no-clobber; a raced destination must never be overwritten, and failure must preserve the prior exact copy or request-owned recoverable evidence. Add deterministic coverage for a collision introduced after the last evidence check and a copy failure after at least one staged entry, proving no public mixed tree.

Cycle-5 review: literal bmad-story-automator-review confirmed the atomic port materially closes the prior mixed-tree defect but requested changes for one remaining POSIX no-clobber gap. POSIX rename can replace an empty directory raced into the post-detach publication interval, and restore renames share that risk; a direct Linux inode probe confirmed replacement. Cycle 6 uses the representation-specific boundary: real Windows retains staged whole-directory publication with native race coverage, while POSIX promotes a preflight-proven inherited copy to a directly created exact symlink whose creation fails atomically if the public path exists. POSIX failure retains displaced old-copy evidence and never rename-restores over the public path. Add post-detach/pre-publication empty-directory identity preservation and publication-failure recovery coverage. Review also safely cleared alias-handle ownership before close so finally cannot retry an ambiguously closed handle.

Cycle-6 implementation and QA: literal bmad-dev-story and bmad-qa-generate-e2e-tests implemented representation-safe confined alias refresh. POSIX publishes a direct exact relative symlink with atomic EEXIST refusal and retained recovery evidence; Windows retains verified staged whole-directory publication. Deterministic post-detach races preserve directory/file/symlink identity, partial-stage failures preserve public bytes, and publication failures retain request-owned evidence. Focused evidence: NodeFS 61 passed with one native-Windows-only skip, bundle-authoring 34 passed, two CLI representation journeys passed, QA 6 passed, typecheck/build/Biome/process/diff passed. Cycle-6 independent review: literal bmad-story-automator-review approved with no findings; adapter+core 95 passed/1 native-Windows skip, direct Linux raced directory/file/symlink probes returned EEXIST with unchanged inode. Native Windows remains the candidate gate.

Cycle-7 gate evidence: literal bmad-investigate @ candidate 62bff985, run 33231248102, Windows/Node20 job 99044366184. Exact result: 141 files passed, one file failed; 1,974 tests passed, 16 skipped, two failed. No native errno, mutation failure, timeout, or product exit-code failure. Both failures are invalid build-E2E expectations: archiveLayout removes directory-only entries but TASK-128 still requires exact `.claude/skills` and `bundles/web/.claude/skills` entries despite correct descendant content; TASK-95 compares native `C:\...` workspaceRoot against the product portable `C:/...` dialect. Apply only exact-or-descendant scope checks and compare to toPosix(proj). Reject product path/archive/alias changes, retries, and timeout changes.

Cycle-7 implementation/QA: literal bmad-dev-story and bmad-qa-generate-e2e-tests changed only cli.build.e2e expectations: each declared Claude scope accepts an exact entry or slash-delimited descendant, and serialized workspaceRoot is compared with toPosix(proj). Focused E2E 2/2 passed twice; build/typecheck/Biome/process/diff passed. Cycle-7 independent review: literal bmad-story-automator-review approved after auto-fixing one Medium test-only omission—the later TASK-95 archive helper repeated the same exact-directory assumption, so it now applies the same independent per-scope evidence rule. No product/config/timeout/archive-writer/alias behavior changed.
<!-- SECTION:NOTES:END -->
