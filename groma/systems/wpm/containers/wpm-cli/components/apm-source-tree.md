---
type: C4 Component
title: APM source staging
status: stable
groma:
  id: apm-source-tree
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/adapters/apm-source-tree.ts
      symbol: stageApmSource
description: Stages recoverable native dependency inputs
---

Copies authored APM inputs into an owned journaled native root. Local references are anchored inside the staged closure, MCP declarations are reserved for WPM projection, and exact before/after inventories protect retries and relocation without rewriting author source.
