---
type: C4 Component
title: vNext workspace adapter
status: stable
groma:
  id: vnext-workspace
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/adapters/workspace.ts
      symbol: VnextWorkspace
  group: vNext authoring
description: Persists and packages vNext authoring state through a concrete filesystem adapter.
---

Owns local vNext authoring, native Backlog task access and package assembly. Successful native calls are guarded before and after by confined real-file tree checks. It captures authored bytes and checks complete portable output paths before accepting an archive, consuming verified optional APM context only when selected.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/adapters/workspace.ts](../../../../../../src/vnext/adapters/workspace.ts) | [src/vnext/core/model.ts](../../../../../../src/vnext/core/model.ts) | Validates package contract | Pure TypeScript functions |
| [src/vnext/adapters/workspace.ts](../../../../../../src/vnext/adapters/workspace.ts) | [src/vnext/adapters/apm.ts](../../../../../../src/vnext/adapters/apm.ts) | Reads prepared optional context | Receipt-bound adapter call |
| [src/vnext/adapters/workspace.ts](../../../../../../src/vnext/adapters/workspace.ts) | [src/vnext/adapters/portable-tree.ts](../../../../../../src/vnext/adapters/portable-tree.ts) | Checks archive path collisions | Pure TypeScript validation call |
