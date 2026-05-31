import { describe, expect, it } from "vitest";
import {
  editYaml,
  parseDocument,
  parseYaml,
  stringifyDocument,
  stringifyYaml,
} from "../../../src/util/yaml.js";

/** A realistic manifest.yml with comments, blank lines, quoted/unquoted values, and lists. */
const MANIFEST = `# The project release identity and the bundles it ships.
project:
  name: hermes-handoff
  version: 0.1.0 # bump on release
  description: A worked example project.
  license: MIT

# Target agent runtimes (peer dependencies the install checks for).
targets:
  - claude-code
  - codex

# Enabled bundles (flat list of ids). A dir not listed here is disabled.
bundles:
  - core
  - web-handoff
`;

/** A realistic bundle.yml with a requires map and inline comments. */
const BUNDLE = `id: web-handoff
version: 0.2.0
summary: "Hand a website project off to another agent." # the menu line
confirmation: safe

# Dependency contract (npm-style ranges).
requires:
  core: "^0.3.0"
  doc-handoff: "~1.2.0"
`;

describe("byte-identity round-trip (AC#2)", () => {
  it("manifest.yml: parseDocument(text).toString() is byte-for-byte identical", () => {
    expect(stringifyDocument(parseDocument(MANIFEST))).toBe(MANIFEST);
  });

  it("bundle.yml: parseDocument(text).toString() is byte-for-byte identical", () => {
    expect(stringifyDocument(parseDocument(BUNDLE))).toBe(BUNDLE);
  });

  it("documents the ONE known normalization: multiple spaces before an inline comment collapse to one", () => {
    // This is the single divergence from exact byte-identity in yaml@2.x. Asserted explicitly so the
    // caveat is documented and verified, not hidden: canonical (single-space) YAML is exactly preserved.
    const multiSpace = "version: 0.1.0          # aligned comment\n";
    const out = stringifyDocument(parseDocument(multiSpace));
    expect(out).toBe("version: 0.1.0 # aligned comment\n");
    // ...and once normalized, it is then stable (idempotent).
    expect(stringifyDocument(parseDocument(out))).toBe(out);
  });
});

describe("comment-preserving edit (AC#1)", () => {
  it("bumping project.version changes ONLY that value, keeping comments and key order", () => {
    const edited = editYaml(MANIFEST, (doc) => {
      doc.setIn(["project", "version"], "0.2.0");
    });

    // (a) the new value is present
    expect(edited).toContain("version: 0.2.0");
    // (b) every comment is still present
    expect(edited).toContain("# The project release identity and the bundles it ships.");
    expect(edited).toContain("# bump on release");
    expect(edited).toContain("# Target agent runtimes (peer dependencies the install checks for).");
    expect(edited).toContain(
      "# Enabled bundles (flat list of ids). A dir not listed here is disabled.",
    );
    // (c) key order unchanged
    expect(edited.indexOf("name:")).toBeLessThan(edited.indexOf("version:"));
    expect(edited.indexOf("targets:")).toBeLessThan(edited.indexOf("bundles:"));
    // (d) a line-diff shows EXACTLY ONE changed line (the version)
    const inLines = MANIFEST.split("\n");
    const outLines = edited.split("\n");
    expect(outLines.length).toBe(inLines.length);
    const changed = inLines.filter((line, i) => line !== outLines[i]);
    expect(changed).toEqual(["  version: 0.1.0 # bump on release"]);
    expect(outLines[3]).toBe("  version: 0.2.0 # bump on release");
  });

  it("editing a doc-10-style manifest with ALIGNED inline comments normalizes their alignment document-wide", () => {
    // A manifest using doc-10's hand-aligned inline-comment style (multiple spaces before each `#`).
    const aligned = `project:
  name: hermes-handoff      # the project id
  version: 0.1.0            # current release
  repository: http://x      # source
`;
    const edited = editYaml(aligned, (doc) => {
      doc.setIn(["project", "version"], "0.2.0");
    });

    // The intended value changed.
    expect(edited).toContain("version: 0.2.0");
    // Every comment is still PRESENT (content + order preserved) — none are lost.
    expect(edited).toContain("# the project id");
    expect(edited).toContain("# current release");
    expect(edited).toContain("# source");
    expect(edited.indexOf("# the project id")).toBeLessThan(edited.indexOf("# current release"));
    expect(edited.indexOf("# current release")).toBeLessThan(edited.indexOf("# source"));
    // The TRUE behavior: alignment whitespace is normalized to single-space DOCUMENT-WIDE, not just on the
    // edited line — so the sibling comments on name/repository re-align too. (Inherent to eemeli/yaml.)
    expect(edited).toBe(`project:
  name: hermes-handoff # the project id
  version: 0.2.0 # current release
  repository: http://x # source
`);
    // No multi-space-before-comment alignment survives anywhere.
    expect(/ {2,}#/.test(edited)).toBe(false);
  });

  it("adding a requires entry appends it while preserving the sibling's inline comment", () => {
    const base = `id: web-handoff
version: 0.2.0
summary: "x"
confirmation: safe
requires:
  core: "^0.3.0" # the base dependency
`;
    const edited = editYaml(base, (doc) => {
      doc.setIn(["requires", "doc-handoff"], "~1.2.0");
    });
    expect(edited).toContain("doc-handoff: ~1.2.0");
    expect(edited).toContain('core: "^0.3.0" # the base dependency');
    // The existing keys are untouched and order is preserved (core before the new entry).
    expect(edited.indexOf('core: "^0.3.0"')).toBeLessThan(edited.indexOf("doc-handoff:"));
  });

  it("an unknown key not modelled by the schema survives an edit", () => {
    const withUnknown = `project:
  name: p
  version: 0.1.0
  x-custom: keep-me # author's own field
targets:
  - claude-code
bundles: []
`;
    const edited = editYaml(withUnknown, (doc) => {
      doc.setIn(["project", "version"], "0.2.0");
    });
    expect(edited).toContain("x-custom: keep-me # author's own field");
    expect(edited).toContain("version: 0.2.0");
  });
});

describe("plain parse/stringify basics", () => {
  it("parseYaml turns text into a plain JS value", () => {
    const value = parseYaml(MANIFEST) as { project: { name: string }; bundles: string[] };
    expect(value.project.name).toBe("hermes-handoff");
    expect(value.bundles).toEqual(["core", "web-handoff"]);
  });

  it("stringifyYaml round-trips a plain object (nested maps, lists, requires-style map)", () => {
    const obj = {
      project: { name: "p", version: "1.0.0" },
      targets: ["claude-code", "codex"],
      bundles: ["core"],
      requires: { core: "^0.3.0", "doc-handoff": "~1.2.0" },
    };
    const text = stringifyYaml(obj);
    expect(parseYaml(text)).toEqual(obj);
  });

  it("stringifyYaml produces YAML that parses back equal for a bundle-like object", () => {
    const bundle = {
      id: "web-handoff",
      version: "0.2.0",
      summary: "Website handoff.",
      confirmation: "safe",
      requires: { core: "^0.3.0" },
    };
    expect(parseYaml(stringifyYaml(bundle))).toEqual(bundle);
  });
});
