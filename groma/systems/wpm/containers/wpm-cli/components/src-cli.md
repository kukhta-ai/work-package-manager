---
type: C4 Component
title: CLI composition root
status: stable
groma:
  id: src-cli
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/cli.ts
  group: CLI interaction
description: Builds the command tree, wires concrete adapters and formats command results.
---

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/cli.ts](../../../../../../src/cli.ts) | [src/vnext/cli.ts](../../../../../../src/vnext/cli.ts) | Routes vNext commands | Commander registration |
