---
type: C4 Component
title: vNext contract
status: stable
groma:
  id: vnext-contract
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/core/model.ts
  group: vNext authoring
description: Validates vNext operations, groups and optional worker setup declarations.
---

Operations retain stable IDs and prerequisites; groups select work independently from prerequisites. A missing setup association inherits the declared default, while null means no setup. Worker setup prepares a recipient agent that already exists, rather than provisioning an execution worker.
