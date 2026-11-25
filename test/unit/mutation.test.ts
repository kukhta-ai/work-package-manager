import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { reviewMutationReport, runMutationGate } from "../../scripts/mutation.mjs";

interface Mutant {
  id: string;
  mutatorName: string;
  replacement: string;
  location: { start: { line: number; column: number }; end: { line: number; column: number } };
  status: string;
  static?: boolean;
  statusReason?: string;
}
interface Report {
  schemaVersion: string;
  framework: { name: string; version: string };
  config: { mutate: string[]; mutator?: { excludedMutations: string[] } };
  testFiles: Record<string, { tests: { id: string; name: string }[] }>;
  files: Record<string, { source: string; mutants: Mutant[] }>;
}
interface Waiver {
  file: string;
  sourceSha256: string;
  mutatorName: string;
  location: Mutant["location"];
  original: string;
  replacement: string;
  status: string;
  versions: Record<string, string>;
  review: { reviewedBy: string; disposition: string; rationale: string };
  fingerprint: string;
}
const MODEL = "src/vnext/core/model.ts";
const INTEGRITY = "src/core/services/integrity.ts";
const SOURCE_TEXT = "src/vnext/core/source-text.ts";
const roots: string[] = [];

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
function sign(waiver: Omit<Waiver, "fingerprint"> & Partial<Pick<Waiver, "fingerprint">>): Waiver {
  const payload = { ...waiver };
  delete payload.fingerprint;
  return { ...payload, fingerprint: hash(JSON.stringify(canonical(payload))) };
}
function write(root: string, path: string, contents: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wpm-mutation-review-"));
  roots.push(root);
  const versions = { "@stryker-mutator/core": "10.1.1", ajv: "8.17.1", yaml: "2.9.0" };
  write(
    root,
    "package.json",
    JSON.stringify({
      dependencies: { ajv: versions.ajv, yaml: versions.yaml },
      devDependencies: { "@stryker-mutator/core": versions["@stryker-mutator/core"] },
    }),
  );
  for (const [name, version] of Object.entries(versions))
    write(root, `node_modules/${name}/package.json`, JSON.stringify({ version }));
  write(
    root,
    "node_modules/@stryker-mutator/core/bin/stryker.js",
    "throw new Error('fixture executable must be injected');\n",
  );
  write(root, "stryker.config.mjs", "export default {};\n");
  const source = "export const value = true;\n";
  const column = source.indexOf("true") + 1;
  const location = { start: { line: 1, column }, end: { line: 1, column: column + 4 } };
  const report: Report = {
    schemaVersion: "1.0",
    framework: { name: "StrykerJS", version: "10.1.1" },
    config: { mutate: ["src/vnext/core/**/*.ts", INTEGRITY] },
    testFiles: {
      "test/unit/model.test.ts": { tests: [{ id: "0", name: "fixture behavioral test" }] },
    },
    files: {},
  };
  let id = 0;
  for (const file of [MODEL, INTEGRITY, SOURCE_TEXT]) {
    write(root, file, source);
    report.files[file] = {
      source,
      mutants: [
        {
          id: String(id++),
          mutatorName: "BooleanLiteral",
          replacement: "false",
          location,
          status: file === MODEL ? "Survived" : "Killed",
        },
      ],
    };
  }
  const subject: Omit<Waiver, "fingerprint"> = {
    file: MODEL,
    sourceSha256: hash(source),
    mutatorName: "BooleanLiteral",
    location,
    original: "true",
    replacement: "false",
    status: "Survived",
    versions: { "@stryker-mutator/core": "10.1.1", ajv: "8.17.1" },
    review: {
      reviewedBy: "/root/native_agents",
      disposition: "equivalent",
      rationale:
        "Fixture-only reviewed equivalent used to exercise exact source, dependency and mutation identity enforcement.",
    },
  };
  const policy = { schemaVersion: 1, waivers: [sign(subject)] };
  write(root, "quality/mutation-waivers.json", JSON.stringify(policy));
  return { root, report, policy };
}
function model(report: Report) {
  const file = report.files[MODEL];
  if (!file) throw new Error("fixture lacks model scope");
  const mutant = file.mutants[0];
  if (!mutant) throw new Error("fixture lacks model mutant");
  return { file, mutant };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("exact mutation review gate", () => {
  it("retains raw score and consumes only an individually reviewed exact survivor", () => {
    const { root, report, policy } = fixture();
    const result = reviewMutationReport(root, report, policy);
    expect(result).toMatchObject({
      status: "accepted",
      counts: { Killed: 2, Survived: 1, NoCoverage: 0 },
      unreviewed: 0,
    });
    expect(result.rawMutationScore).toBeCloseTo(200 / 3);
    expect(result.reviewed).toHaveLength(1);
  });

  it("does not depend on unstable numeric mutant ids", () => {
    const { root, report, policy } = fixture();
    model(report).mutant.id = "new-id-after-unrelated-mutation";
    expect(reviewMutationReport(root, report, policy).reviewed).toHaveLength(1);
  });

  it("rejects a new survivor and does not extend an approval to NoCoverage", () => {
    const { root, report, policy } = fixture();
    const entry = report.files[INTEGRITY];
    if (!entry?.mutants[0]) throw new Error("fixture lacks integrity mutant");
    entry.mutants[0].status = "Survived";
    expect(() => reviewMutationReport(root, report, policy)).toThrow("Unreviewed Survived");
    entry.mutants[0].status = "Killed";
    model(report).mutant.status = "NoCoverage";
    expect(() => reviewMutationReport(root, report, policy)).toThrow("Unreviewed NoCoverage");
  });

  it("rejects source or exact mutation changes instead of refreshing approval", () => {
    const { root, report, policy } = fixture();
    write(root, MODEL, `${model(report).file.source}// changed source\n`);
    expect(() => reviewMutationReport(root, report, policy)).toThrow("differs from current source");
    write(root, MODEL, model(report).file.source);
    model(report).mutant.replacement = "0";
    expect(() => reviewMutationReport(root, report, policy)).toThrow("Unreviewed Survived");
  });

  it("rejects duplicate mutants, duplicate waivers and stale approvals", () => {
    const { root, report, policy } = fixture();
    model(report).file.mutants.push(structuredClone(model(report).mutant));
    expect(() => reviewMutationReport(root, report, policy)).toThrow(
      "Duplicate mutation report identity",
    );
    model(report).file.mutants.pop();
    const waiver = policy.waivers[0];
    if (!waiver) throw new Error("fixture lacks waiver");
    policy.waivers.push(structuredClone(waiver));
    expect(() => reviewMutationReport(root, report, policy)).toThrow("Duplicate mutation waiver");
    policy.waivers.pop();
    model(report).mutant.status = "Killed";
    expect(() => reviewMutationReport(root, report, policy)).toThrow("Stale or unconsumed");
  });

  it("rejects tampering with rationale, fingerprint, snippet or reviewed dependency", () => {
    const { root, report, policy } = fixture();
    const initial = policy.waivers[0];
    if (!initial) throw new Error("fixture lacks waiver");
    const original = structuredClone(initial);
    initial.review.rationale += " Unreviewed expansion.";
    expect(() => reviewMutationReport(root, report, policy)).toThrow("fingerprint");
    policy.waivers[0] = { ...original, fingerprint: "0".repeat(64) };
    expect(() => reviewMutationReport(root, report, policy)).toThrow("fingerprint");
    policy.waivers[0] = sign({ ...original, original: "different snippet" });
    expect(() => reviewMutationReport(root, report, policy)).toThrow("Unreviewed Survived");
    policy.waivers[0] = original;
    write(
      root,
      "package.json",
      JSON.stringify({
        dependencies: { ajv: "8.20.0", yaml: "2.9.0" },
        devDependencies: { "@stryker-mutator/core": "10.1.1" },
      }),
    );
    write(root, "node_modules/ajv/package.json", JSON.stringify({ version: "8.20.0" }));
    expect(() => reviewMutationReport(root, report, policy)).toThrow(
      "Reviewed dependency version changed",
    );
  });

  it.each([
    "empty files",
    "missing file",
    "new file",
    "empty mutants",
    "empty tests",
    "changed patterns",
    "excluded operator",
  ])("rejects scope reduction or drift: %s", (scenario) => {
    const { root, report, policy } = fixture();
    if (scenario === "empty files") report.files = {};
    if (scenario === "missing file") delete report.files[SOURCE_TEXT];
    if (scenario === "new file") write(root, "src/vnext/core/new.ts", "export const future = 1;\n");
    if (scenario === "empty mutants") model(report).file.mutants = [];
    if (scenario === "empty tests") report.testFiles = {};
    if (scenario === "changed patterns") report.config.mutate = [MODEL];
    if (scenario === "excluded operator")
      report.config.mutator = { excludedMutations: ["BooleanLiteral"] };
    expect(() => reviewMutationReport(root, report, policy)).toThrow();
  });

  it("rejects unknown statuses, ignored mutations, invalid locations and producer drift", () => {
    const { root, report, policy } = fixture();
    model(report).mutant.status = "Unexpected";
    expect(() => reviewMutationReport(root, report, policy)).toThrow("status");
    model(report).mutant.status = "Ignored";
    expect(() => reviewMutationReport(root, report, policy)).toThrow("status");
    model(report).mutant.status = "Survived";
    model(report).mutant.location = {
      start: { line: 999, column: 1 },
      end: { line: 999, column: 2 },
    };
    expect(() => reviewMutationReport(root, report, policy)).toThrow("outside the exact source");
    report.framework.version = "99.0.0";
    expect(() => reviewMutationReport(root, report, policy)).toThrow("producer");
  });

  it("retains known initialization errors as unscored and rejects unrelated runtime failures", () => {
    const { root, report, policy } = fixture();
    const runtime: Mutant = {
      ...model(report).mutant,
      id: "startup",
      mutatorName: "StringLiteral",
      replacement: '""',
      status: "RuntimeError",
      static: true,
      statusReason: "An error occurred outside of a test run: schema is invalid",
    };
    model(report).file.mutants.push(runtime);
    const result = reviewMutationReport(root, report, policy);
    expect(result.counts.RuntimeError).toBe(1);
    expect(result.counts.Killed).toBe(2);
    expect(result.unscoredInitializationErrors).toBe(1);
    runtime.statusReason = "worker disappeared";
    expect(() => reviewMutationReport(root, report, policy)).toThrow(
      "Unclassified mutation runtime failure",
    );
  });

  it("starts a fresh exact local collection and writes a compact receipt only after review", () => {
    const { root, report } = fixture();
    const reportPath = ".quality/mutation/report.json";
    write(root, reportPath, "old report must not survive");
    write(root, ".quality/mutation/review.json", "old approval must not survive");
    const result = runMutationGate(root, (args, cwd) => {
      expect(cwd).toBe(root);
      expect(args).toEqual([
        join(root, "node_modules/@stryker-mutator/core/bin/stryker.js"),
        "run",
        join(root, "stryker.config.mjs"),
      ]);
      expect(existsSync(join(root, reportPath))).toBe(false);
      expect(existsSync(join(root, ".quality/mutation/review.json"))).toBe(false);
      write(root, reportPath, JSON.stringify(report));
    });
    expect(result.status).toBe("accepted");
    expect(readFileSync(join(root, ".quality/mutation/review.json"), "utf8")).toContain(
      result.reportFileSha256,
    );
  });

  it("fails when runner produces no fresh report or fails, and never falls back to another tool", () => {
    const { root } = fixture();
    write(root, ".quality/mutation/report.json", "stale report");
    expect(() => runMutationGate(root, () => {})).toThrow();
    expect(existsSync(join(root, ".quality/mutation/review.json"))).toBe(false);
    expect(() =>
      runMutationGate(root, () => {
        throw new Error("runner failed");
      }),
    ).toThrow("runner failed");
    rmSync(join(root, "node_modules/@stryker-mutator/core/bin/stryker.js"));
    write(root, ".quality/mutation/review.json", "stale accepted receipt");
    expect(() =>
      runMutationGate(root, () => {
        throw new Error("must not run fallback");
      }),
    ).toThrow("ENOENT");
    expect(existsSync(join(root, ".quality/mutation/review.json"))).toBe(false);
  });
});
