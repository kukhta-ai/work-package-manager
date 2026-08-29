---
id: TASK-12
title: Implement the FileSystem port (real + in-memory adapters)
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 23:19'
labels: []
dependencies:
  - TASK-6
ordinal: 12000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All file-system access the builder needs is reached through one replaceable abstraction, so logic can run against an in-memory file system in tests (doc 13)
- [x] #2 A write either fully succeeds or leaves the previous file intact — a partial or corrupt file is never observed after an interrupted write
- [x] #3 Requesting a scope alias yields a working alias on POSIX, and on Windows falls back to a copy with the user warned, without the caller needing to know which happened (doc 12)
- [x] #4 Writing into a not-yet-existing directory path succeeds, creating parents as needed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
FileSystem port (src/core/ports/filesystem.ts -- pure SYNC interface: read/write/exists/makeDirectories/list/copyTree/remove/ensureAlias + DirEntry + AliasResult) with real adapter (src/adapters/node-fs.ts, node:fs sync) + in-memory fake (src/adapters/memory-fs.ts, Map-backed) + symlink strategy (src/util/symlink.ts, injectable platform default process.platform). CROSS-CUTTING DECISION: the core is SYNCHRONOUS (recorded in state). AC#2 ATOMIC write proven REAL: temp file in the SAME dir (dirname+join) then renameSync (atomic same-fs), unlink cleanup on error; forced-failure test -> original intact, zero .tmp residue. AC#3 ensureAlias returns AliasResult (symlink | copy+warning), never prints; BOTH branches tested on Linux (POSIX real symlink realpath-resolves to target + read-through; injected win32 -> real recursive copy + Windows warning). AC#4 parents auto-created (mkdir recursive). AC#1 one abstraction; the in-memory fake is faithful -- reviewer live-differential 9/10 then 10/10 after F1 (memory list-of-file now throws ENOTDIR like node, parity test added). REVIEW: dedicated reviewer APPROVE + 1 fix cycle (F1 fake-parity SHOULD + F3 copyTree-merge-doc NIT applied; F2 hand-rolled errors lacking .code left -- core never inspects codes). Gate green (tsc 0 / biome 42 / vitest 153, 28 adapter/port/util tests). No new deps (node:fs built-in).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
