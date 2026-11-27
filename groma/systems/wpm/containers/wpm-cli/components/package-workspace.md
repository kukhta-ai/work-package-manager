---
type: C4 Component
title: Package workspace and graph delivery
status: stable
groma:
  id: package-workspace
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/adapters/package-workspace.ts
      symbol: PackageWorkspace
description: Coordinates local catalogs, graph locks and portable composition
---

Selects workspace packages without guessing. Captures confined native sources and local archives, persists recoverable declaration and lock edits, and composes namespaced runtime instances. Workspace reservations serialize identity changes; independent package reservations protect source edits.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/adapters/package-workspace.ts](../../../../../../src/vnext/adapters/package-workspace.ts) | [src/vnext/core/dependencies.ts](../../../../../../src/vnext/core/dependencies.ts) | Resolves exact package graphs | Injected local catalog |
| [src/vnext/adapters/package-workspace.ts](../../../../../../src/vnext/adapters/package-workspace.ts) | [src/vnext/adapters/package-archive.ts](../../../../../../src/vnext/adapters/package-archive.ts) | Validates dependency archives | Bounded byte inspection |
| [src/vnext/adapters/package-workspace.ts](../../../../../../src/vnext/adapters/package-workspace.ts) | [src/vnext/adapters/workspace.ts](../../../../../../src/vnext/adapters/workspace.ts) | Captures native authored packages | Confined source and transaction ports |
| [src/vnext/adapters/package-workspace.ts](../../../../../../src/vnext/adapters/package-workspace.ts) | [src/vnext/adapters/apm.ts](../../../../../../src/vnext/adapters/apm.ts) | Verifies imported native context | Canonical MCP metadata comparison |
| [src/vnext/adapters/package-workspace.ts](../../../../../../src/vnext/adapters/package-workspace.ts) | [src/vnext/adapters/release-artifact.ts](../../../../../../src/vnext/adapters/release-artifact.ts) | Validates imported release envelopes | Adapter calls |
