import type { Document } from "yaml";
import type { Manifest, Template } from "../../src/core/model/index.js";

/**
 * The plain-object shape of a `manifest.yml`, as the YAML layer (task-13) reads and writes it. This is the
 * serialization target — pure data, all strings — distinct from the parsed {@link Manifest} (whose fields
 * are branded domain values). Optional `project` fields are omitted when absent.
 */
interface ManifestData {
  readonly project: {
    readonly name: string;
    readonly version: string;
    readonly description?: string;
    readonly license?: string;
    readonly repository?: string;
    readonly author?: string;
  };
  readonly targets: readonly string[];
  readonly bundles: readonly string[];
  /**
   * The PROJECT-scoped install-time helper-skill registry (doc 10 row 178) — a top-level `manifest.yml` field, a
   * list of `{name, path}` mappings (the project analogue of a bundle's `installerSkills`). Absent ⇒ empty.
   */
  readonly installerSkills: readonly { readonly name: string; readonly path: string }[];
}

/**
 * Serialize a {@link Manifest} back into plain {@link ManifestData} for the YAML layer to emit (doc 13 §4).
 * Absent optional `project` fields are omitted, so the output matches the shape of a hand-written
 * `manifest.yml`. Round-trips: `parseManifest(serializeManifest(m))` yields a value equal to `m` (modulo the
 * model's semver normalization). Pure.
 *
 * @param manifest - The manifest to serialize.
 * @returns The plain-object representation.
 */
export function serializeManifest(manifest: Manifest): ManifestData {
  const { meta } = manifest;
  return {
    project: {
      name: meta.name,
      version: meta.version,
      ...(meta.description !== undefined ? { description: meta.description } : {}),
      ...(meta.license !== undefined ? { license: meta.license } : {}),
      ...(meta.repository !== undefined ? { repository: meta.repository } : {}),
      ...(meta.author !== undefined ? { author: meta.author } : {}),
    },
    targets: manifest.targets.map((t) => t as string),
    bundles: manifest.bundles.map((b) => b as string),
    // Always emit `installerSkills` (empty ⇒ `[]`), like `targets`/`bundles` — the project-scoped install-time
    // helper-skill registry (doc 10 row 178). Round-trips with `parseManifest` (absent ⇒ empty).
    installerSkills: manifest.installerSkills.map((s) => ({ name: s.name, path: s.path })),
  };
}

/**
 * The plain-object shape of a `template.yml` **descriptor** (doc 06; doc 10 `template`). It carries metadata,
 * declared scaffold parameters, and an optional inert authoring-task source, but deliberately carries no file
 * tree: the `files` and `snippets` of a {@link Template} are populated from disk by the template resolver.
 */
interface TemplateDescriptorData {
  readonly name: string;
  readonly scope: string;
  readonly description?: string;
  readonly parameters: readonly {
    readonly name: string;
    readonly description?: string;
    readonly default?: string;
  }[];
  /** Opaque revision retained with a declared authoring-task contribution. */
  readonly revision?: unknown;
  /** Inert authoring-task declaration retained for aggregate validation by its dedicated inspector. */
  readonly "authoring-tasks"?: unknown;
}

/**
 * Serialize a {@link Template}'s **descriptor** portion back into plain {@link TemplateDescriptorData} for the
 * YAML layer (doc 13 §4). Metadata, parameters, and any inert authoring-task source are emitted; the
 * `files`/`snippets` trees are not part of `template.yml`. Pure and round-trippable.
 *
 * @param template - The template whose descriptor to serialize.
 * @returns The plain-object descriptor representation.
 */
export function serializeTemplateDescriptor(template: Template): TemplateDescriptorData {
  return {
    name: template.name,
    scope: template.scope,
    ...(template.description !== undefined ? { description: template.description } : {}),
    parameters: template.parameters.map((p) => ({
      name: p.name,
      ...(p.description !== undefined ? { description: p.description } : {}),
      ...(p.default !== undefined ? { default: p.default } : {}),
    })),
    ...(template.authoringTaskSource !== undefined
      ? {
          revision: template.authoringTaskSource.revision,
          "authoring-tasks": template.authoringTaskSource.tasks,
        }
      : {}),
  };
}

/**
 * Serialize an editable {@link Document} back to YAML text, preserving everything its CST retained.
 *
 * @param doc - The document to serialize.
 * @returns The YAML text.
 */
export function stringifyDocument(doc: Document): string {
  return doc.toString();
}
