import { parseDocument } from "yaml";
import { stableJson } from "./model.js";

/** Update changed values while retaining comments and untouched sequence/map nodes. */
export function editSourceText(text: string, previous: unknown, next: unknown): string {
  const document = parseDocument(text);
  if (document.errors.length) throw new Error("cannot edit malformed source YAML");
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const patch = (before: unknown, after: unknown, path: (string | number)[]): void => {
    if (stableJson(before) === stableJson(after)) return;
    if (Array.isArray(before) && Array.isArray(after)) {
      for (let index = before.length - 1; index >= after.length; index--)
        document.deleteIn([...path, index]);
      for (let index = 0; index < Math.min(before.length, after.length); index++)
        patch(before[index], after[index], [...path, index]);
      for (let index = before.length; index < after.length; index++)
        document.addIn(path, after[index]);
    } else if (record(before) && record(after)) {
      for (const key of Object.keys(before))
        if (!Object.hasOwn(after, key)) document.deleteIn([...path, key]);
      for (const [key, value] of Object.entries(after))
        patch(Object.hasOwn(before, key) ? before[key] : undefined, value, [...path, key]);
    } else document.setIn(path, after);
  };
  patch(previous, next, []);
  return document.toString();
}
