import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  hashArtifactFiles,
  hashTextContent,
  parseLockfile,
} from "../../../src/core/services/integrity.js";
import {
  assertPortablePath,
  assertSlug,
  assertSourcePath,
  emptyPackage,
  packageSchema,
  parsePackage,
  removeSetups,
  selectOperations,
  stableJson,
} from "../../../src/vnext/core/model.js";
import { editSourceText } from "../../../src/vnext/core/source-text.js";

describe("portable recipient boundary cases", () => {
  it.each([
    "payload/\uD800",
    "payload/\uDFFF",
    "payload/\u007F",
    "payload/\u009F",
    "payload/x ",
    "payload/./x",
    "payload/../x",
    "payload/COM0",
    "payload/LPT9.txt",
  ])("rejects a nonportable path %s", (path) => {
    expect(() => assertPortablePath(path)).toThrow(`unsafe portable path: ${path}`);
  });
  it.each([
    "payload/a b",
    "payload/ leading",
    "payload/xcon",
    "payload/comx",
    "payload/lptx",
    "payload/😀",
  ])("keeps a representable path %s", (path) => {
    expect(assertPortablePath(path)).toBe(path);
  });
  it.each([
    ".claude",
    ".codex",
    "_bmad",
    "_bmad-output",
    "Skills-Results",
    ".wpm-test",
    ".wpm-mutation.lock",
    ".wpm-apm",
    ".ssh",
    ".aws",
    "backlog",
  ])("excludes private or developer directory %s", (name) => {
    const path = `payload/${name}/content`;
    expect(() => assertSourcePath(path)).toThrow(
      `development-only or private source path: ${path}`,
    );
  });
  it.each([
    "payload/.env.example",
    "payload/.env.template",
  ])("allows a credential-free environment template %s", (path) => {
    expect(assertSourcePath(path)).toBe(path);
  });
  it.each([
    "1demo",
    "-demo",
    "demo_",
    "demo/",
    "con",
    "com1",
    "lpt2",
  ])("rejects a nonportable operation name %s", (value) => {
    expect(() => assertSlug(value)).toThrow(`invalid name: ${value}`);
    expect(() => emptyPackage(value)).toThrow(`invalid name: ${value}`);
  });
  it.each([
    "xcon",
    "conx",
    "comx",
    "lptx",
  ])("permits an ordinary name resembling a device %s", (value) => {
    expect(() => assertSlug(value)).not.toThrow();
  });
});

describe("source cross references and setup removal outcomes", () => {
  it("keeps the public schema identity and reports multiple malformed fields", () => {
    expect(packageSchema.$id).toBe("https://wpm.local/schema/package-vnext-1");
    expect(() => parsePackage({})).toThrow(/schemaVersion.*name/);
    for (const field of ["groups", "setups"]) {
      const source = emptyPackage("demo");
      if (field === "groups") source.groups.UPPER = { operations: [], groups: [] };
      else source.workerSetup.setups.UPPER = { source: "worker-setup/main", backend: "plain" };
      expect(() => parsePackage(source)).toThrow("invalid package.yml");
    }
  });
  it("rejects undeclared operation setups and unsafe setup source paths", () => {
    const source = emptyPackage("demo");
    source.work.push({ operation: "brief", task: "operation-1", setup: "absent" });
    expect(() => parsePackage(source)).toThrow("unknown setup: absent");
    source.work = [];
    source.workerSetup.setups.main = { backend: "plain", source: "../private" };
    expect(() => parsePackage(source)).toThrow("unsafe portable path: ../private");
  });
  it("rejects file/directory aliases in either insertion order and keeps unrelated files", () => {
    for (const files of [
      ["payload/a", "payload/a/b"],
      ["payload/a/b", "payload/a"],
    ]) {
      expect(() => parsePackage({ ...emptyPackage("demo"), files })).toThrow(
        "portable payload path collision",
      );
    }
    expect(
      parsePackage({ ...emptyPackage("demo"), files: ["payload/one", "payload/two"] }).files,
    ).toHaveLength(2);
    expect(
      parsePackage({ ...emptyPackage("demo"), files: ["payload/ß", "payload/ss"] }).files,
    ).toHaveLength(2);
  });
  it("permits a shared acyclic group and deduplicates repeated selections", () => {
    const source = emptyPackage("demo");
    source.work = [{ operation: "brief", task: "operation-1" }];
    source.groups = {
      leaf: { operations: ["brief"], groups: [] },
      left: { operations: [], groups: ["leaf"] },
      right: { operations: [], groups: ["leaf"] },
      all: { operations: [], groups: ["left", "right"] },
    };
    expect(parsePackage(source)).toBe(source);
    expect(selectOperations(source, "all")).toEqual(["brief"]);
  });
  it("expands a highly shared acyclic selection without exponentially revisiting its groups", () => {
    const source = emptyPackage("demo");
    source.work = [{ operation: "brief", task: "operation-1" }];
    for (let index = 34; index >= 0; index--) {
      source.groups[`g${index}`] = {
        operations: ["brief"],
        groups: index < 33 ? [`g${index + 1}`, `g${index + 2}`] : [],
      };
    }
    expect(selectOperations(source, "g0")).toEqual(["brief"]);
  });
  it("retains the unremoved default and declarations and rejects an empty removal", () => {
    const source = emptyPackage("demo");
    source.workerSetup = {
      default: "main",
      setups: {
        main: { source: "worker-setup/main", backend: "plain" },
        spare: { source: "worker-setup/spare", backend: "plain" },
      },
    };
    expect(() => removeSetups(source, [])).toThrow("select at least one setup");
    expect(removeSetups(source, ["spare"]).workerSetup).toStrictEqual({
      default: "main",
      setups: { main: source.workerSetup.setups.main },
    });
    delete source.workerSetup.default;
    expect(removeSetups(source, ["spare"]).workerSetup).toStrictEqual({
      setups: { main: source.workerSetup.setups.main },
    });
  });
});

describe("legacy content integrity remains an explicit validation boundary", () => {
  it("preserves unchanged YAML aliases while editing unrelated group selections", () => {
    const text =
      "workerSetup:\n  setups:\n    first: &shared\n      source: worker-setup/shared\n      backend: plain\n    second: *shared\ngroups: {}\n";
    const before: unknown = parse(text);
    const after = {
      workerSetup: {
        setups: {
          first: { source: "worker-setup/shared", backend: "plain" },
          second: { source: "worker-setup/shared", backend: "plain" },
        },
      },
      groups: { all: { operations: [], groups: [] } },
    };
    const edited = editSourceText(text, before, after);
    expect(parse(edited) as unknown).toStrictEqual(after);
    expect(edited).toContain("&shared");
    expect(edited).toContain("*shared");
  });
  const values = [null, false, "text", 3, [], { field: "value" }];
  it.each(
    values.flatMap((before) => values.map((after) => ({ before, after }))),
  )("edits YAML across value categories: $before -> $after", ({ before, after }) => {
    const output: unknown = parse(editSourceText(stringify(before), before, after));
    expect(output).toStrictEqual(after);
  });
  it("preserves identity when content embeds another file's record and path contains delimiters", () => {
    expect(hashArtifactFiles([{ path: "a", content: "b1:c" }])).not.toBe(
      hashArtifactFiles([{ path: "a4:b", content: "c" }]),
    );
    expect(
      hashArtifactFiles([
        { path: "a", content: "1:bX" },
        { path: "b", content: "" },
      ]),
    ).not.toBe(
      hashArtifactFiles([
        { path: "a", content: "" },
        { path: "b", content: "X1:b" },
      ]),
    );
  });
  it("orders content fingerprints and JSON consistently across all insertion permutations", () => {
    const names = ["z", "a", "m"];
    const permutations = names.flatMap((a) =>
      names.filter((b) => b !== a).map((b) => [a, b, ...names.filter((c) => c !== a && c !== b)]),
    );
    const hashes = new Set(
      permutations.map((order) =>
        hashArtifactFiles(order.map((path) => ({ path, content: `content:${path}` }))),
      ),
    );
    const json = new Set(
      permutations.map((order) =>
        stableJson(Object.fromEntries(order.map((name) => [name, name]))),
      ),
    );
    expect(hashes.size).toBe(1);
    expect(json.size).toBe(1);
    expect([...json][0]).toBe('{\n  "a": "a",\n  "m": "m",\n  "z": "z"\n}\n');
  });
  it("hashes exact UTF-8 bytes with the declared algorithm and representation", () => {
    expect(hashTextContent("abc")).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      hashArtifactFiles([
        { path: "a", content: "x" },
        { path: "a", content: "y" },
      ]),
    ).toBe("sha256:fcb5f97135fa1d25942c2a3de21d89dcad90ba1cd32256dacdaa6832f5798016");
  });
  it.each(["null", "[]", "false", "text"])("rejects a non-mapping lock %s", (text) => {
    expect(() => parseLockfile(text)).toThrow("wpm.lock: must be a mapping");
  });
  it.each(["null", "[]", "false", "text"])("rejects a non-mapping artifact %s", (text) => {
    expect(() => parseLockfile(`version: 1\nartifacts:\n  sample: ${text}\n`)).toThrow(
      'wpm.lock: artifact "sample" must be a mapping',
    );
  });
  it.each([
    "source",
    "version",
    "hash",
  ])("rejects an invalid artifact %s independently", (field) => {
    const entry: Record<string, unknown> = {
      source: "local",
      version: "1.0.0",
      hash: "sha256:abc",
    };
    entry[field] = 1;
    expect(() =>
      parseLockfile(JSON.stringify({ version: 1, artifacts: { sample: entry } })),
    ).toThrow('wpm.lock: artifact "sample" must have string "source", "version", and "hash"');
  });
});
