---
type: C4 Component
title: Backlog cli
status: stable
groma:
  id: backlog-cli
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/adapters/backlog-cli.ts
      symbol: BacklogCli
  group: Host effects
description: Executes and verifies Backlog.md commands through an explicit adapter.
---

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/adapters/backlog-cli.ts](../../../../../../src/adapters/backlog-cli.ts) | [backlog-md-cli](../../../../../externals/backlog-md-cli.md) | Manages authoring tasks | Explicit subprocess arguments |
