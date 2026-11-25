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

interface WorkflowStep {
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Readonly<Record<string, unknown>>;
}
interface WorkflowJob {
  readonly steps: readonly WorkflowStep[];
  readonly strategy?: {
    readonly matrix: { readonly node: readonly string[]; readonly os: readonly string[] };
  };
  readonly needs?: readonly string[];
  readonly if?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly permissions?: Readonly<Record<string, string>>;
}
interface CiWorkflow {
  readonly permissions: Readonly<Record<string, string>>;
  readonly on: Readonly<Record<string, unknown>>;
  readonly jobs: {
    readonly consumer: WorkflowJob;
    readonly policy: WorkflowJob;
    readonly required: WorkflowJob;
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

  it("qualifies the six-cell current Node and operating-system consumer matrix", () => {
    const workflow = parse(readProjectFile(".github/workflows/ci.yml")) as CiWorkflow;
    expect(workflow.jobs.consumer.strategy?.matrix).toEqual({
      os: ["ubuntu-latest", "macos-latest", "windows-latest"],
      node: ["24", "26"],
    });
    const commands = workflow.jobs.consumer.steps.flatMap((step) => (step.run ? [step.run] : []));
    expect(commands.some((command) => command.includes("package:inspect"))).toBe(true);
    expect(commands.some((command) => command.includes("package:verify-install"))).toBe(true);
    expect(commands).toContain("npm test");
  });

  it("keeps event code read-only with immutable actions, history and no persisted checkout credentials", () => {
    const workflow = parse(readProjectFile(".github/workflows/ci.yml")) as CiWorkflow;
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.on).not.toHaveProperty("pull_request_target");
    for (const job of Object.values(workflow.jobs)) {
      expect(job.permissions).toBeUndefined();
      for (const step of job.steps) {
        if (step.uses) expect(step.uses).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/);
        if (step.uses?.startsWith("actions/checkout@")) {
          expect(step.with?.["fetch-depth"]).toBe(0);
          expect(step.with?.["persist-credentials"]).toBe(false);
        }
      }
    }
  });

  it("fails the required aggregate for failed, cancelled or skipped bands", () => {
    const workflow = parse(readProjectFile(".github/workflows/ci.yml")) as CiWorkflow;
    expect(workflow.jobs.required.if).toBe("always()");
    expect(workflow.jobs.required.needs).toEqual(["policy", "consumer"]);
    expect(workflow.jobs.required.env?.POLICY_RESULT).toMatch(
      /^\$\{\{ needs\.policy\.result \}\}$/,
    );
    expect(workflow.jobs.required.env?.CONSUMER_RESULT).toMatch(
      /^\$\{\{ needs\.consumer\.result \}\}$/,
    );
    expect(workflow.jobs.required.steps[0]?.run).toContain(
      'test "$POLICY_RESULT" = success && test "$CONSUMER_RESULT" = success',
    );
  });
});
