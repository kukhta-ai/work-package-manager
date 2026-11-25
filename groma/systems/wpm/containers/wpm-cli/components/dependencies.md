---
type: C4 Component
title: Package dependency graph
status: stable
groma:
  id: dependencies
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/core/dependencies.ts
description: Resolves exact package instances through an injected local catalog
---

Pure resolution preserves compatible pins, represents multiple versions and package cycles, and prunes unavailable optional branches. Runtime projection excludes root development dependencies; operation prerequisites remain a separate acyclic contract.

## Derived relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/core/dependencies.ts](../../../../../../src/vnext/core/dependencies.ts) | [src/vnext/adapters/package-workspace.ts](../../../../../../src/vnext/adapters/package-workspace.ts) | Invokes supplied callback: frozen | typescript |
