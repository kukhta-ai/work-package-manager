---
type: C4 Component
title: Package command surface
status: stable
groma:
  id: package-cli
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/package-cli.ts
      symbol: registerPackageCommands
description: Routes workspace and dependency commands
---

Registers the additive vNext workspace and package command tree. Selectors identify an exact source package; adapters implement effects while the dependency resolver receives an injected catalog.

## Derived relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/package-cli.ts](../../../../../../src/vnext/package-cli.ts) | [src/cli.ts](../../../../../../src/cli.ts) | Invokes supplied callback: write | typescript |

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/package-cli.ts](../../../../../../src/vnext/package-cli.ts) | [src/vnext/adapters/package-workspace.ts](../../../../../../src/vnext/adapters/package-workspace.ts) | Routes local package requests | Adapter calls |
