import type { Command } from "commander";
import { ValidationError } from "../core/errors.js";
import { withExamples } from "../help/examples.js";
import { PackageWorkspace } from "./adapters/package-workspace.js";
import { VnextWorkspace } from "./adapters/workspace.js";
import { stableJson } from "./core/model.js";

interface Options {
  root: string;
  dryRun: boolean;
  package?: string;
  packageVersion?: string;
  source?: string;
  dev: boolean;
  optional: boolean;
  manifestOnly: boolean;
  directory?: string;
  preid?: string;
  tree: boolean;
}
/** Register workspace and package graph commands while preserving the existing short authoring surface. */
export function registerPackageCommands(
  vnext: Command,
  output: { write(text: string): void },
): void {
  const run = (
    command: Command,
    action: (ws: PackageWorkspace, options: Options) => unknown,
  ): void => {
    const options = command.optsWithGlobals<Options>();
    try {
      output.write(stableJson(action(new PackageWorkspace(options.root), options)));
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error));
    }
  };
  const ws = vnext
    .command("workspace")
    .description("Register, inspect and check local work packages");
  const init = ws
    .command("init")
    .argument("[directory]")
    .description("Create an explicit local workspace catalog");
  init.action((directory?: string) =>
    run(init, (_workspace, options) =>
      new PackageWorkspace(directory ?? options.root).init(options.dryRun),
    ),
  );
  const add = ws
    .command("add")
    .argument("<directory>")
    .description("Register existing package source without copying it");
  add.action((directory: string) =>
    run(add, (workspace, options) => workspace.add(directory, options.dryRun)),
  );
  const view = ws.command("view").description("List registered local package identities");
  view.action(() => run(view, (workspace) => workspace.view()));
  const check = ws
    .command("check")
    .description("Check package registration, identities and dependency locks");
  check.action(() => run(check, (workspace) => workspace.check()));
  const packages = vnext
    .command("package")
    .description("Create, select, version and link local work packages");
  const create = packages
    .command("create")
    .argument("<name>")
    .option("--directory <path>", "explicit workspace-relative source directory")
    .description("Create and register a package with its own native backlog");
  create.action((name: string) =>
    run(create, (workspace, options) => workspace.create(name, options.directory, options.dryRun)),
  );
  const list = packages.command("list").description("List workspace packages and exact versions");
  list.action(() => run(list, (workspace) => workspace.list()));
  const packageView = packages
    .command("view")
    .argument("[name]")
    .description("Inspect selected package source");
  packageView.action((name?: string) =>
    run(packageView, (workspace, options) => {
      if (name && options.package && name !== options.package)
        throw new Error("conflicting package selection");
      return new VnextWorkspace(
        workspace.select(options.root, name ?? options.package, options.packageVersion),
      ).view();
    }),
  );
  const version = packages
    .command("version")
    .argument("[value]")
    .option("--preid <id>", "prerelease identifier")
    .description("Read or intentionally change one package version");
  version.action((value?: string) =>
    run(version, (workspace, options) =>
      workspace.version(
        workspace.select(options.root, options.package, options.packageVersion),
        value,
        options.preid,
        options.dryRun,
      ),
    ),
  );
  const deps = packages
    .command("deps")
    .description("Maintain ordinary, dev and optional local dependency declarations");
  const depAdd = deps
    .command("add")
    .argument("<spec>")
    .option("--source <source>", "workspace or file:<relative-archive>", "workspace")
    .option("--dev", "author-only dependency", false)
    .option("--optional", "allow unavailable dependency branch", false)
    .option("--manifest-only", "leave existing lock stale", false)
    .description("Declare name@range and reconcile the exact graph lock");
  depAdd.action((spec: string) =>
    run(depAdd, (workspace, options) => {
      if (options.dev && options.optional) throw new Error("--dev conflicts with --optional");
      const at = spec.indexOf("@");
      if (at < 1) throw new Error("dependency requires name@range");
      return workspace.editDependency(
        workspace.select(options.root, options.package, options.packageVersion),
        spec.slice(0, at),
        { source: options.source ?? "workspace", range: spec.slice(at + 1) },
        options.dev
          ? "devDependencies"
          : options.optional
            ? "optionalDependencies"
            : "dependencies",
        options.manifestOnly,
        options.dryRun,
      );
    }),
  );
  const depRemove = deps
    .command("remove")
    .argument("<name>")
    .option("--manifest-only", "leave existing lock stale", false)
    .description("Remove a declaration and reconcile the graph without deleting source");
  depRemove.action((name: string) =>
    run(depRemove, (workspace, options) =>
      workspace.editDependency(
        workspace.select(options.root, options.package, options.packageVersion),
        name,
        undefined,
        "dependencies",
        options.manifestOnly,
        options.dryRun,
      ),
    ),
  );
  const depList = deps
    .command("list")
    .option("--tree", "show repeated instances and cycle references", false)
    .description("Inspect declarations and their exact locked graph");
  depList.action(() =>
    run(depList, (workspace, options) =>
      workspace.dependencies(
        workspace.select(options.root, options.package, options.packageVersion),
        options.tree,
      ),
    ),
  );
  for (const [command, example] of [
    [ws, "wpm vnext workspace view"],
    [init, "wpm vnext --root ./suite workspace init"],
    [add, "wpm vnext --root ./suite workspace add packages/common"],
    [view, "wpm vnext --root ./suite workspace view"],
    [check, "wpm vnext --root ./suite workspace check"],
    [packages, "wpm vnext --root ./suite package list"],
    [create, "wpm vnext --root ./suite package create app"],
    [list, "wpm vnext --root ./suite package list"],
    [packageView, "wpm vnext --root ./suite package view app"],
    [version, "wpm vnext --root ./suite --package app package version minor"],
    [deps, "wpm vnext --root ./suite --package app package deps list"],
    [depAdd, 'wpm vnext --root ./suite --package app package deps add "common@^1.0.0"'],
    [depRemove, "wpm vnext --root ./suite --package app package deps remove common"],
    [depList, "wpm vnext --root ./suite --package app package deps list --tree"],
  ] as const)
    withExamples(command, [{ command: example }]);
}
