---
type: C4 Component
title: Saved release orchestration
status: stable
groma:
  id: releases
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/adapters/releases.ts
      symbol: ReleaseWorkspace
  group: Portable releases
description: Builds and verifies portable runtime release content
---

Captures one selected root and its existing locked runtime graph through package authoring adapters. Reuses frozen import validation for saved artifact semantics and projects native support from saved files. Coordinates artifact representations and external review while preserving existing build commands.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/adapters/releases.ts](../../../../../../src/vnext/adapters/releases.ts) | [src/vnext/adapters/release-artifact.ts](../../../../../../src/vnext/adapters/release-artifact.ts) | Captures and publishes artifacts | Adapter calls |
| [src/vnext/adapters/releases.ts](../../../../../../src/vnext/adapters/releases.ts) | [src/vnext/adapters/release-review.ts](../../../../../../src/vnext/adapters/release-review.ts) | Prepares external review evidence | Adapter calls |
| [src/vnext/adapters/releases.ts](../../../../../../src/vnext/adapters/releases.ts) | [src/vnext/adapters/package-workspace.ts](../../../../../../src/vnext/adapters/package-workspace.ts) | Captures and validates runtime packages | Adapter calls |
