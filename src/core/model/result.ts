/**
 * The reusable value-or-failure result that every smart constructor (parser) in the model returns.
 *
 * The pure core never throws for invalid *input*: a parser returns a {@link Parsed} describing success or a
 * structured {@link ValidationProblem}. Turning problems into thrown, exit-coded domain errors happens later,
 * at the operation boundary (task-23); the model stays pure and total. {@link ValidationReport} (in
 * `operation.ts`) aggregates these same problems.
 */

/**
 * A single, structured validation failure. Free of any presentation concern — the command layer decides how
 * to render it. `field` names the offending input where one applies (e.g. `"id"`, `"version"`).
 */
export interface ValidationProblem {
  /** Human-readable description of what was wrong. */
  readonly message: string;
  /** The input field the problem is about, when applicable. */
  readonly field?: string;
}

/**
 * The outcome of parsing a raw value into a domain type `T`: either the typed value, or a problem describing
 * why the raw value was rejected. Discriminated on `ok`.
 */
export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: ValidationProblem };

/**
 * Construct a successful {@link Parsed} carrying `value`.
 *
 * @typeParam T - The parsed value's type.
 * @param value - The validated value.
 */
export function ok<T>(value: T): Parsed<T> {
  return { ok: true, value };
}

/**
 * Construct a failed {@link Parsed} from a message and optional field name.
 *
 * @typeParam T - The value type the caller expected (the failure carries none).
 * @param message - Human-readable description of the failure.
 * @param field - The offending input field, when applicable.
 */
export function fail<T>(message: string, field?: string): Parsed<T> {
  return { ok: false, problem: field === undefined ? { message } : { message, field } };
}
