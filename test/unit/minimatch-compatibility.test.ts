import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import baseline from "../../quality/minimatch-compatibility.json" with { type: "json" };

const requireFromTest = createRequire(import.meta.url);

describe("temporary minimatch major override compatibility", () => {
  for (const parent of [
    "eslint",
    "@eslint/config-array",
    "@typescript-eslint/typescript-estree",
    "@stryker-mutator/core",
  ]) {
    it(`preserves the captured project glob behavior through ${parent}`, () => {
      const installed: unknown = createRequire(requireFromTest.resolve(parent))("minimatch");
      if (
        typeof installed !== "object" ||
        installed === null ||
        !("minimatch" in installed) ||
        typeof installed.minimatch !== "function"
      ) {
        throw new Error(`${parent} does not resolve the expected minimatch API`);
      }
      expect(baseline.baselineVersion).toBe("10.2.6");
      expect(baseline.cases).toHaveLength(385);
      for (const sample of baseline.cases) {
        const observed: unknown = Reflect.apply(installed.minimatch, undefined, [
          sample.path,
          sample.pattern,
          sample.option,
        ]);
        expect(observed, `${parent}: ${JSON.stringify(sample)}`).toBe(sample.result);
      }
    });
  }
});
