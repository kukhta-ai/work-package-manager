---
type: C4 Component
title: Process env
status: stable
groma:
  id: process-env
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/adapters/process-env.ts
      symbol: ProcessEnvironment
  group: Host effects
description: Supplies process environment and platform information through the Environment port.
---
