---
type: C4 Component
title: Release command entrypoints
status: stable
groma:
  id: release-cli
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/release-cli.ts
      symbol: registerReleaseCommands
  group: Portable releases
description: Routes one-root release and external review commands
---

Parses explicit artifact and source choices for build, view, verify and external static review. Read commands use saved subjects without discovering native authoring state or starting a worker.

## Derived relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/release-cli.ts](../../../../../../src/vnext/release-cli.ts) | [src/cli.ts](../../../../../../src/cli.ts) | Invokes supplied callback: write | typescript |

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/release-cli.ts](../../../../../../src/vnext/release-cli.ts) | [src/vnext/adapters/releases.ts](../../../../../../src/vnext/adapters/releases.ts) | Routes release requests | Adapter calls |
