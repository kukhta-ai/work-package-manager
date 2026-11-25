import type { BundleManifest } from "./bundle.js";
import type { BundleId } from "./ids.js";
import type { Manifest } from "./manifest.js";

/**
 * The loaded project aggregate (doc 13 §2) — the keystone most operations reason against. A pure in-memory
 * **projection** of a project on disk: the project root (a plain path string, deliberately *not* a
 * file-system handle), the parsed {@link Manifest}, and every enabled bundle's parsed {@link BundleManifest}
 * keyed by id.
 *
 * It is loaded fresh per operation and never a long-lived mutable singleton, so there is no cache to
 * invalidate. Loading it (reading files through the FileSystem port) is an operation's job; the model only
 * defines the shape the loader produces.
 */
export interface Project {
  /** The absolute project root path, as a plain string (no fs handle — the model is I/O-free). */
  readonly rootPath: string;
  /** The parsed project manifest. */
  readonly manifest: Manifest;
  /** Each enabled bundle's parsed manifest, keyed by bundle id. */
  readonly bundles: ReadonlyMap<BundleId, BundleManifest>;
}
