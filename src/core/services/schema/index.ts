/**
 * The `schema` service (doc 13 §4): parse + validate + serialize for the three descriptors — `manifest.yml`,
 * `bundle.yml`, and `template.yml`. It operates on **already-parsed data** (`unknown` / plain objects), not
 * on raw YAML text or files: services that read content take it as data, and the operation does the I/O
 * (doc 13 §4). The YAML string↔object round-trip and comment preservation are layered on top by the YAML
 * adapter (task-13); this service imports no `yaml` and touches no disk.
 *
 * Each `parseX` reuses the task-10 model parsers for domain values (ids, versions, ranges, agent names), so
 * descriptors are rejected on exactly the same rules the model enforces. Parsers are pure and total —
 * `Parsed<X>`, never throwing — and fail at the first problem with a field-precise message.
 */

export {
  type BundleManifestData,
  parseBundleManifest,
  serializeBundleManifest,
} from "./bundle.js";
export {
  type ManifestData,
  parseManifest,
  serializeManifest,
} from "./manifest.js";
export {
  parseTemplateDescriptor,
  serializeTemplateDescriptor,
  type TemplateDescriptorData,
} from "./template.js";
