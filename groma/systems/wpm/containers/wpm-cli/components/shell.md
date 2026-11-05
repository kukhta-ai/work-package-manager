---
type: C4 Component
title: Shell
status: stable
groma:
  id: shell
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/util/shell.ts
      symbol: runSync
  group: Host effects
description: Escapes explicit subprocess arguments for supported host shells.
---
