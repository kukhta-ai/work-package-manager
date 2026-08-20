/**
 * Pure path policy for a registered skill document. A `SkillRef.path` names one file inside a directory
 * package; the containing directory is the package root that registration authorizes for shipping.
 *
 * Paths use the portable archive vocabulary (`/` separators) and must stay beneath their host root. Requiring
 * a containing directory avoids the ambiguous case where a root-level document would authorize the whole
 * bundle/project as its package. Arbitrary document basenames remain supported (`custom/two.md` is valid).
 */

/** Return the containing package directory for a valid portable relative skill-document path. */
export function skillPackageRoot(path: string): string | undefined {
  if (
    path.length === 0 ||
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:\//.test(path)
  ) {
    return undefined;
  }
  const parts = path.split("/");
  if (parts.length < 2 || parts.some((part) => part === "" || part === "." || part === "..")) {
    return undefined;
  }
  return parts.slice(0, -1).join("/");
}

/** Segment-exact containment: `foo` contains `foo` and `foo/**`, never the sibling `foobar`. */
export function isPathWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/** Package roots overlap when either is equal to or an ancestor of the other. */
export function skillPackageRootsOverlap(left: string, right: string): boolean {
  return isPathWithin(left, right) || isPathWithin(right, left);
}

/**
 * Reserved bundle surfaces with independent delivery/scan semantics. A payload-skill package cannot overlap
 * these roots: otherwise deregistering it would either drop unrelated content or leave the skill shippable.
 */
const RESERVED_PAYLOAD_SKILL_PACKAGE_ROOTS: readonly string[] = [
  "payload/files",
  "payload/templates",
  "installer-scripts",
  "installer-skills",
  "install-backlog",
  "uninstall-backlog",
  "backlog",
  "docs",
  ".agents",
  ".claude",
  ".openclaw",
  ".cursor",
  ".gemini",
];

/** Whether a candidate payload-skill package root conflicts with a reserved non-payload surface. */
export function isReservedPayloadSkillPackageRoot(root: string): boolean {
  return (
    root === "" ||
    RESERVED_PAYLOAD_SKILL_PACKAGE_ROOTS.some((reserved) =>
      skillPackageRootsOverlap(root, reserved),
    )
  );
}

/** Resolve a valid, non-conflicting payload-skill package root. */
export function payloadSkillPackageRoot(path: string): string | undefined {
  const root = skillPackageRoot(path);
  return root === undefined || isReservedPayloadSkillPackageRoot(root) ? undefined : root;
}

/** Human-readable contract used consistently by schema and command errors. */
export const SKILL_REF_PATH_REQUIREMENT =
  "must be a portable relative file path inside its own package directory (use '/' separators; absolute, root-level, empty, '.', and '..' segments are not allowed)";

/** Additional payload-only constraint needed to keep other delivery categories independent. */
export const PAYLOAD_SKILL_PATH_REQUIREMENT = `${SKILL_REF_PATH_REQUIREMENT} and its package directory must not overlap payload/files, payload/templates, installer-scripts, installer-skills, docs, install-backlog/backlog, uninstall-backlog, or agent scope aliases`;
