---
type: C4 Component
title: Posix path
status: stable
groma:
  id: posix-path
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/util/posix-path.ts
      symbol: toPosix
  group: Portable text
description: Normalizes portable package paths without filesystem effects.
---
