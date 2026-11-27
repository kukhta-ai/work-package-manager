---
type: C4 Component
title: Portable release artifacts
status: stable
groma:
  id: release-artifact
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/adapters/release-artifact.ts
    - scanner: typescript
      file: src/vnext/adapters/release-codec.ts
  group: Portable releases
description: Captures and publishes bounded portable release containers
---

Reads immutable TGZ, ZIP and directory subjects with canonical inventory evidence and stable file capture. Publishes deterministic representations through owned stages, exact request journals and foreign-file preservation. ZIP encoding and decoding belong to this same representation boundary.
