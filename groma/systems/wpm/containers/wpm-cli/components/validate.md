---
type: C4 Component
title: Validate
status: stable
groma:
  id: validate
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/core/services/validate.ts
      symbol: validateProject
  group: Domain validation
description: Aggregates semantic problems across the loaded project.
---
