---
type: C4 Component
title: APM source references
status: stable
groma:
  id: apm-source
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/core/apm-source.ts
      symbol: apmReference
description: Validates canonical remote setup locators
---

Pure reference grammar distinguishes explicit remote APM setup declarations from confined local sources. It rejects credentials, query strings and unsafe segments before adapters resolve any content.
