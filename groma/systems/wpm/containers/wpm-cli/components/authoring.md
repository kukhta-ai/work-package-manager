---
type: C4 Component
title: vNext authoring decisions
status: stable
groma:
  id: authoring
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/vnext/core/authoring.ts
  technology: Pure TypeScript, SemVer, YAML
description: Evaluates operation source readiness, direct group membership changes and semantic package version transitions without effects.
---

Authors keep operation text in native Backlog.md tasks. This component evaluates authored-source requirements without treating recipient acceptance checks as completed work. Group edits preserve the distinction between selection and prerequisites. Stable-identity YAML sequence edits retain authored comments and reject alias transitions that change unrelated source. Version decisions have no build or publication effects.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/vnext/core/authoring.ts](../../../../../../src/vnext/core/authoring.ts) | [src/vnext/core/source-text.ts](../../../../../../src/vnext/core/source-text.ts) | Applies comment-preserving source transitions | Pure function call |
