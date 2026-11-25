---
type: C4 Component
title: System clock
status: stable
groma:
  id: system-clock
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/adapters/system-clock.ts
      symbol: SystemClock
  group: Host effects
description: Supplies the current instant through the Clock port.
---
