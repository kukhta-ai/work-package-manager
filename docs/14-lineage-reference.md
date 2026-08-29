# 14 · Appendix — Installer & Package-Manager Lineage

A reference, not part of the narrative. `00` makes the argument that this design stands on the shoulders of traditional installers and package managers; this appendix is the full pattern-by-pattern map behind that argument. Skim it on a first read and return when a specific mechanism in `06`–`09` makes you wonder "where did this come from?"

Both installers and package managers solved the same social problem we have: get software onto a stranger's machine without surprising or breaking them. The patterns below are decades of hard-won refinement we shouldn't reinvent. The right-hand column is where each one changes shape because our executor *reasons* instead of just running — the recurring theme of the whole document set.

| Old-world pattern | What it was for | New-generation translation |
|---|---|---|
| Wizard: Typical / Custom / Complete | Pick scope without thinking | A bundle menu (each line is a bundle's `summary`) with a recommended default; auto-detection collapses most of the clicks |
| EULA / "Do you accept" | Consent before proceeding | A plain-language plan preview — consent *and* safety gate before any machine change |
| Component tree with sizes | Choose features, see the cost | Bundle summaries show what they enable and rough effort; dependencies stay hidden |
| Progress bar | Show liveness | Bundle-level, narrated progress — the agent can say *why*, a bar can't |
| UAC / "requires administrator" | Stop for elevated permission | Human-in-the-loop pause, first-class and conversational |
| "A reboot is required" | Deferred completion | A step that completes only after a later condition (re-auth, agent restart) |
| Modify / Repair / Uninstall | Re-enter after install | A re-runnable orchestrator: add a bundle later, re-verify and fix drift (reconcile), tear down by replaying recorded inverse ops |
| dpkg/RPM **virtual packages** (`Provides:`) | Decouple deps from concrete package names | *Not adopted.* We use concrete bundle IDs as the dependency contract instead — see the next row |
| npm `dependencies` / Cargo workspace deps / Lerna package linkage | Concrete internal-deps with version constraints | Each bundle's `bundle.yml.requires` maps depended-on bundle IDs to npm-style version constraints (`^0.3.0`, `~1.2.0`); validated at workspace level by `wpm project validate` |
| Optional / peer dependencies | "Bring your own X" | The target-agent axis is a peer dependency — checked, not installed |
| `npm install <package>` later | Grow an install incrementally | Adding a bundle post-install = selecting one more independent bundle from the menu |
| package-lock | Reproducible installs | The receipt pins the agent's prior *decisions* against non-determinism — and lives in the task records, not a separate file |
| Ansible/Puppet idempotent modules; desired-state convergence | Apply only what isn't already true; reconcile drift | The recipe describes desired state; the executing agent's **DETECT-before-DO** step is exactly the idempotent-module contract ("verify current state; if already satisfied, do nothing"). The agentless-vs-agent axis gets a third point: the user *already has* a general-purpose agent, so we neither push over SSH nor install a daemon — we ship instructions the agent-they-have runs |
| npm/Cargo lockfile + SLSA provenance | Pin dependencies to exact version + hash; tamper-evidence | An `wpm.lock` pins each **vendored** third-party artifact (discipline skill, loop runner) to an exact version and content hash, verified at build (`08`). Because we distribute *instructions an agent will execute*, integrity on bundled-in third-party content is structural, not optional; signing/attestation are a later, opt-in hardening step |
| INSTALL_RECEIPT / dpkg `.list` | Record what a package placed | The per-task receipt: files referenced, plus the facts inspection can't recover |
| MSI rollback script | Undo a failed/again-run install | An inverse-op journal written at do-time, replayed in reverse |
| `brew leaves` / `apt autoremove` | Remove what's no longer needed | Removability computed from the `requires` graph, never a stored counter |
| `installed_on_request` / apt manual-vs-auto | Ownership of what to remove | Installed-vs-adopted: only ever reverse what you installed |
| dpkg conffiles | Preserve user-edited config | Compare placed files to their recorded checksum; preserve user changes, offer keep/replace/merge |
| pre/post-install scripts | Lifecycle hooks | A per-bundle lifecycle: detect → install → verify → how-to-use |
| `apt upgrade` / MSI major-upgrade | Move an install to a newer version | Update = Repair against a bumped target: run the new recipe against the persistent receipt |
| Flyway versioned vs repeatable migrations | Apply-once vs re-runnable steps | `kind:migration` tasks (run once, version-gated) vs `kind:state` tasks (idempotent, reconcile) |
| dpkg from-version arg / rpm `$1` | Do something only when upgrading from version X | The migration task's from-version gate, evaluated in its detection against the recorded version |
| Flyway `schema_history` table | Audit trail of applied migrations | The persistent receipt's completed `kind:migration` tasks — the applied-migration ledger |
| MSI UpgradeCode vs ProductCode | Stable product identity vs this version | A bundle's stable `id` vs its moving `version` — so an update isn't installed beside the old copy |
| semver | Independent versioning | Bundles version independently because they're isolated. The string is both a human hint for when a migration is likely needed (major bump) *and* machine-interpreted: each bundle's `requires` constraints are checked against dependees' versions at `project validate` |
