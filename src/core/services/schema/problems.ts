import { fail, ok, type Parsed } from "../../model/index.js";

/**
 * Shared structural-validation helpers for the three schema parsers (doc 13 §4). Each parser validates the
 * *shape* of already-parsed data (a plain object, the right keys, the right value types) with these helpers
 * before delegating domain values to the task-10 model parsers. Pure; no I/O.
 *
 * Field names are reported with a dotted path (e.g. `project.version`, `requires.core`) built with
 * {@link field}, so a {@link ValidationProblem} points at the exact offending location (AC#3).
 */

/**
 * Narrow an unknown value to a plain object (a non-null, non-array object). Used as the first check of every
 * descriptor so a non-object (string, array, number, null) is rejected before any key access.
 *
 * @param value - The value to test.
 * @returns `true` (with narrowing) when `value` is a plain `Record<string, unknown>`.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Join a parent path and a key into a dotted field path (e.g. `field("project", "version")` →
 * `"project.version"`). With no parent, returns the key unchanged.
 *
 * @param parent - The parent path, or `undefined`/empty for a top-level key.
 * @param key - The key to append.
 */
export function field(parent: string | undefined, key: string): string {
  return parent ? `${parent}.${key}` : key;
}

/**
 * Read a required string property from an object, failing with a field-precise problem if it is missing or
 * not a string.
 *
 * @param obj - The object to read from.
 * @param key - The property name.
 * @param ctx - A human label for the descriptor (e.g. `manifest`, `bundle "web-handoff"`).
 * @param parent - The dotted parent path for the field, if nested.
 * @returns The string value, or a {@link ValidationProblem}.
 */
export function requireString(
  obj: Record<string, unknown>,
  key: string,
  ctx: string,
  parent?: string,
): Parsed<string> {
  const path = field(parent, key);
  if (!(key in obj) || obj[key] === undefined || obj[key] === null) {
    return fail(`${ctx}: "${path}" is required`, path);
  }
  const value = obj[key];
  if (typeof value !== "string") {
    return fail(`${ctx}: "${path}" must be a string`, path);
  }
  return ok(value);
}

/**
 * Read an optional string property: absent/null yields `undefined`; a present non-string is an error.
 *
 * @param obj - The object to read from.
 * @param key - The property name.
 * @param ctx - A human label for the descriptor.
 * @param parent - The dotted parent path for the field, if nested.
 * @returns The string value, `undefined` when absent, or a {@link ValidationProblem} when present but
 *   not a string.
 */
export function optionalString(
  obj: Record<string, unknown>,
  key: string,
  ctx: string,
  parent?: string,
): Parsed<string | undefined> {
  if (!(key in obj) || obj[key] === undefined || obj[key] === null) {
    return ok(undefined);
  }
  const value = obj[key];
  if (typeof value !== "string") {
    return fail(
      `${ctx}: "${field(parent, key)}" must be a string when present`,
      field(parent, key),
    );
  }
  return ok(value);
}

/**
 * Read a required array property, failing if it is missing or not an array.
 *
 * @param obj - The object to read from.
 * @param key - The property name.
 * @param ctx - A human label for the descriptor.
 * @returns The array (as `unknown[]`), or a {@link ValidationProblem}.
 */
export function requireArray(
  obj: Record<string, unknown>,
  key: string,
  ctx: string,
): Parsed<readonly unknown[]> {
  if (!(key in obj) || obj[key] === undefined || obj[key] === null) {
    return fail(`${ctx}: "${key}" is required`, key);
  }
  const value = obj[key];
  if (!Array.isArray(value)) {
    return fail(`${ctx}: "${key}" must be a list`, key);
  }
  return ok(value);
}
