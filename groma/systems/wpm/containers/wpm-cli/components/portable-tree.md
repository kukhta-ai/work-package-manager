---
type: C4 Component
title: Portable tree validation
status: stable
groma:
  id: portable-tree
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/adapters/portable-tree.ts
      symbol: assertPortableTree
  group: vNext authoring
description: Checks portable file and directory collisions across complete vNext trees.
---

Workspace archive assembly and optional APM inventories call this shared pure validator before accepting complete trees. It checks each declared path and implied parent directory so file/directory aliases and case/NFC collisions fail before artifact acceptance. Filesystem capture remains with its callers.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/adapters/portable-tree.ts](../../../../../../src/vnext/adapters/portable-tree.ts) | [src/vnext/core/model.ts](../../../../../../src/vnext/core/model.ts) | Validates portable path segments | Pure TypeScript functions |
