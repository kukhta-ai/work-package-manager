---
type: C4 Component
title: Portable dependency archives
status: stable
groma:
  id: package-archive
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/adapters/package-archive.ts
description: Inspects immutable archive bytes without extraction
---

Accepts the regular-file USTAR subset with checksums, portable paths and a bounded decompression size. Content inventories bind graph imports and generated releases; malformed or private content fails before use.
