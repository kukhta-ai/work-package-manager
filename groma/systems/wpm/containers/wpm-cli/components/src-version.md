---
type: C4 Component
title: Version
status: stable
groma:
  id: src-version
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/version.ts
      symbol: VERSION
  group: CLI interaction
description: Provides the builder version reported by the CLI.
---
