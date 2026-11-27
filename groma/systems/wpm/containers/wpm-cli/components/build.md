---
type: C4 Component
title: Build
status: stable
groma:
  id: build
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/core/operations/build.ts
  group: Portable package output
description: Selects and packages registered deliverable content.
---

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/core/operations/build.ts](../../../../../../src/core/operations/build.ts) | [src/adapters/packager.ts](../../../../../../src/adapters/packager.ts) | Writes portable archives | Injected packaging callback |
| [src/core/operations/build.ts](../../../../../../src/core/operations/build.ts) | [recipient-coding-agent](../../../../../externals/recipient-coding-agent.md) | Supplies portable instructions | Authored package archive |
