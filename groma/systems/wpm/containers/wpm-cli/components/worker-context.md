---
type: C4 Component
title: Worker connection projection
status: stable
groma:
  id: worker-context
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/core/worker-context.ts
      symbol: projectMcp
description: Projects secret-free native MCP declarations
---

Pure target projection validates resolved stdio and HTTP declarations, target selection and runtime variable bindings. Codex and Claude project configurations retain credential references; no filesystem, network, environment or subprocess effect enters this contract.
