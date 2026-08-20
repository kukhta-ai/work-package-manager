import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import { NotFoundError } from "../errors.js";
import type { BundleManifest, Project } from "../model/index.js";
import type { ApplyContext, ApplyOutcome, OperationSpec, ReadSpec } from "./lifecycle.js";

/**
 * The **generic, descriptor-driven payload-reference operation** behind the `bundle <id> files` / `templates` /
 * `scripts` families (doc 10 rows 165–173). A bundle's `bundle.yml` carries a `payload:` registry of the
 * authoritative reference paths the author has placed under each on-disk category; `add` REGISTERS a reference
 * (structure-not-content — it never writes file content) and `remove` DEREGISTERS it, leaving the file on disk
 * (doc 10 row 167). The registry is distinct from the files (the "or equivalent" doc 10 row 165 permits), which
 * is what makes deregister-not-delete possible.
 *
 * Parameterising over a {@link PayloadRefDescriptor} means each family (files = L, templates = M, scripts = N)
 * is just a NEW DESCRIPTOR + one `PerBundleCommandModule` in `src/cli.ts` — no re-implementation. The descriptor
 * supplies: the on-disk directory the referenced file must exist under, the `bundle.yml` key path whose SEQUENCE
 * holds the references, how to project that list off the parsed {@link BundlePayload}, and a noun for messages.
 *
 * Pure over the FileSystem port (doc 13 §1): the `bundle.yml` edit goes through the task-13 comment-preserving
 * {@link editYaml}. It imports only `node:path`, the yaml leaf, the model, the errors, and the lifecycle types —
 * never `node:fs`/`commander`/`execa` — so the import-boundary rule on `src/core/operations/` holds.
 *
 * **Where the on-disk existence check lives (doc 13 §1/§7).** `add` must reject a path that does not exist under
 * the on-disk directory (registering nothing). A pure `check(project, input)` has NO port to probe disk, so the
 * existence probe lives in the COMMAND layer (`src/cli.ts`), which owns the fs port and raises a
 * {@link NotFoundError} BEFORE `runMutation` — exactly as `bundle-reads.ts` threads fs-read data into a pure
 * spec as input rather than reading disk in the projection. By the time {@link addPayloadRefSpec}'s `apply`
 * runs, existence is already established by the caller; the op only registers.
 */

/**
 * Describes one payload-reference category so the same operation serves files (L), templates (M), scripts (N).
 *
 * @typeParam none.
 */
export interface PayloadRefDescriptor {
  /** The bundle-relative on-disk directory the referenced file must exist under (e.g. `payload/files`). */
  readonly onDiskDir: string;
  /** The `bundle.yml` key path whose sequence holds the references (e.g. `["payload", "files"]`). */
  readonly ymlPath: readonly string[];
  /** Project the registered-reference list off the parsed bundle (e.g. `(b) => b.payload.files`). */
  readonly select: (bundle: BundleManifest) => readonly string[];
  /** A human noun for messages (e.g. `file`). */
  readonly noun: string;
}

/**
 * The `files` descriptor (Family L) — `payload/files/` ↔ `bundle.yml`'s `payload.files`. The `templates` (M)
 * and `scripts` (N) families add their own descriptors the same way (each also adds its category to the model's
 * {@link BundlePayload} + the schema round-trip — the descriptor genericises the OPERATION, not the schema).
 */
export const FILES_DESCRIPTOR: PayloadRefDescriptor = {
  onDiskDir: "payload/files",
  ymlPath: ["payload", "files"],
  select: (bundle) => bundle.payload.files,
  noun: "file",
};

/**
 * The `templates` descriptor (Family M) — `payload/templates/` ↔ `bundle.yml`'s `payload.templates` (doc 10 row
 * 168, "Same as `files`, against `payload/templates/`"). Parameterised templates ARE delivered to the
 * environment (doc 06 line 77), a sibling of `payload/files/` under `payload/`. The same generic op as `files`;
 * only the on-disk dir, the yml key path, the model selector, and the message noun differ.
 */
export const TEMPLATES_DESCRIPTOR: PayloadRefDescriptor = {
  onDiskDir: "payload/templates",
  ymlPath: ["payload", "templates"],
  select: (bundle) => bundle.payload.templates,
  noun: "template",
};

/**
 * The `scripts` descriptor (Family N) — `installer-scripts/` ↔ `bundle.yml`'s `payload.scripts` (doc 10 row 169,
 * "Same as `files`, against `installer-scripts/`"). NOTE the deliberate asymmetry: the ON-DISK directory is
 * `installer-scripts` — a SIBLING of `payload/`, install-time tooling (probes, smoke tests) NOT delivered to the
 * user (doc 06 line 77 / doc 07 line 51) — while the REGISTRY key stays under `payload.scripts` for
 * representational consistency with files/templates (the `payload:` map is the reference registry, not a
 * delivery claim; delivery is a downstream build concern, tasks 82–84). The descriptor decouples the on-disk dir
 * from the yml key, so this is a one-field change: `onDiskDir` is `installer-scripts`, NOT
 * `payload/installer-scripts`.
 */
export const SCRIPTS_DESCRIPTOR: PayloadRefDescriptor = {
  onDiskDir: "installer-scripts",
  ymlPath: ["payload", "scripts"],
  select: (bundle) => bundle.payload.scripts,
  noun: "script",
};

/** A bundle's manifest filename, under `bundles/<id>/`. */
const BUNDLE_MANIFEST_FILE = "bundle.yml";

/**
 * Resolve the enabled host bundle from the loaded project, or raise a {@link NotFoundError} (defense-in-depth
 * with the routing's `requireEnabledBundle`).
 *
 * @param project - The loaded project.
 * @param id - The host bundle id.
 * @returns The host bundle's parsed manifest.
 * @throws {NotFoundError} When `<id>` is not an enabled bundle.
 */
function requireBundle(project: Project, id: string): BundleManifest {
  const bundle = (project.bundles as ReadonlyMap<string, BundleManifest>).get(id);
  if (bundle === undefined) {
    throw new NotFoundError(`bundle "${id}" is not an enabled bundle`);
  }
  return bundle;
}

/** The path to `bundles/<id>/bundle.yml` under `root`. */
function bundleManifestPath(root: string, id: string): string {
  return join(root, "bundles", id, BUNDLE_MANIFEST_FILE);
}

/** The input to {@link addPayloadRefSpec}: the host id + the (already existence-checked) reference path. */
export interface AddPayloadRefInput {
  /** The host bundle (selected + enabled-guarded by the `bundle <id>` routing). */
  readonly id: string;
  /** The reference path to register, relative to the descriptor's on-disk directory (existence checked by the CLI). */
  readonly path: string;
}

/** The input to {@link removePayloadRefSpec}: the host id + the reference path to deregister. */
export interface RemovePayloadRefInput {
  /** The host bundle (selected + enabled-guarded by the `bundle <id>` routing). */
  readonly id: string;
  /** The registered reference path to deregister (the file is left on disk). */
  readonly path: string;
}

/** The input to {@link listPayloadRefsSpec}: the host bundle id to read. */
export interface PayloadListInput {
  /** The host bundle whose registered references to print (selected by the `bundle <id>` routing). */
  readonly id: string;
}

/**
 * `bundle <id> <category> add <path>` (doc 10 row 165 for files), a mutation. ② CHECK only re-asserts the host
 * bundle (the on-disk existence of `<path>` is checked at the command layer BEFORE this runs — see the module
 * doc). ③ APPLY appends `<path>` to the descriptor's sequence in `bundles/<id>/bundle.yml` (set-like — an
 * already-registered path is a no-op, never duplicated), comment-preservingly; it writes NO file content
 * (structure-not-content, 65#1). ④ RERENDER (the harness) runs. No `materialise` (doc 10 lists no task).
 *
 * @param descriptor - The payload category descriptor.
 * @returns The add operation spec.
 */
export function addPayloadRefSpec(
  descriptor: PayloadRefDescriptor,
): OperationSpec<AddPayloadRefInput> {
  return {
    summary: (_project, { id, path }) => `registered ${descriptor.noun} ${path} in ${id}`,

    check: (project, { id }) => {
      requireBundle(project, id);
    },

    apply: (ctx: ApplyContext, project, { id, path }): ApplyOutcome => {
      const current = [...descriptor.select(requireBundle(project, id))];
      if (current.includes(path)) {
        // Set-like: already registered ⇒ no-op (never duplicate the list entry). Nothing changed.
        return { changedPaths: [] };
      }
      const next = [...current, path];
      const ymlPath = bundleManifestPath(ctx.root, id);
      const text = editYaml(ctx.fs.read(ymlPath), (doc) => {
        // `setIn(path, jsArray)` writes a clean block sequence EVEN when `payload`/`payload.files` is absent in
        // an old bundle.yml (avoiding the `addIn`-on-missing-key scalar pitfall); comments + key order on the
        // rest of the doc survive (edited in place).
        doc.setIn([...descriptor.ymlPath], next);
      });
      ctx.fs.write(ymlPath, text);
      return { changedPaths: [ymlPath] };
    },
  };
}

/**
 * `bundle <id> <category> remove <path>` (doc 10 row 167 for files), a mutation. ② CHECK the path IS registered
 * (else a {@link NotFoundError} — 67#3, nothing changed). ③ APPLY deletes that entry from the descriptor's
 * sequence in `bundles/<id>/bundle.yml` by index, comment-preservingly; it does NOT touch the file on disk
 * (deregister-not-delete, 67#2). ④ RERENDER (the harness) runs. The `summary` carries the doc-10-row-167 "left
 * at …" message the command prints (67#1). No `materialise`.
 *
 * @param descriptor - The payload category descriptor.
 * @returns The remove operation spec.
 */
export function removePayloadRefSpec(
  descriptor: PayloadRefDescriptor,
): OperationSpec<RemovePayloadRefInput> {
  return {
    summary: (_project, { path }) =>
      `deregistered; ${descriptor.noun} left at ${descriptor.onDiskDir}/${path} — delete it yourself if you meant to`,

    check: (project, { id, path }) => {
      const current = descriptor.select(requireBundle(project, id));
      if (!current.includes(path)) {
        throw new NotFoundError(
          `${descriptor.noun} "${path}" is not registered in "${id}" — nothing to deregister`,
        );
      }
    },

    apply: (ctx: ApplyContext, project, { id, path }): ApplyOutcome => {
      const current = [...descriptor.select(requireBundle(project, id))];
      const index = current.indexOf(path); // present (CHECK validated)
      const ymlPath = bundleManifestPath(ctx.root, id);
      const text = editYaml(ctx.fs.read(ymlPath), (doc) => {
        // Remove only that index from the sequence (like targets.ts's `deleteIn(["targets", index])`); the FILE
        // at `<onDiskDir>/<path>` is left on disk — we never call `ctx.fs.remove`.
        doc.deleteIn([...descriptor.ymlPath, index]);
      });
      ctx.fs.write(ymlPath, text);
      return { changedPaths: [ymlPath] };
    },
  };
}

/**
 * `bundle <id> <category> list` (doc 10 row 166 for files), a read. Projects the descriptor's registered
 * references in registration order; the command prints them one per line (66#1). Changes nothing (66#2).
 *
 * @param descriptor - The payload category descriptor.
 * @returns The list read spec.
 */
export function listPayloadRefsSpec(
  descriptor: PayloadRefDescriptor,
): ReadSpec<PayloadListInput, readonly string[]> {
  return {
    summary: (_project, { id }) => `bundle ${id} ${descriptor.noun}s`,
    project: (project, { id }) => [...descriptor.select(requireBundle(project, id))],
  };
}
