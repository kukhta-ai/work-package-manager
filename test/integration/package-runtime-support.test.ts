import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface LockedPackage {
  readonly dev?: boolean;
  readonly engines?: {
    readonly node?: string;
  };
  readonly optional?: boolean;
}

interface PackageLock {
  readonly packages: Readonly<Record<string, LockedPackage>>;
}

interface CiWorkflow {
  readonly jobs: {
    readonly gate: {
      readonly steps: readonly {
        readonly uses?: string;
        readonly with?: Readonly<Record<string, unknown>>;
      }[];
      readonly strategy: {
        readonly matrix: {
          readonly node: readonly number[];
          readonly os: readonly string[];
        };
      };
    };
  };
}

const readProjectFile = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");

describe("declared Node runtime support", () => {
  it("keeps package metadata and user documentation on Node >=20", () => {
    const packageManifest = JSON.parse(readProjectFile("package.json")) as {
      readonly engines: { readonly node: string };
    };

    expect(packageManifest.engines.node).toBe(">=20");
    expect(readProjectFile("README.md")).toContain("Node.js **>= 20**");
  });

  it.each([
    20, 22,
  ])("keeps every required production package compatible with the Node %i release line", (nodeMajor) => {
    const lock = JSON.parse(readProjectFile("package-lock.json")) as PackageLock;
    const runtimeLine = `>=${nodeMajor} <${nodeMajor + 1}`;
    const incompatible = Object.entries(lock.packages)
      .filter(
        ([path, metadata]) => path !== "" && metadata.dev !== true && metadata.optional !== true,
      )
      .flatMap(([path, metadata]) => {
        const nodeEngine = metadata.engines?.node;
        if (nodeEngine === undefined || semver.intersects(nodeEngine, runtimeLine)) {
          return [];
        }
        return [`${path} (${nodeEngine})`];
      });

    expect(
      incompatible,
      `Required production packages excluding Node ${nodeMajor}: ${incompatible.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the six-cell Node and operating-system CI matrix", () => {
    const workflow = parse(readProjectFile(".github/workflows/ci.yml")) as CiWorkflow;

    expect(workflow.jobs.gate.strategy.matrix).toEqual({
      os: ["ubuntu-latest", "macos-latest", "windows-latest"],
      node: [20, 22],
    });
  });

  it("supplies repository history to strict CI evidence validation", () => {
    const workflow = parse(readProjectFile(".github/workflows/ci.yml")) as CiWorkflow;
    const checkout = workflow.jobs.gate.steps.find((step) => step.uses === "actions/checkout@v4");

    expect(checkout?.with?.["fetch-depth"]).toBe(0);
  });
});
