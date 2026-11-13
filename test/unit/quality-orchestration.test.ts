import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as string[][]);
vi.mock("node:child_process", () => ({
  spawnSync: (_executable: string, args: string[]) => {
    calls.push(args.map((arg) => arg.replaceAll("\\", "/")));
    return { status: 0, stdout: "", stderr: "" };
  },
}));
vi.mock("../../scripts/quality-tools.mjs", () => ({ doctorAnalyzers: () => ({ ready: true }) }));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  mkdirSync: vi.fn(),
}));
vi.mock("../../distribution-preparation/prepare-package.js", () => ({
  resolveNpmInvocation: () => ({ executable: "verified-npm", argumentPrefix: [] }),
}));

import { quality } from "../../scripts/quality.mjs";

beforeEach(() => calls.splice(0));
describe("cold quality gate prerequisites", () => {
  it("provisions the isolated analyzers and reviewed fork before doctor is required", () => {
    quality("setup");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[0]).toMatch(/scripts\/quality-tools\.mjs$/);
    expect(calls[1]?.[0]).toMatch(/scripts\/groma-runtime\.mjs$/);
    expect(calls.every((args) => args[1] === "setup")).toBe(true);
  });
  it("builds before running installed-binary acceptance tests during release qualification", () => {
    quality("release");
    const build = calls.findIndex((args) => args.join(" ") === "run build");
    const tests = calls.findIndex((args) => args.some((arg) => /node_modules\/vitest\//.test(arg)));
    expect(build).toBeGreaterThan(-1);
    expect(tests).toBeGreaterThan(build);
    expect(calls.some((args) => args.some((arg) => arg.endsWith("scripts/mutation.mjs")))).toBe(
      true,
    );
  });
  it("keeps the separate Linux policy band independent of a warm dist directory", () => {
    quality("ci", ["--policy-only"]);
    expect(calls.some((args) => args.join(" ") === "run build")).toBe(false);
    expect(calls.some((args) => args.some((arg) => /node_modules\/vitest\//.test(arg)))).toBe(
      false,
    );
    for (const file of [
      "architecture.mjs",
      "agents.mjs",
      "mutation.mjs",
      "security.mjs",
      "groma.mjs",
    ]) {
      expect(calls.some((args) => args.some((arg) => arg.endsWith(`scripts/${file}`)))).toBe(true);
    }
  });
});
