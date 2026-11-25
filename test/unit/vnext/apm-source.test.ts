import { describe, expect, it } from "vitest";
import { apmReference } from "../../../src/vnext/core/apm-source.js";
import { emptyPackage, parsePackage } from "../../../src/vnext/core/model.js";

describe("portable remote APM setup references", () => {
  it.each([
    "worker-setup/context",
    "./local/context",
    "apm",
    "xapm:owner/repo",
    "owner/repoapm:",
  ])("leaves local spelling %s to the source-path validator", (value) => {
    expect(apmReference(value)).toBeUndefined();
  });
  it.each([
    "owner/repository",
    "a/b",
    "owner/repository/subpath",
    "owner/repository/deep/sub-path",
    "owner/repository#v1.0.0",
    "owner/repository#refs/heads/main",
    "owner/repository#1",
    "owner/repository#release_1-2",
    "https://github.com/owner/repository",
    "https://git.example.test:8443/team/repository.git#v1.0.0",
    "https://host.test/owner/repository/context#feature/research",
  ])("preserves exact explicit locator %s", (reference) => {
    expect(apmReference(`apm:${reference}`)).toBe(reference);
  });
  it.each([
    "",
    "owner",
    "/owner/repo",
    "owner/repo/",
    "owner//repo",
    "owner/./repo",
    "owner/../repo",
    "./owner/repo",
    "../owner/repo",
    "owner/repo#",
    "owner/repo#first#second",
    "owner/repo#./main",
    "owner/repo#../main",
    "owner/repo#refs//main",
    "owner/repo#/main",
    "owner/repo#main/",
    "owner/repo?token=secret",
    "owner/repo;command",
    "owner/repo context",
    "owner/repo\\subdir",
    "owner/repo#branch name",
    "owner/repo#@revision",
    "https://host.test",
    "https://host.test/owner",
    "https://host.test/owner/../repo",
    "https://host.test/owner/%2e%2e/repo",
    "https://host.test/owner/repo/",
    "https://user@host.test/owner/repo",
    "https://:password@host.test/owner/repo",
    "https://host.test/owner/repo?token=value",
    "https://[invalid]/owner/repo",
    "http://host.test/owner/repo",
    "ssh://host.test/owner/repo",
  ])("rejects unsafe or ambiguous reference %s", (reference) => {
    expect(() => apmReference(`apm:${reference}`)).toThrow(/APM|apm/);
  });
  it("provides actionable diagnostics for malformed URL, selectors and paths", () => {
    expect(() => apmReference("apm:https://[invalid]/owner/repo")).toThrow(
      "APM remote source must be a valid HTTPS URL",
    );
    expect(() => apmReference("apm:https://host.test")).toThrow(
      "APM remote URL must identify owner and repository",
    );
    expect(() => apmReference("apm:owner/repo##bad")).toThrow(
      "APM reference has multiple revision selectors",
    );
    expect(() => apmReference("apm:owner/repo#.")).toThrow(
      "APM revision must be a nonempty portable Git revision",
    );
    expect(() => apmReference("apm:https://user@host.test/owner/repo")).toThrow(
      "APM remote source cannot contain credentials, queries or fragments",
    );
    expect(() => apmReference("apm:owner")).toThrow("invalid remote APM reference");
  });

  it("permits remote setup references only for the APM backend", () => {
    const source = (backend: "plain" | "apm", path: string) => ({
      ...emptyPackage("reference"),
      workerSetup: { setups: { ctx: { backend, source: path } } },
    });
    for (const reference of ["apm:owner/repo#v1.0.0", "apm:https://host.test/owner/repo#main"]) {
      expect(parsePackage(source("apm", reference)).workerSetup.setups.ctx?.source).toBe(reference);
      expect(() => parsePackage(source("plain", reference))).toThrow();
    }
    for (const backend of ["plain", "apm"] as const) {
      expect(
        parsePackage(source(backend, "worker-setup/context")).workerSetup.setups.ctx?.source,
      ).toBe("worker-setup/context");
      for (const path of [
        "../outside",
        "/absolute",
        ".agents/context",
        ".wpm-apm/context",
        "worker-setup/../outside",
      ])
        expect(() => parsePackage(source(backend, path))).toThrow();
    }
    expect(() => parsePackage(source("apm", "apm:owner/repo#.."))).toThrow("APM revision");
  });
});
