---
type: C4 Component
title: Node fs
status: stable
groma:
  id: node-fs
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/adapters/node-fs.ts
      symbol: NodeFileSystem
  group: Host effects
description: Implements filesystem effects and confined ownership-aware mutation.
---
