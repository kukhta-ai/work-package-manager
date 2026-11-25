# Pure domain core

Read the repository root instructions before editing this directory. Inject effects through ports; do not import filesystem, subprocess, network, CLI frameworks, environment adapters, or development tooling, including through utilities and re-exports. Avoid ambient environment, clocks, randomness, timers, and output. Pure `node:path` and `node:url` transformations are allowed.

Model domain rejection paths explicitly and test them with deterministic injected fakes. Inspect architecture changes with the repository architecture skill and graph gate; a direct-import lint pass alone is insufficient.
