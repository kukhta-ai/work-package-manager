import { createRequire } from "node:module";

const pkg: unknown = createRequire(import.meta.url)("../package.json");
if (
  typeof pkg !== "object" ||
  pkg === null ||
  !("version" in pkg) ||
  typeof pkg.version !== "string"
) {
  throw new Error("The installed package manifest must declare a version");
}

/**
 * The CLI's version, read from `package.json` through Node's manifest loader.
 *
 * Sourcing the version from the manifest (rather than a hard-coded literal) means it can never
 * drift from the published package metadata: `npm version` updates one place. The loader resolves
 * against the package-root `package.json`, which npm always ships, so it works identically from a
 * clean local build and from the installed package. This is the single source other modules read
 * the version from. Avoid import attributes so the loader also parses on early Node 20 releases.
 */
export const VERSION: string = pkg.version;
