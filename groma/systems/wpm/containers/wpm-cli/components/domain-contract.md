---
type: C4 Component
title: Legacy domain contract
status: stable
groma:
  id: domain-contract
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/core/model/index.ts
    - scanner: typescript
      file: src/core/model/result.ts
    - scanner: typescript
      file: src/core/model/template.ts
    - scanner: typescript
      file: src/core/model/operation.ts
    - scanner: typescript
      file: src/core/model/branded.ts
      symbol: Brand
    - scanner: typescript
      file: src/core/model/project.ts
      symbol: Project
    - scanner: typescript
      file: src/core/model/bundle.ts
    - scanner: typescript
      file: src/core/model/version.ts
    - scanner: typescript
      file: src/core/model/constants.ts
    - scanner: typescript
      file: src/core/model/ids.ts
    - scanner: typescript
      file: src/core/model/manifest.ts
    - scanner: typescript
      file: src/core/model/archive.ts
  group: Domain validation
description: Defines validated package identities, versions and project data.
---

Branded parsers produce validated domain values. Project, bundle and template data describe the legacy authored package contract, and structured results retain validation failures without output or I/O.
