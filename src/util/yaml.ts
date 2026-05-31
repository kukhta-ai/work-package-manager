import { type Document, parse, stringify, parseDocument as yamlParseDocument } from "yaml";

/**
 * Comment-preserving YAML, the `yaml` (eemeli/yaml) wrapper (doc 12 §"YAML"). A **pure leaf**: it transforms
 * strings and values only and performs **no** file I/O — reading and writing files is the FileSystem port's
 * job (task-12). Reads flow `FileSystem.read` → {@link parseYaml} → the schema service's validators.
 *
 * Two write paths exist, and choosing the right one is load-bearing:
 *
 * - **Fresh files** use {@link stringifyYaml} over a plain object (typically from `schema.serializeX`). This
 *   is correct for brand-new files (e.g. `init` creating a `manifest.yml`), but it emits a clean document —
 *   it has no comments or unknown keys to preserve because the object never had them.
 * - **Editing an author-edited file** must use {@link editYaml} (or {@link parseDocument} +
 *   {@link stringifyDocument}) so that comments, blank lines, key order, and any keys the model does not know
 *   about all survive the change. `schema.serializeX` deliberately drops those, so it must NOT be used to
 *   rewrite a file a human has touched — mutate the document instead.
 *
 * `yaml` re-emits in its configured style (2-space block indentation, a single space before inline comments,
 * padded flow collections). Comments, blank lines, key order, scalar quoting, and unknown keys are all
 * preserved in content and order. The **canonical** style the CLI emits and `docs/10` uses — 2-space block
 * indentation with single-space inline comments — round-trips byte-for-byte; non-canonical author formatting
 * is reflowed to that canonical style. Specifically:
 *
 * - 4-space / 0-indent block formatting → 2-space (e.g. a `- item` list at column 0 → indented two spaces);
 * - flow collections gain padding: `[a, b]` → `[ a, b ]`;
 * - multiple spaces before an inline comment collapse to one — and this is applied **document-wide on any
 *   edit**, so editing a single field re-aligns every inline comment in the file (comment content and order
 *   are kept; only the alignment whitespace changes).
 *
 * This reflow is inherent to eemeli/yaml and accepted (doc 12 chose this library). It does not affect the
 * canonical files the CLI produces; it only normalizes hand-aligned author formatting.
 */

export type { Document } from "yaml";

/**
 * Parse YAML text into a plain JavaScript value (the form the schema service validates).
 *
 * @param text - The YAML source text.
 * @returns The parsed value (object, array, scalar, or `null`/`undefined` for empty input).
 * @throws If the text is not valid YAML.
 */
export function parseYaml(text: string): unknown {
  return parse(text);
}

/**
 * Serialize a plain JavaScript value to YAML text, for **fresh** writes only (no comments to preserve).
 *
 * @param value - The value to serialize (e.g. a `schema.serializeX` plain object).
 * @returns The YAML text, terminated with a trailing newline.
 */
export function stringifyYaml(value: unknown): string {
  return stringify(value);
}

/**
 * Parse YAML text into an editable {@link Document} whose comment/blank-line/key-order structure (the CST) is
 * retained, so a later {@link stringifyDocument} can re-emit it faithfully. This is the entry point for the
 * comment-preserving edit path.
 *
 * @param text - The YAML source text.
 * @returns The parsed {@link Document}.
 */
export function parseDocument(text: string): Document.Parsed {
  return yamlParseDocument(text);
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

/**
 * The comment-preserving **edit** path (the heart of AC#1): parse `text` into a {@link Document}, apply
 * `mutate` to it (e.g. `doc.setIn(["project", "version"], "0.2.0")`, or add a `requires.<id>` entry), and
 * re-emit. The mutation changes only the keys it touches; comments, blank lines, key order, and unknown keys
 * are all preserved in content and order.
 *
 * One whitespace caveat (see the module note): inline-comment **alignment** is normalized document-wide on
 * any edit — every `key: value   # comment` collapses to a single space before `#`. Comment content and
 * order are kept; only the padding whitespace changes. Files in the CLI's canonical single-space style are
 * therefore unaffected.
 *
 * @param text - The existing YAML source to edit.
 * @param mutate - A callback that mutates the parsed {@link Document} in place (via `setIn`/`deleteIn`/etc.).
 * @returns The edited YAML text.
 *
 * @example
 * const next = editYaml(manifestText, (doc) => doc.setIn(["project", "version"], "0.2.0"));
 */
export function editYaml(text: string, mutate: (doc: Document.Parsed) => void): string {
  const doc = yamlParseDocument(text);
  mutate(doc);
  return doc.toString();
}
