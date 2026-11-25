---
type: C4 Component
title: Optional APM composition
status: stable
groma:
  id: apm
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/adapters/apm.ts
  group: vNext authoring
description: Prepares pinned APM worker context
---

Invokes explicitly approved APM 0.39.0 distributions with isolated native state. Separate lock, install and compile phases preserve native dependency evidence; WPM projects secret-free MCP configuration, binds exact source/module/output inventories and supports journaled offline prepared-image replay. Build captures only qualified native context and never launches an agent.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/adapters/apm.ts](../../../../../../src/vnext/adapters/apm.ts) | [apm-cli](../../../../../externals/apm-cli.md) | Composes native agent context | Explicit executable and argv |
| [src/vnext/adapters/apm.ts](../../../../../../src/vnext/adapters/apm.ts) | [src/vnext/adapters/portable-tree.ts](../../../../../../src/vnext/adapters/portable-tree.ts) | Checks context path collisions | Pure TypeScript validation call |
| [src/vnext/adapters/apm.ts](../../../../../../src/vnext/adapters/apm.ts) | [src/vnext/core/worker-context.ts](../../../../../../src/vnext/core/worker-context.ts) | Projects native connection context | Pure target projection |
| [src/vnext/adapters/apm.ts](../../../../../../src/vnext/adapters/apm.ts) | [src/vnext/adapters/apm-source-tree.ts](../../../../../../src/vnext/adapters/apm-source-tree.ts) | Stages owned native inputs | Journaled filesystem copy |
