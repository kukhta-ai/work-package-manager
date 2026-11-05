---
type: C4 Component
title: Legacy descriptor codecs
status: stable
groma:
  id: descriptor-codecs
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/core/services/schema/index.ts
    - scanner: typescript
      file: src/core/services/schema/problems.ts
    - scanner: typescript
      file: src/core/services/schema/template.ts
      symbol: parseTemplateDescriptor
    - scanner: typescript
      file: src/core/services/schema/bundle.ts
    - scanner: typescript
      file: src/core/services/schema/manifest.ts
      symbol: parseManifest
  group: Domain validation
description: Validates and serializes legacy project, bundle and template descriptors.
---

Parsers narrow untrusted plain data into the legacy domain contract, report field-specific failures, and retain opaque template-authoring declarations for their dedicated inspector. YAML text parsing and file effects remain outside this component.
