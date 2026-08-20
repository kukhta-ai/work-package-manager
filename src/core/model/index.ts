/**
 * The domain model (doc 13 §2): pure data plus the smart constructors that make illegal states
 * unrepresentable. Nothing here performs I/O or depends on the CLI framework — the import-boundary rule
 * (doc 13 §1) is enforced on this directory.
 *
 * Branded primitives (`BundleId`, `AgentName`, `SemVer`, `VersionRange`) are obtainable only through their
 * parsers; aggregates (`Manifest`, `BundleManifest`, `Template`, `Project`) and value objects
 * (`AuthoringTaskSpec`, `ValidationReport`, `OperationResult`) are plain data over those primitives.
 */

export type { Brand } from "./branded.js";
export type { BundleManifest, BundlePayload, SkillRef } from "./bundle.js";
export { AUTHORING_BACKLOG_DIR, AUTHORING_TASK_PREFIX } from "./constants.js";
export {
  type AgentName,
  type BundleId,
  parseAgentName,
  parseBundleId,
  RESERVED_BUNDLE_VERBS,
} from "./ids.js";
export type { ConfirmationLevel, Manifest, ProjectMeta } from "./manifest.js";
export type {
  AuthoringTaskSpec,
  OperationResult,
  ValidationReport,
} from "./operation.js";
export type { Project } from "./project.js";
export { fail, ok, type Parsed, type ValidationProblem } from "./result.js";
export type {
  Template,
  TemplateFile,
  TemplateParameter,
  TemplateScope,
} from "./template.js";
export {
  parseSemVer,
  parseVersionRange,
  type SemVer,
  type VersionRange,
} from "./version.js";
