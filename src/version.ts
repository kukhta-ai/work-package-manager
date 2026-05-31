import pkg from "../package.json" with { type: "json" };

/**
 * The CLI's version, read from `package.json` via a typed JSON import.
 *
 * Sourcing the version from the manifest (rather than a hard-coded literal) means it can never
 * drift from the published package metadata: `npm version` updates one place. The import resolves
 * against the package-root `package.json`, which npm always ships, so it works identically from a
 * clean local build and from the installed package. This is the single source other modules read
 * the version from.
 */
export const VERSION: string = pkg.version;
