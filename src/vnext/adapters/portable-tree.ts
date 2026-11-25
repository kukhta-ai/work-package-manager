import { assertPortablePath } from "../core/model.js";

interface PortableEntry {
  path: string;
  kind: "file" | "directory";
}

/** Reject aliases across a complete tree, including every implied parent directory. */
export function assertPortableTree(entries: readonly PortableEntry[]): void {
  const seen = new Map<string, PortableEntry>();
  for (const entry of entries) {
    const segments = assertPortablePath(entry.path).split("/");
    for (let index = 0; index < segments.length; index++) {
      const path = segments.slice(0, index + 1).join("/");
      const kind = index === segments.length - 1 ? entry.kind : "directory";
      const key = path.normalize("NFC").toLowerCase();
      const previous = seen.get(key);
      if (previous && (previous.path !== path || previous.kind !== kind || kind === "file"))
        throw new Error(`portable path collision: ${entry.path} conflicts with ${previous.path}`);
      if (!previous) seen.set(key, { path, kind });
    }
  }
}
