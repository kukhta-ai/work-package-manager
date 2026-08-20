import { skillNamesOnDisk } from "./skills-on-disk.js";
import { skillNamesRegistered } from "./skills-registered.js";
import type { CompletionContext, CompletionSource } from "./sources.js";

/**
 * The removable payload-skill name completion source — completes a skill NAME for `bundle <id> skills remove
 * <name>` (doc 10 row 175; TASK-103) from the UNION of the host bundle's REGISTERED payload skills and the
 * on-disk skill-folder names under `payload/agent-skills/`. This matches the 3-way the remove command handles: a
 * REGISTERED name deregisters-and-leaves; an UNREGISTERED on-disk stub is deleted. So both a registered skill
 * (incl. a `--path`-relocated one, which has no conventional folder but IS registered, so the registry source
 * still offers it) and an orphan stub (on disk, never registered) are completable — exactly the removable set.
 *
 * Pure over the ports: it composes the two leaf sources, each of which already prefix-filters by `ctx.partial`
 * and degrades to `[]` on no id / no project / a malformed `bundle.yml` — so the union does too. De-duplicated
 * (a skill present in BOTH sets appears once) and sorted for stable output.
 *
 * @param ctx - The completion context (fs/env ports, host bundle id, partial).
 * @returns The removable skill names (registered ∪ on-disk), de-duplicated and sorted.
 */
export const skillNamesRemovable: CompletionSource = (ctx: CompletionContext): string[] => {
  const union = new Set<string>([...skillNamesRegistered(ctx), ...skillNamesOnDisk(ctx)]);
  return [...union].sort();
};
