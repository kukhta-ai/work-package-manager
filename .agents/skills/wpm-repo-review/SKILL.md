---
name: wpm-repo-review
description: Independently review WPM repository changes against behavioral contracts and executable quality policy. Use for WPM code or delivery review.
---

# Review WPM independently

Read [the development process](../../../docs/development.md), the task outcomes, and the full diff. Assess the final implementation rather than trusting a worker summary. Trace representative success and rejection paths through pure core, ports, adapters, and actual command wiring.

Prioritize observable correctness, path confinement, deterministic packages, mutation preflight, setup/default behavior, legacy compatibility, and development-artifact exclusion. Check that new source files enter type, graph, dead-code, security, and test scopes. Inspect suppressions, waivers, skipped jobs, and changes to policy as carefully as product changes.

Verify reported commands and their source revision. Read Groma ownership and dependency changes; distinguish curated facts from scanner guesses. Validate native projections with `npm run agents:check`; do not confuse static artifact validity with fresh-agent behavior.

Report concrete findings with reproduction or a failing assertion and practical consequence. Resolve material findings before the final `npm run quality:ci`. Candidate approval must identify source and artifact digests and the evidence for those exact bytes. Public distribution remains inactive; review does not authorize publication or merging.
