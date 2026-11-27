import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { projectMcp } from "../core/worker-context.js";
import { contentDigest, hash, type PackageFile } from "./package-archive.js";
import { PackageWorkspace, validateReleaseFiles } from "./package-workspace.js";
import {
  createReleaseFiles,
  publishRelease,
  type ReleaseArtifact,
  type ReleaseFormat,
  readReleaseArtifact,
} from "./release-artifact.js";
import { reviewRelease } from "./release-review.js";
import { VnextWorkspace } from "./workspace.js";

interface BuildOptions {
  name?: string;
  format?: ReleaseFormat;
  out?: string;
  files?: boolean;
  package?: string;
  packageVersion?: string;
  dryRun?: boolean;
}
interface ViewOptions {
  files?: boolean;
  agentSupport?: boolean;
  target?: "codex" | "claude-code";
  opening?: "project" | "session";
}
function mapping(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function contract(files: PackageFile[]): Record<string, unknown> {
  return validateReleaseFiles(files.filter((file) => file.path !== "release-manifest.json"));
}
function leaves(value: Record<string, unknown>, files: PackageFile[]) {
  if (value.schemaVersion === 1) return [{ id: null, prefix: "", contract: value }];
  if (!mapping(value.graph) || !mapping(value.graph.nodes))
    throw new Error("invalid release graph");
  return Object.keys(value.graph.nodes)
    .sort()
    .map((id) => {
      const prefix = `packages/${id.slice(0, 16)}/`;
      const file = files.find((file) => file.path === `${prefix}contract.json`);
      if (!file) throw new Error("missing release instance contract");
      const own: unknown = JSON.parse(file.bytes.toString("utf8"));
      if (!mapping(own)) throw new Error("invalid release instance contract");
      return { id, prefix, contract: own };
    });
}
function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

/** Author-side release orchestration. Saved-artifact operations do not discover source or invoke tools. */
export class ReleaseWorkspace {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Capture a locked runtime closure and publish one deterministic representation. */
  build(options: BuildOptions = {}): unknown {
    if (options.name && options.package && options.name !== options.package)
      throw new Error("conflicting package selection");
    const format = options.format ?? "tgz";
    if (!["tgz", "zip", "directory"].includes(format))
      throw new Error("unsupported release format");
    const workspace = new PackageWorkspace(this.root);
    const selected = workspace.select(
      this.root,
      options.name ?? options.package,
      options.packageVersion,
    );
    const io = new VnextWorkspace(selected);
    const action = () => {
      if (
        workspace.select(this.root, options.name ?? options.package, options.packageVersion) !==
        selected
      )
        throw new Error("release package selection changed before capture");
      const captured = workspace.captureRelease(selected, !options.dryRun);
      if (
        ((options.name ?? options.package) &&
          captured.source.name !== (options.name ?? options.package)) ||
        (options.packageVersion && captured.source.version !== options.packageVersion)
      )
        throw new Error("captured release does not match selected identity");
      validateReleaseFiles(captured.files);
      const files = createReleaseFiles(captured.files);
      const suffix = format === "directory" ? "" : `.${format}`;
      const destination = options.out
        ? resolve(this.root, options.out)
        : join(
            selected,
            "builds",
            `${captured.source.name}-${captured.source.version}.wpm${suffix}`,
          );
      if (contains(destination, selected))
        throw new Error("release output must not contain its source");
      if (!options.dryRun) {
        if (
          workspace.select(this.root, options.name ?? options.package, options.packageVersion) !==
          selected
        )
          throw new Error("release package selection changed before publication");
        const fresh = workspace.captureRelease(selected, true);
        if (contentDigest(fresh.files) !== contentDigest(captured.files))
          throw new Error("source changed before release publication");
      }
      const published = publishRelease(destination, files, format, options.dryRun ?? false);
      return {
        schemaVersion: 1,
        ...published,
        identity: { name: captured.source.name, version: captured.source.version },
        ...(options.files
          ? { files: files.map((file) => ({ path: file.path, sha256: hash(file.bytes) })) }
          : { files: undefined }),
      };
    };
    return options.dryRun ? action() : io.reserveForGraph(action);
  }

  /** Inspect verified saved content without requiring the original workspace. */
  view(path: string, options: ViewOptions = {}): unknown {
    if (options.target !== undefined && !["codex", "claude-code"].includes(options.target))
      throw new Error("unsupported release target");
    if (options.opening !== undefined && !["project", "session"].includes(options.opening))
      throw new Error("unsupported opening method");
    const artifact = this.read(path);
    const value = contract(artifact.files);
    const instances = leaves(value, artifact.files);
    return {
      schemaVersion: 1,
      identity: artifact.identity,
      format: artifact.format,
      contentDigest: artifact.contentDigest,
      artifactDigest: artifact.artifactDigest,
      integrity: artifact.manifestPresent ? "recorded" : "unrecorded",
      publisherTrust: "unverified",
      packages: instances.map((entry) => ({ instance: entry.id, ...entry.contract })),
      dependencies: value.schemaVersion === 2 ? value.graph : null,
      ...(options.files
        ? { files: artifact.files.map((file) => ({ path: file.path, sha256: hash(file.bytes) })) }
        : {}),
      ...(options.agentSupport
        ? {
            agentSupport: instances.flatMap((entry) => {
              const setup = entry.contract.workerSetup;
              if (!mapping(setup) || !Array.isArray(setup.names))
                throw new Error("invalid saved worker setups");
              return setup.names.flatMap((name: string) =>
                (options.target ? [options.target] : ["codex", "claude-code"]).map((target) => {
                  const nativeTarget = target === "claude-code" ? "claude" : "codex";
                  const prefix = `${entry.prefix}worker-setup/${name}/`;
                  const targetPrefix = `${prefix}targets/${nativeTarget}/`;
                  const nativeFiles = artifact.files
                    .filter((file) => file.path.startsWith(targetPrefix))
                    .map((file) => file.path);
                  const metadata = artifact.files.find(
                    (file) => file.path === `${targetPrefix}MCP.json`,
                  );
                  const projection = projectMcp(
                    metadata ? JSON.parse(metadata.bytes.toString("utf8")) : {},
                    nativeTarget,
                  );
                  const opening = options.opening ?? "project";
                  return {
                    instance: entry.id,
                    setup: name,
                    target,
                    opening,
                    workerInstructions: `${prefix}WORKER.md`,
                    nativeFiles,
                    requirements: projection.requirements,
                    requiredVariables: projection.requiredVariables,
                    contextLoaded: false,
                    authenticated: false,
                    agentExecution: false,
                    nextAction:
                      opening === "session"
                        ? "Read the selected WORKER.md and native context in the existing session; configure/reload declared connections explicitly in the host."
                        : nativeFiles.length
                          ? "Open the selected native target project and approve context/connections in the host."
                          : "Read the selected WORKER.md in your existing agent.",
                  };
                }),
              );
            }),
          }
        : {}),
    };
  }

  /** Check deterministic consistency and an optional externally supplied exact subject digest. */
  verify(path: string, expectedDigest?: string): unknown {
    const artifact = this.read(path);
    const digest = expectedDigest?.replace(/^sha256:/, "");
    if (
      digest !== undefined &&
      (!/^[a-f0-9]{64}$/.test(digest) ||
        digest !== (artifact.artifactDigest ?? artifact.contentDigest))
    )
      throw new Error("expected release digest differs");
    if (!artifact.manifestPresent && !digest)
      throw new Error(
        "legacy release integrity is unrecorded; provide an externally expected release digest",
      );
    return {
      schemaVersion: 1,
      status: "verified",
      identity: artifact.identity,
      contentDigest: artifact.contentDigest,
      artifactDigest: artifact.artifactDigest,
      integrity: artifact.manifestPresent ? "manifest-verified" : "external-digest-verified",
      publisherTrust: "unverified",
      review: "not-assessed",
      contextLoaded: false,
      authenticated: false,
      executionOccurred: false,
    };
  }

  /** Produce or accept external static review evidence without activating package instructions. */
  review(path: string, out: string, report: string | undefined, dryRun: boolean): unknown {
    const input = resolve(this.root, path);
    const output = resolve(this.root, out);
    if (contains(input, output) || contains(output, input))
      throw new Error("review output must not overlap its subject");
    return {
      schemaVersion: 1,
      ...reviewRelease(
        this.read(path),
        output,
        report === undefined ? undefined : resolve(this.root, report),
        dryRun,
      ),
    };
  }

  private read(path: string): ReleaseArtifact {
    const artifact = readReleaseArtifact(resolve(this.root, path));
    contract(artifact.files);
    return artifact;
  }
}
