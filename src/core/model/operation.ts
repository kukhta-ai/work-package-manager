import type { ValidationProblem } from "./result.js";

/**
 * The specification of an authoring task the builder materialises into the authoring-backlog (doc 13 §2;
 * doc 11): a human-readable title plus its acceptance criteria. Materialisation is title-idempotent, so the
 * title is the identity. Deciding *which* specs a command produces is the materialisation service (task-21);
 * this is just their shape.
 */
export interface AuthoringTaskSpec {
  /** The task title — stable, and the de-duplication key when materialising. */
  readonly title: string;
  /** The acceptance criteria for the task. */
  readonly acceptanceCriteria: readonly string[];
}

/**
 * One mandatory WPM authoring task with the documented stable reference template contributions may depend
 * on. Operations still materialise the inherited title/criteria bytes; the reference is inspection and
 * dependency identity, not a replacement materialisation engine.
 */
export interface MandatoryAuthoringTask extends AuthoringTaskSpec {
  /** Stable dependency reference such as `wpm:project:set-metadata`. */
  readonly reference: string;
}

/**
 * The result of validating a {@link Project} (doc 13 §2): an overall ok flag and the list of problems found.
 * `ok` is `true` exactly when `problems` is empty. Built by the validate service (task-20) from the same
 * {@link ValidationProblem}s the model's parsers produce.
 */
export interface ValidationReport {
  /** Whether validation passed (no problems). */
  readonly ok: boolean;
  /** The problems found; empty when `ok` is `true`. */
  readonly problems: readonly ValidationProblem[];
}

/**
 * The structured result an operation returns (doc 13 §2, §3). The core never prints — an operation returns
 * this and the command layer formats it. Carries a human-readable summary, the paths the operation changed,
 * and the titles of any authoring tasks it materialised.
 */
export interface OperationResult {
  /** A human-readable one-line (or short) summary of what the operation did. */
  readonly summary: string;
  /** The paths the operation created or modified. */
  readonly changedPaths: readonly string[];
  /** The titles of any authoring tasks the operation materialised. */
  readonly materialisedTaskTitles: readonly string[];
  /**
   * Non-fatal warnings the operation surfaced (e.g. an unknown agent whose scope-alias was skipped, a removed
   * alias that did not exist, the last target removed). A warning is NOT a failure — the command prints these
   * (to stderr) and still exits 0; absent/empty when nothing warned. The lifecycle harness is the single
   * source: it folds an operation's own `apply` warnings together with the warnings it derives (e.g. the
   * deriver's unknown-target set), so every list-management command reports them uniformly.
   */
  readonly warnings?: readonly string[];
}
