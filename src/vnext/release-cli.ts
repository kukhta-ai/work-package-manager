import { type Command, InvalidArgumentError, Option } from "commander";
import { ValidationError } from "../core/errors.js";
import { withExamples } from "../help/examples.js";
import { ReleaseWorkspace } from "./adapters/releases.js";
import { stableJson } from "./core/model.js";

interface ReleaseOptions {
  root: string;
  dryRun: boolean;
  package?: string;
  packageVersion?: string;
  format: "tgz" | "zip" | "directory";
  out?: string;
  files: boolean;
  agentSupport: boolean;
  target?: "codex" | "claude-code";
  opening: "project" | "session";
  expectedDigest?: string;
  report?: string;
}

function nonempty(value: string): string {
  if (!value.length) throw new InvalidArgumentError("expected a nonempty path");
  return value;
}

function sha256(value: string): string {
  const digest = value.replace(/^sha256:/, "");
  if (!/^[a-fA-F0-9]{64}$/.test(digest))
    throw new InvalidArgumentError("expected a SHA-256 digest (64 hexadecimal characters)");
  return digest.toLowerCase();
}

/** Register artifact-oriented release commands without requiring authoring source for reads. */
export function registerReleaseCommands(
  vnext: Command,
  output: { write(text: string): void },
): void {
  const run = (
    command: Command,
    action: (releases: ReleaseWorkspace, options: ReleaseOptions) => unknown,
  ): void => {
    const options = command.optsWithGlobals<ReleaseOptions>();
    try {
      output.write(stableJson(action(new ReleaseWorkspace(options.root), options)));
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error));
    }
  };
  const release = vnext
    .command("release")
    .description("Build and inspect saved portable releases and external static review evidence");
  const build = release
    .command("build")
    .argument("[package]", "one root package; omission requires an unambiguous source selection")
    .addOption(
      new Option("--format <format>", "portable artifact representation")
        .choices(["tgz", "zip", "directory"])
        .default("tgz"),
    )
    .option("--out <path>", "artifact destination relative to --root")
    .option("--files", "include the immutable release file inventory", false)
    .description(
      "Build one locked runtime closure without dependency resolution or agent execution",
    );
  build.action((name?: string) => {
    const options = build.optsWithGlobals<ReleaseOptions>();
    if (name && options.package && name !== options.package)
      throw new ValidationError("conflicting package selection");
    run(build, (releases, flags) =>
      releases.build({
        format: flags.format,
        files: flags.files,
        dryRun: flags.dryRun,
        ...(name === undefined ? {} : { name }),
        ...(flags.out === undefined ? {} : { out: flags.out }),
        ...(flags.package === undefined ? {} : { package: flags.package }),
        ...(flags.packageVersion === undefined ? {} : { packageVersion: flags.packageVersion }),
      }),
    );
  });
  const view = release
    .command("view")
    .argument("<artifact>", "saved TGZ, ZIP or release directory")
    .option("--files", "include the immutable release file inventory", false)
    .option("--agent-support", "inspect prepared native files and remaining host actions", false)
    .addOption(new Option("--target <agent>", "recipient agent").choices(["codex", "claude-code"]))
    .addOption(
      new Option("--opening <method>", "recipient opening method")
        .choices(["project", "session"])
        .default("project"),
    )
    .description("Inspect a saved release without source, APM or package execution");
  view.action((artifact: string) =>
    run(view, (releases, flags) =>
      releases.view(artifact, {
        files: flags.files,
        agentSupport: flags.agentSupport,
        opening: flags.opening,
        ...(flags.target === undefined ? {} : { target: flags.target }),
      }),
    ),
  );
  const verify = release
    .command("verify")
    .argument("<artifact>", "saved TGZ, ZIP or release directory")
    .option("--expected-digest <sha256>", "require the expected SHA-256 artifact identity", sha256)
    .description("Verify structure, content and references; this does not certify package safety");
  verify.action((artifact: string) =>
    run(verify, (releases, flags) => releases.verify(artifact, flags.expectedDigest)),
  );
  const review = release
    .command("review")
    .argument("<artifact>", "saved release to treat as untrusted data")
    .requiredOption(
      "--out <directory>",
      "separate immutable request or accepted-report destination",
    )
    .option("--report <file>", "import an external digest-bound static review report", nonempty)
    .description(
      "Prepare external review materials or accept a report without launching a reviewer",
    );
  review.action((artifact: string) =>
    run(review, (releases, flags) => {
      if (!flags.out) throw new Error("review requires --out");
      return releases.review(artifact, flags.out, flags.report, flags.dryRun);
    }),
  );
  for (const [command, example] of [
    [release, "wpm vnext release view ./builds/brief-0.1.0.tgz"],
    [build, "wpm vnext --root ./suite release build brief --format zip --out builds/brief.zip"],
    [
      view,
      "wpm vnext release view ./builds/brief.zip --agent-support --target codex --opening project",
    ],
    [verify, "wpm vnext release verify ./builds/brief.zip"],
    [review, "wpm vnext release review ./builds/brief.zip --out ./review-request"],
  ] as const)
    withExamples(command, [{ command: example }]);
}
