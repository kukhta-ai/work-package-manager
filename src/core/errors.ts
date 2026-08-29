import type { PersonalSetupOutcome } from "./services/personal-authoring-setup.js";

/**
 * The core's typed error model and the single exit-code mapping (doc 13 §7).
 *
 * The pure core signals a domain failure by **raising** one of these typed errors; it never terminates the
 * process or writes to the error stream. Catching them, mapping each to an exit code, and printing a clean
 * message is the CLI top-level handler's job (task-27) — this module is just the types plus the pure mapping.
 * It imports nothing effectful (no `process`, no `node:fs`, no CLI/subprocess library, no `console`), so the
 * import-boundary rule on `src/core/` holds trivially.
 *
 * Each category carries a fixed meaning and exit code (doc 13 §7):
 *
 * | Category     | Raised when                                            | Exit |
 * |--------------|--------------------------------------------------------|------|
 * | `usage`      | bad invocation or bad input value                      | 2    |
 * | `not-found`  | project, bundle, or template missing                   | 1    |
 * | `conflict`   | id already exists, bundle already enabled, …           | 1    |
 * | `constraint` | unsatisfiable `requires`, or a dependency cycle        | 1    |
 * | `validation` | schema / kebab / reserved-word failure                 | 1    |
 *
 * A validation that is specifically a *bad CLI argument* is exit 2 (doc 13 §7); model that by raising a
 * {@link UsageError} rather than a {@link ValidationError}, so the mapping stays purely category-driven. An
 * unexpected (non-domain) error — a plain `Error` or any thrown non-`Error` value — is the "everything-else"
 * bucket and maps to exit 1. Net: **0** success, **2** usage, **1** everything else, decided in one place
 * ({@link exitCodeFor}).
 */

/** The distinct domain-failure categories (doc 13 §7). */
export type ErrorCategory = "usage" | "not-found" | "conflict" | "constraint" | "validation";

/** Optional structured detail attached to a {@link DomainError} (e.g. the offending field or id). */
export interface ErrorDetail {
  /** The input field the error is about, when applicable. */
  readonly field?: string;
  /** The offending id (bundle id, template name, agent name, …), when applicable. */
  readonly id?: string;
}

/** One predictable workspace-integration blocker found during complete preflight. */
export interface WorkspaceIntegrationBlocker {
  /** Stable machine-readable reason code. */
  readonly code: string;
  /** The affected request surface. */
  readonly surface:
    | "target"
    | "backlog"
    | "authoring-task-plan"
    | "selected-client"
    | "destination"
    | "ownership"
    | "managed-state"
    | "packaged-content";
  /** Concise human-readable finding. */
  readonly message: string;
  /** One forward action applicable to this blocker. */
  readonly recovery: string;
}

/** One predictable prepared-handoff or receiving-verification mismatch. */
export interface HandoffBlocker {
  /** Stable machine-readable reason code. */
  readonly code: string;
  /** Exact handoff surface affected by the mismatch. */
  readonly surface:
    | "working-directory"
    | "target"
    | "receipt"
    | "managed-state"
    | "backlog"
    | "packaged-content"
    | "selected-client"
    | "front-door"
    | "skill-family";
  /** Client identity for a native surface; absent for shared surfaces. */
  readonly client?: string;
  readonly message: string;
  readonly recovery: string;
}

/** Independent validity of one configured client in a failed or successful receiving verification. */
export interface HandoffClientValidity {
  readonly id: string;
  readonly status: "valid" | "invalid";
}

/** One predictable blocker from the complete personal authoring-setup preflight. */
export interface PersonalAuthoringSetupBlocker {
  readonly code: string;
  readonly surface:
    | "selection"
    | "home"
    | "packaged-content"
    | "managed-state"
    | "destination"
    | "ownership";
  readonly client?: string;
  readonly path?: string;
  readonly message: string;
  readonly recovery: string;
}

/** One predictable blocker from bundle create/enable's complete authoring-work preflight. */
export interface BundleAuthoringBlocker {
  readonly code: string;
  readonly surface:
    | "input"
    | "bundle"
    | "manifest"
    | "template"
    | "contribution-record"
    | "backlog"
    | "authoring-task-plan"
    | "advisor"
    | "derived-artifact";
  readonly path?: string;
  readonly message: string;
  readonly recovery: string;
}

/** One selected-client boundary in setup's typed progress report. */
export interface PersonalAuthoringSetupClientProgress {
  readonly id: string;
  readonly destination: string;
  readonly outcome: PersonalSetupOutcome;
}

/**
 * The base class for the core's typed domain errors. Carries a {@link ErrorCategory} discriminator and
 * optional structured {@link ErrorDetail}, on top of the standard `Error` message. Operations raise a
 * subclass; the CLI boundary catches it (`instanceof DomainError`) and maps it to an exit code.
 *
 * Not constructed directly — use one of the five subclasses so the `category` is fixed.
 */
export class DomainError extends Error {
  /** The failure category. */
  readonly category: ErrorCategory;
  /** Optional structured detail. */
  readonly detail?: ErrorDetail;

  /**
   * @param category - The failure category.
   * @param message - A human-readable message.
   * @param detail - Optional structured detail (field / id).
   */
  constructor(category: ErrorCategory, message: string, detail?: ErrorDetail) {
    super(message);
    this.category = category;
    if (detail !== undefined) {
      this.detail = detail;
    }
    // Restore the prototype chain so `instanceof` works for this subclass under an ES2022 target (where
    // extending a built-in like `Error` otherwise resets the instance's prototype to `DomainError`/`Error`).
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }
}

/** Bad invocation or a bad input value (doc 13 §7) — exit 2. Also used for a validation of a bad CLI argument. */
export class UsageError extends DomainError {
  /**
   * @param message - A human-readable message.
   * @param detail - Optional structured detail.
   */
  constructor(message: string, detail?: ErrorDetail) {
    super("usage", message, detail);
  }
}

/** A project, bundle, or template is missing (doc 13 §7) — exit 1. */
export class NotFoundError extends DomainError {
  /**
   * @param message - A human-readable message.
   * @param detail - Optional structured detail.
   */
  constructor(message: string, detail?: ErrorDetail) {
    super("not-found", message, detail);
  }
}

/** An id already exists, a bundle is already enabled, etc. (doc 13 §7) — exit 1. */
export class ConflictError extends DomainError {
  /**
   * @param message - A human-readable message.
   * @param detail - Optional structured detail.
   */
  constructor(message: string, detail?: ErrorDetail) {
    super("conflict", message, detail);
  }
}

/** An unsatisfiable `requires` constraint or a dependency cycle (doc 13 §7) — exit 1. */
export class ConstraintError extends DomainError {
  /**
   * @param message - A human-readable message.
   * @param detail - Optional structured detail.
   */
  constructor(message: string, detail?: ErrorDetail) {
    super("constraint", message, detail);
  }
}

/** A schema / kebab / reserved-word validation failure (doc 13 §7) — exit 1. */
export class ValidationError extends DomainError {
  /**
   * @param message - A human-readable message.
   * @param detail - Optional structured detail.
   */
  constructor(message: string, detail?: ErrorDetail) {
    super("validation", message, detail);
  }
}

/**
 * Aggregate predictable failure for one complete workspace-integration request. The operation collects every
 * safely discoverable blocker before the first write; selection codes remain machine-readable through
 * {@link blockers}, while {@link handoffPrepared} prevents a rejected request from being mistaken for Story
 * 2.8 handoff readiness.
 */
export class WorkspaceIntegrationPreflightError extends DomainError {
  readonly blockers: readonly WorkspaceIntegrationBlocker[];
  readonly handoffPrepared = false as const;

  /** @param blockers - Deterministically ordered blockers (must be non-empty). */
  constructor(blockers: readonly WorkspaceIntegrationBlocker[]) {
    const usage = blockers.some(({ surface }) => surface === "selected-client");
    super(
      usage ? "usage" : "conflict",
      `workspace authoring integration preflight failed with ${blockers.length} blocker(s): ${blockers.map(({ code }) => code).join(", ")}`,
    );
    this.blockers = [...blockers];
  }
}

/** Aggregate predictable no-write failure while preparing a workspace handoff. */
export class HandoffPreparationPreflightError extends DomainError {
  readonly blockers: readonly HandoffBlocker[];
  readonly handoffPrepared = false as const;

  constructor(blockers: readonly HandoffBlocker[]) {
    super(
      "conflict",
      `workspace handoff preparation failed with ${blockers.length} blocker(s): ${blockers.map(({ code }) => code).join(", ")}`,
    );
    this.blockers = [...blockers];
  }
}

/** Aggregate read-only receiving verification failure, retaining unaffected-client validity. */
export class HandoffVerificationError extends DomainError {
  readonly blockers: readonly HandoffBlocker[];
  readonly selectedClient: string;
  readonly clients: readonly HandoffClientValidity[];
  readonly sharedValid: boolean;
  readonly handoffPrepared = false as const;

  constructor(input: {
    readonly blockers: readonly HandoffBlocker[];
    readonly selectedClient: string;
    readonly clients: readonly HandoffClientValidity[];
    readonly sharedValid: boolean;
  }) {
    super(
      input.blockers.some(({ surface }) => surface === "selected-client") ? "usage" : "validation",
      `workspace handoff verification failed with ${input.blockers.length} blocker(s): ${input.blockers.map(({ code }) => code).join(", ")}`,
    );
    this.blockers = [...input.blockers];
    this.selectedClient = input.selectedClient;
    this.clients = [...input.clients];
    this.sharedValid = input.sharedValid;
  }
}

/** Aggregate, deterministic, no-write failure for one complete personal setup request. */
export class PersonalAuthoringSetupPreflightError extends DomainError {
  readonly blockers: readonly PersonalAuthoringSetupBlocker[];
  readonly setupApplied = false as const;

  constructor(blockers: readonly PersonalAuthoringSetupBlocker[]) {
    super(
      blockers.some(({ surface }) => surface === "selection") ? "usage" : "conflict",
      `personal authoring setup preflight failed with ${blockers.length} blocker(s): ${blockers.map(({ code }) => code).join(", ")}`,
    );
    this.blockers = [...blockers];
  }
}

/** Aggregate, deterministic, no-write failure for one complete bundle create/enable request. */
export class BundleAuthoringPreflightError extends DomainError {
  readonly blockers: readonly BundleAuthoringBlocker[];
  readonly bundleChanged = false as const;

  constructor(blockers: readonly BundleAuthoringBlocker[]) {
    super(
      blockers.some(({ surface }) => surface === "input") ? "validation" : "conflict",
      `bundle authoring preflight failed with ${blockers.length} blocker(s): ${blockers.map(({ code }) => code).join(", ")}`,
    );
    this.blockers = [...blockers];
  }
}

/** A named effect boundary from one operation-specific ordered mutation plan. */
export interface MutationBoundary {
  /** Stable boundary identity, in plan order. */
  readonly id: string;
  /** The observable surface this boundary changes. */
  readonly path?: string;
  /** Concise evidence/recovery context. */
  readonly description: string;
}

/** Lifecycle beat in which an ordered mutation boundary failed. */
export type MutationLifecycleBeat = "APPLY" | "RERENDER" | "MATERIALISE";

/**
 * Typed non-success for an unforeseen effect failure after an ordered mutation plan began. It reports progress
 * honestly and promises no rollback or generic resume behavior.
 */
export class MutationFailure extends Error {
  readonly operation: string;
  readonly failedBeat: MutationLifecycleBeat;
  readonly completed: readonly MutationBoundary[];
  readonly failed: MutationBoundary;
  readonly unattempted: readonly MutationBoundary[];
  readonly recovery: string;
  readonly underlyingCause: unknown;

  constructor(input: {
    readonly operation: string;
    readonly failedBeat: MutationLifecycleBeat;
    readonly completed: readonly MutationBoundary[];
    readonly failed: MutationBoundary;
    readonly unattempted: readonly MutationBoundary[];
    readonly recovery: string;
    readonly cause: unknown;
  }) {
    super(`${input.operation} failed at mutation boundary "${input.failed.id}"`);
    this.operation = input.operation;
    this.failedBeat = input.failedBeat;
    this.completed = [...input.completed];
    this.failed = input.failed;
    this.unattempted = [...input.unattempted];
    this.recovery = input.recovery;
    this.underlyingCause = input.cause;
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }
}

/** Setup-specific typed partial result with explicit client/destination progress. */
export class PersonalAuthoringSetupMutationFailure extends MutationFailure {
  readonly completedClients: readonly PersonalAuthoringSetupClientProgress[];
  readonly failedClient: PersonalAuthoringSetupClientProgress | null;
  readonly unattemptedClients: readonly PersonalAuthoringSetupClientProgress[];
  readonly setupApplied = false as const;

  constructor(input: {
    readonly completedClients: readonly PersonalAuthoringSetupClientProgress[];
    readonly failedClient: PersonalAuthoringSetupClientProgress | null;
    readonly unattemptedClients: readonly PersonalAuthoringSetupClientProgress[];
    readonly failed: MutationBoundary;
    readonly completed: readonly MutationBoundary[];
    readonly unattempted: readonly MutationBoundary[];
    readonly recovery: string;
    readonly cause: unknown;
  }) {
    super({
      operation: "personal authoring setup",
      failedBeat: "APPLY",
      completed: input.completed,
      failed: input.failed,
      unattempted: input.unattempted,
      recovery: input.recovery,
      cause: input.cause,
    });
    this.completedClients = [...input.completedClients];
    this.failedClient = input.failedClient;
    this.unattemptedClients = [...input.unattemptedClients];
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }
}

/**
 * Whether `error` is one of the core's typed {@link DomainError}s (as opposed to an unexpected plain `Error`
 * or any other thrown value).
 *
 * @param error - The caught value.
 * @returns `true` if `error` is a {@link DomainError}.
 */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/** Whether a caught value is the typed post-write mutation non-success. */
export function isMutationFailure(error: unknown): error is MutationFailure {
  return error instanceof MutationFailure;
}

/** A process exit code: `0` success, `2` usage error, `1` everything else (doc 13 §7). */
export type ExitCode = 0 | 1 | 2;

/**
 * Map a caught error to its process exit code — the **single** source of truth for exit codes (doc 13 §7).
 * A {@link UsageError} maps to `2`; every other {@link DomainError} category (`not-found`, `conflict`,
 * `constraint`, `validation`) and any unexpected/non-domain value (a plain `Error`, a string, `undefined`, …)
 * map to `1` (the "everything-else" bucket). `0` is the success path — there is no error to map — so it is
 * handled by the caller and never returned here.
 *
 * @param error - The caught value (only called when an error occurred).
 * @returns The exit code: `2` for a usage error, `1` otherwise.
 */
export function exitCodeFor(error: unknown): ExitCode {
  if (isDomainError(error)) {
    return error.category === "usage" ? 2 : 1;
  }
  return 1;
}
