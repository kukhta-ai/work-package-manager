import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkArchitecture } from "../../scripts/architecture.mjs";

const roots: string[] = [];
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "wpm-architecture-"));
  roots.push(root);
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        baseUrl: ".",
        paths: { "@bridge/*": ["src/util/*"] },
      },
      include: ["src/**/*.ts"],
    }),
  );
  writeFileSync(
    join(root, ".dependency-cruiser.cjs"),
    readFileSync(new URL("../../.dependency-cruiser.cjs", import.meta.url)),
  );
  for (const [name, bytes] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, bytes);
  }
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("real graph quality boundary in isolated fixtures", () => {
  it("keeps outbound adapters from importing the shell and models from importing services", () => {
    const shell = fixture({
      "src/core/model/value.ts": "export const value=1;",
      "src/adapters/effect.ts": 'export {value} from "../cli.js";',
      "src/cli.ts": "export const value=1;",
    });
    expect(() => checkArchitecture(shell)).toThrow("outbound-adapters-not-shell-or-use-cases");
    const model = fixture({
      "src/core/model/value.ts": 'export {value} from "../services/value.js";',
      "src/core/services/value.ts": "export const value=1;",
    });
    expect(() => checkArchitecture(model)).toThrow("model-downward");
  });
  it("accepts deterministic core transformations", () => {
    const root = fixture({
      "src/core/model/value.ts":
        'import { join } from "node:path"; export const result=join("a","b");',
    });
    expect(checkArchitecture(root)).toBeGreaterThan(0);
  });
  it.each([
    ['import { readFileSync } from "node:fs"; export const effect=readFileSync;', ""],
    [
      'export { effect } from "../util/bridge.js";',
      'export { readFileSync as effect } from "node:fs";',
    ],
    [
      'export { effect } from "@bridge/bridge";',
      'export { readFileSync as effect } from "node:fs";',
    ],
  ])("rejects direct, re-export and alias effect paths", (source, bridge) => {
    const root = fixture({ "src/core/value.ts": source, "src/util/bridge.ts": bridge });
    expect(() => checkArchitecture(root)).toThrow();
  });
  it.each([
    "export const effect = process.env;",
    "// eslint-disable-next-line no-restricted-globals\nexport const effect = process.env;",
    "export const effect = globalThis.fetch;",
    "export const effect = Date.now();",
    "export const effect = new Intl.DateTimeFormat().format();",
    "export const effect = Math.random();",
    "const {random}=Math; export const effect=random();",
    "export const effect = (({random}) => random())(Math);",
    "export const effect = Reflect.get(Math, 'random')();",
    'import {randomBytes} from "node:crypto"; export const effect=randomBytes(1);',
  ])("rejects ambient effects in transitive utilities: %s", (bridge) => {
    const root = fixture({
      "src/core/value.ts": 'export { effect } from "../util/bridge.js";',
      "src/util/bridge.ts": bridge,
    });
    expect(() => checkArchitecture(root)).toThrow();
  });
  it("rejects unresolved dependencies and cycles", () => {
    const missing = fixture({ "src/core/value.ts": 'export {value} from "./missing.js";' });
    expect(() => checkArchitecture(missing)).toThrow();
    const cycle = fixture({
      "src/core/a.ts": 'export {b} from "./b.js"; export const a=1;',
      "src/core/b.ts": 'export {a} from "./a.js"; export const b=1;',
    });
    expect(() => checkArchitecture(cycle)).toThrow();
  });
  it("fails on empty analysis scope", () => {
    const root = fixture({ "src/outside.ts": "export const value=1;" });
    expect(() => checkArchitecture(root)).toThrow(/No pure core/);
  });
  it("also rejects ambient effects reached through a JavaScript utility", () => {
    const root = fixture({
      "src/core/value.ts": 'export {effect} from "../util/effect.js";',
      "src/util/effect.js": "export const effect=Date.now();",
    });
    expect(() => checkArchitecture(root)).toThrow("no-restricted-globals");
  });
});
