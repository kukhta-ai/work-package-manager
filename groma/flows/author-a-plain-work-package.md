---
type: Groma Flow
title: Author a plain work package
groma:
  id: author-a-plain-work-package
---

The author uses the CLI to change explicit workspace state. The adapter invokes pure contract checks; this flow does not launch or install a recipient agent.

## Steps

| From | To | Action |
| --- | --- | --- |
| [Author](../actors/work-package-author.md) | [CLI](../systems/wpm/containers/wpm-cli/components/src-cli.md) | Request a vNext authoring operation |
| [CLI](../systems/wpm/containers/wpm-cli/components/src-cli.md) | [vNext commands](../systems/wpm/containers/wpm-cli/components/vnext-cli.md) | Route the requested operation |
| [vNext commands](../systems/wpm/containers/wpm-cli/components/vnext-cli.md) | [Workspace](../systems/wpm/containers/wpm-cli/components/vnext-workspace.md) | Load and persist explicit workspace state |
| [Workspace](../systems/wpm/containers/wpm-cli/components/vnext-workspace.md) | [Contract](../systems/wpm/containers/wpm-cli/components/vnext-contract.md) | Validate operations, groups and setup associations |
