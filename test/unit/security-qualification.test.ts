import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { qualifySecurityControls } from "../../scripts/security-qualification.mjs";

type Execute = NonNullable<Parameters<typeof qualifySecurityControls>[1]>;
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wpm-security-controls-contract-"));
  roots.push(root);
  const paths = Object.fromEntries(
    ["semgrep", "gitleaks", "osv", "rules", "gitleaksConfig", "gitleaksIgnore", "osvConfig"].map(
      (name) => {
        const path = join(root, name);
        writeFileSync(path, "fixture tool or policy\n");
        return [name, path];
      },
    ),
  );
  const scratchParent = join(root, "scratch");
  mkdirSync(scratchParent);
  const { semgrep, gitleaks, osv, rules, gitleaksConfig, gitleaksIgnore, osvConfig } = paths;
  if (!semgrep || !gitleaks || !osv || !rules || !gitleaksConfig || !gitleaksIgnore || !osvConfig)
    throw new Error("fixture input missing");
  return {
    semgrep,
    gitleaks,
    osv,
    rules,
    gitleaksConfig,
    gitleaksIgnore,
    osvConfig,
    scratchParent,
    output: join(root, "receipt.json"),
  };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Contract stub only: real pinned binaries are exercised by the Linux policy self-test. */
function emptyFindings(positiveExit = false, emptyScope = false): Execute {
  return (executable, args) => {
    const secret = executable.endsWith("gitleaks");
    const option = secret ? "--report-path" : "--output";
    const output = args[args.indexOf(option) + 1];
    if (!output) throw new Error("missing report output");
    if (secret) writeFileSync(output, "[]");
    else
      writeFileSync(
        output,
        JSON.stringify({
          results: [],
          errors: [],
          paths: { scanned: emptyScope ? [] : ["src/credential.ts"] },
        }),
      );
    return {
      status: positiveExit && output.includes("gitleaks-") && output.includes("baseline") ? 1 : 0,
    };
  };
}

describe("security analyzer self-qualification fails closed", () => {
  it("rejects missing tools before invoking an executor", () => {
    const options = fixture();
    let called = false;
    expect(() =>
      qualifySecurityControls(
        { ...options, semgrep: join(options.scratchParent, "missing") },
        () => {
          called = true;
          return { status: 0 };
        },
      ),
    ).toThrow();
    expect(called).toBe(false);
    expect(readdirSync(options.scratchParent)).toEqual([]);
  });
  it("rejects tools that exit clean for an intentional credential and cleans owned fixture state", () => {
    const options = fixture();
    expect(() => qualifySecurityControls(options, emptyFindings())).toThrow("expected 1");
    expect(JSON.parse(readFileSync(options.output, "utf8")) as unknown).toMatchObject({
      status: "failed",
    });
    expect(readdirSync(options.scratchParent)).toEqual([]);
    expect(readFileSync(options.gitleaksConfig, "utf8")).toBe("fixture tool or policy\n");
  });
  it("requires actual findings rather than trusting a failure exit code", () => {
    const options = fixture();
    expect(() => qualifySecurityControls(options, emptyFindings(true))).toThrow(
      "unexpected findings",
    );
    expect(readdirSync(options.scratchParent)).toEqual([]);
  });
  it("refuses empty source coverage even when a scanner reports success", () => {
    const options = fixture();
    expect(() => qualifySecurityControls(options, emptyFindings(false, true))).toThrow(
      "empty scope",
    );
    expect(readdirSync(options.scratchParent)).toEqual([]);
  });
});
