import { describe, expect, it } from "vitest";
import { resolveNpmInvocation } from "../../../distribution-preparation/prepare-package.js";

describe("portable npm invocation", () => {
  it("executes npm's JavaScript entry through Node without a shell on Windows", () => {
    expect(
      resolveNpmInvocation(
        "win32",
        "C:\\node\\node_modules\\npm\\bin\\npm-cli.js",
        "C:\\node\\node.exe",
      ),
    ).toEqual({
      executable: "C:\\node\\node.exe",
      argumentPrefix: ["C:\\node\\node_modules\\npm\\bin\\npm-cli.js"],
    });
  });

  it("fails closed on Windows when the npm-run entry point is unavailable", () => {
    expect(() => resolveNpmInvocation("win32", "", "node.exe")).toThrow(/npm run package:inspect/);
  });

  it("retains the direct npm executable fallback on POSIX", () => {
    expect(resolveNpmInvocation("linux", "", "/usr/bin/node")).toEqual({
      executable: "npm",
      argumentPrefix: [],
    });
  });
});
