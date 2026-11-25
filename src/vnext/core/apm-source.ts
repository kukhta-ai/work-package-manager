/** A remote setup reference; local authored paths are interpreted by the separate path contract. */
export function apmReference(source: string): string | undefined {
  if (!source.startsWith("apm:")) return undefined;
  const reference = source.slice(4);
  // String.split always returns at least one element, including for the empty string.
  const [locator, ...revisions] = reference.split("#") as [string, ...string[]];
  if (revisions.length > 1) throw new Error("APM reference has multiple revision selectors");
  if (revisions.length) {
    const revision = revisions[0] as string;
    if (revision.split("/").some(unsafeSegment))
      throw new Error("APM revision must be a nonempty portable Git revision");
  }
  let path = locator;
  if (locator.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(locator);
    } catch {
      throw new Error("APM remote source must be a valid HTTPS URL");
    }
    if (url.username || url.password || url.search)
      throw new Error("APM remote source cannot contain credentials, queries or fragments");
    path = locator.slice(locator.indexOf("/", 8) + 1);
    if (!locator.includes("/", 8))
      throw new Error("APM remote URL must identify owner and repository");
  }
  const segments = path.split("/");
  if (segments.length < 2 || segments.some(unsafeSegment))
    throw new Error(
      "invalid remote APM reference; use apm:owner/repo[/subpath][#revision] or apm:https://host/owner/repo[#revision]",
    );
  return reference;
}
function unsafeSegment(segment: string): boolean {
  return segment === "." || segment === ".." || !/^[A-Za-z0-9_.-]+$/.test(segment);
}
