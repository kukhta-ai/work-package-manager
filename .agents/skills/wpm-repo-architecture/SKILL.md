---
name: wpm-repo-architecture
description: Inspect and change WPM dependency boundaries, domain contracts, and Groma architecture records. Use for structural WPM changes.
---

# Maintain WPM architecture

Read [the vNext contract](../../../docs/vnext.md) and [development boundaries](../../../docs/development.md). Legacy architecture remains in docs/12 and docs/13. Inspect the affected owner with `npm run groma:view -- <file>`; a missing or stale map is unverified evidence.

Keep domain core independent of CLI frameworks, filesystem, subprocesses, environment, network, clocks, randomness, and output. Pure path and URL transformations are allowed. Effects enter through injected ports; adapters implement them; composition roots wire dependencies. Check transitive imports, utility detours, re-exports, aliases, dynamic imports, ambient effects, and production imports of test or tooling code.

Use graph checks and negative fixtures to prove constraints. Review changes to architecture policy independently; a broad exception or ignored directory must not conceal a violating dependency.

After structural changes run `npm run groma:scan`, inspect scanner readiness and coverage, then curate stable ownership and relationships through Groma CLI. Preserve curated prose when scanning. A directory is not automatically a deployment container; mark proposed modules as drafts until implemented. Groma duplicate-logic lint is advisory evidence, not the architectural gate.

Record consequential decisions and affected stable IDs; update task file references through Backlog CLI without dropping existing entries. Keep Groma exports private because they may embed source.
