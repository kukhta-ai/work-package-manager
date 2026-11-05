---
type: C4 Component
title: Exit
status: stable
groma:
  id: exit
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/util/exit.ts
  group: CLI interaction
description: Formats failures and maps them to CLI exit status.
---

## Derived relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/util/exit.ts](../../../../../../src/util/exit.ts) | [src/cli.ts](../../../../../../src/cli.ts) | Invokes supplied callback: write | typescript |
