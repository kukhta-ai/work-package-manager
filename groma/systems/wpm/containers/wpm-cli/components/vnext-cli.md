---
type: C4 Component
title: vNext commands
status: stable
groma:
  id: vnext-cli
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/cli.ts
      symbol: registerVnextCommands
  group: CLI interaction
description: Registers the isolated vNext authoring command surface.
---

## Derived relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/cli.ts](../../../../../../src/vnext/cli.ts) | [src/cli.ts](../../../../../../src/cli.ts) | Invokes supplied callback: write | typescript |

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/cli.ts](../../../../../../src/vnext/cli.ts) | [src/vnext/adapters/workspace.ts](../../../../../../src/vnext/adapters/workspace.ts) | Persists authored work | Explicit workspace adapter |
