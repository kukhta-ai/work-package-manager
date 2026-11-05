---
type: C4 Component
title: Effect ports
status: stable
groma:
  id: effect-ports
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/core/ports/index.ts
    - scanner: typescript
      file: src/core/ports/clock.ts
      symbol: Clock
    - scanner: typescript
      file: src/core/ports/environment.ts
      symbol: Environment
    - scanner: typescript
      file: src/core/ports/filesystem.ts
    - scanner: typescript
      file: src/core/ports/backlog.ts
  group: Domain validation
description: Defines the filesystem, Backlog, clock and environment interfaces.
---

Core decisions receive these synchronous ports. Concrete adapters implement disk and process effects, while tests substitute fakes. Confined filesystem methods preserve ownership and preimage checks at write boundaries.
