# UX Review — Consent, Trust, and Recovery

## Overall verdict

Epic 2 correctly replaces ambient detection with explicit selection, but its trust contract must be sharper than the current implementation. Personal-scope writes justify one consent boundary; multi-client setup and uncertain ownership justify complete preflight, fail-closed conflicts, and convergent retry. Nothing else justifies additional confirmations or persistent user-facing state.

## Trust boundaries reviewed

- writes beneath the user's Codex or Claude Code personal skill scope;
- one setup affecting several selected clients;
- updates to recognized WPM-owned content;
- legacy `installer-builder` content whose ownership may be clear, ambiguous, or user-modified;
- retained client defaults that must remain independent of `manifest.yml.targets`.

## Findings

### Critical — Detection cannot authorize personal-scope writes

Current WPM treats config-directory presence as selection and copies into every detected scope (`install-authoring-skill.ts:93-115,184-209`). The README promises the same behavior (`README.md:70-76`). Detection may be stale and does not express which client the author wants WPM to modify.

**Required boundary:** Only an interactively confirmed selection or explicit headless client IDs authorize writes. Detection may annotate choices but must never add a client silently.

### Critical — All selected clients need preflight before the first predictable write

Current installation loops over destinations and writes immediately, so a later destination failure can leave selected clients diverged (`install-authoring-skill.ts:195-209`). A user selecting both Codex and Claude Code intends one configuration outcome, not an unexplained half-install.

**Required boundary:** Before writing any selected scope, reject unknown IDs, missing HOME, missing packaged skill content, unsupported clients, invalid destinations, predictable access failures, and ownership conflicts across the complete selected set. These failures leave every selected destination unchanged.

### High — One confirmation is sufficient for interactive setup

Personal-scope changes merit explicit consent, but repeated confirmation for detection, selection, update, defaults, or migration adds no protection. Headless client IDs already express machine-readable consent.

**Required boundary:** Interactive setup confirms once after showing the final selected client set and destinations. Explicit headless setup never prompts. Read-only listing, detection, help, and validation never prompt.

### High — Ownership determines automatic action

Current `copyTree` overwrites any existing destination and calls it `updated`, without showing that the content was WPM-owned (`install-authoring-skill.ts:195-207`). This is unsafe for both the new skill name and legacy `installer-builder` content.

**Required boundary:**

- absent destination: install;
- recognized WPM-owned destination with matching content: unchanged;
- recognized WPM-owned older content: update under the setup confirmation;
- recognized WPM-owned legacy content: migrate without losing unrelated content;
- ambiguous, unowned, or user-modified content: do not overwrite, delete, or silently adopt it; stop before all selected writes and identify the exact conflict and recovery action.

No force-overwrite shortcut belongs in the normal flow.

### High — Unforeseen partial writes need honest, convergent recovery

Complete preflight cannot prevent every filesystem failure. Promising rollback would be false under the current port boundary, but hiding partial completion would leave clients inconsistent.

**Required boundary:** If an unforeseen failure occurs after writes begin, report installed, updated, unchanged, and failed clients separately, identify the exact failed destination, and state that repeating the same explicit setup converges without duplicating or corrupting recognized managed content. Do not claim generic rollback.

### High — Retained state should contain only facts required for safe reuse

Setup needs enough durable state to offer later workspace defaults and distinguish WPM-owned updates. It does not need to become an agent inventory, credential store, or session manager.

**Keep only:** selected client IDs, WPM-managed destination identities, installed skill version or content identity, and ownership facts needed for reconciliation.

**Do not retain:** detection results, executable locations, login or credential state, running-session identity, agent lifecycle state, or deliverable targets.

### Medium — Reload advice is recovery, not ceremony

Skill discovery differs by client (`agent-driven-onboarding-flow-investigation.md:481-492`). Advice is valuable only when content changed or discovery fails.

**Required boundary:** Report adapter-specific reload guidance for installed or updated clients. An unchanged, already discoverable client needs no restart ceremony. Failure guidance names the affected client rather than issuing a blanket restart instruction.

### Medium — Unsupported clients should fail plainly, not appear as partial support

The current maps expose Hermes and OpenClaw alongside Codex and Claude Code (`agent-aliases.ts:26-68`), while the approved P0 scope supports only Codex and Claude Code (`epics-authoring-agent-onboarding.md:169-170`). Showing deferred clients as normal choices would create false trust.

**Required boundary:** Normal setup lists only supported P0 choices. An unsupported ID fails before mutation and points to the supported IDs; WPM does not guess a path or claim partial onboarding support.

### Medium — Defaults cannot alter deliverable targets

Personal setup selection answers which authoring clients receive the bootstrap skill. It does not decide which agents a generated installer supports (`agent-driven-onboarding-flow-investigation.md:138-142,230-236`).

**Required boundary:** Persisted defaults may seed later workspace authoring integration, but setup leaves `manifest.yml.targets`, project files, and all unselected personal scopes unchanged.

## Necessary consent and recovery moments

| Situation | User-facing boundary |
| --- | --- |
| Interactive personal setup | One confirmation after final client selection and destination preview. |
| Headless setup with explicit IDs | No prompt; the explicit IDs are consent. |
| WPM-owned update or owned legacy migration | No additional prompt beyond setup consent; report the outcome. |
| Ambiguous or user-modified destination | No write; explain the exact conflict and the user-controlled recovery needed. |
| Predictable problem in any selected client | No selected client changes; report all affected clients together. |
| Unforeseen failure after some writes | Report the exact completed and failed boundaries; repeat safely converges. |
| Detection mismatch | Continue with the explicit supported selection; detection is advisory. |

## Simplest trusted flow

1. Resolve the supported Codex/Claude choices and show detection only as context.
2. Obtain explicit selection—headless IDs or one interactive confirmation.
3. Preflight the packaged bootstrap skill, every selected destination, and ownership across the entire selected set.
4. If preflight is clean, reconcile only selected personal scopes and retain only the state needed for safe update and later workspace defaults.
5. Return a concise per-client outcome and targeted reload guidance. On conflict or partial failure, replace generic success prose with exact recovery information.

## Lens verdict

**Thin until ownership and multi-destination preflight are explicit; strong once added.** Explicit selection is the correct trust anchor. All further complexity should exist only to prevent destructive writes, client divergence, or unrecoverable ownership ambiguity.
