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
description: Composes explicitly pinned APM context through separate lock, install and compile phases.
---

This optional adapter verifies the supplied APM executable digest and version, keeps target state under the owned workspace, records source/lock/output receipts, and exports supported native context only. Plain setup does not instantiate it. It does not authenticate, configure services or launch the recipient agent.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/adapters/apm.ts](../../../../../../src/vnext/adapters/apm.ts) | [apm-cli](../../../../../externals/apm-cli.md) | Composes native agent context | Explicit executable and argv |
| [src/vnext/adapters/apm.ts](../../../../../../src/vnext/adapters/apm.ts) | [src/vnext/adapters/portable-tree.ts](../../../../../../src/vnext/adapters/portable-tree.ts) | Checks context path collisions | Pure TypeScript validation call |
