import type { Command } from "commander";
import { ValidationError } from "../core/errors.js";
import { withExamples } from "../help/examples.js";
import type { ApmTarget } from "./adapters/apm.js";
import { VnextWorkspace } from "./adapters/workspace.js";
import { packageSchema, stableJson } from "./core/model.js";

interface CommonOptions {
  root: string;
  dryRun: boolean;
}
interface OperationOptions extends CommonOptions {
  prerequisite: string[];
  ac: string[];
  setup?: string;
}
interface GroupOptions extends CommonOptions {
  operation: string[];
  group: string[];
}
interface ApmOptions extends CommonOptions {
  executable: string;
  sha256: string;
  target?: string;
}
interface AddSetupOptions extends CommonOptions {
  as: string;
  backend?: string;
}

/** Register the additive vNext command tree without changing legacy command behavior. */
export function registerVnextCommands(
  program: Command,
  output: { write(text: string): void } = process.stdout,
): void {
  const vnext = program
    .command("vnext")
    .description("Author portable operation packages (explicit vNext source contract)");
  vnext
    .command("schema")
    .description("Print the versioned package.yml JSON Schema")
    .action(() => {
      output.write(stableJson(packageSchema));
    });
  vnext.option("--root <directory>", "package source directory", ".");
  vnext.option("--dry-run", "report intended effects without changing files or tasks", false);
  const execute = (
    command: Command,
    operation: (workspace: VnextWorkspace, options: CommonOptions) => unknown,
  ): void => {
    const options = command.optsWithGlobals<CommonOptions>();
    try {
      output.write(stableJson(operation(new VnextWorkspace(options.root), options)));
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error));
    }
  };
  const init = vnext
    .command("init")
    .argument("<name>", "portable package name")
    .description("Create package.yml and a native authoring backlog");
  init.action((name: string) =>
    execute(init, (workspace, options) => workspace.init(name, options.dryRun)),
  );
  const view = vnext
    .command("view")
    .description("Inspect source declarations without activating an agent");
  view.action(() => execute(view, (workspace) => workspace.view()));
  const check = vnext
    .command("check")
    .alias("validate")
    .description("Validate source, native tasks, paths and release content");
  check.action(() => execute(check, (workspace) => workspace.check()));
  const lock = vnext
    .command("lock")
    .description("Intentionally capture local source integrity (plain source needs no APM)");
  lock.action(() => execute(lock, (workspace, options) => workspace.lock(options.dryRun)));
  const build = vnext
    .command("build")
    .description("Build a deterministic portable .tgz; no agent launch or publication");
  build.action(() => execute(build, (workspace, options) => workspace.build(options.dryRun)));
  const test = vnext
    .command("test")
    .description("Rehearse static recipient archive extraction in an owned temporary directory");
  test.action(() => execute(test, (workspace, options) => workspace.test(options.dryRun)));
  const operations = vnext
    .command("operation")
    .description("Native authoring tasks with stable package operation identities");
  for (const verb of ["add", "create"] as const) {
    const operationAdd = operations
      .command(verb)
      .argument("<id>", "stable operation identity")
      .argument("<title>", "native task title")
      .description(
        verb === "create"
          ? "Create an editable native task-backed draft"
          : "Create one native Backlog.md task",
      )
      .option(
        "--prerequisite <operation>",
        "existing operation required before this one",
        collect,
        [],
      )
      .option("--ac <outcome>", "observable acceptance outcome (repeatable)", collect, [])
      .option("--setup <name>", "explicit worker setup; omitted inherits package default")
      .option("--without-setup", "explicitly require no additional setup", false);
    operationAdd.action((id: string, title: string) =>
      execute(operationAdd, (workspace) => {
        const options = operationAdd.optsWithGlobals<
          OperationOptions & { withoutSetup: boolean }
        >();
        if (options.setup !== undefined && options.withoutSetup)
          throw new Error("--setup conflicts with --without-setup");
        const setup = options.withoutSetup ? null : options.setup;
        const input = {
          prerequisites: options.prerequisite,
          acceptanceCriteria: options.ac,
          dryRun: options.dryRun,
          draft: verb === "create",
        };
        return workspace.addOperation(id, title, setup === undefined ? input : { ...input, setup });
      }),
    );
    withExamples(operationAdd, [
      {
        command: `wpm vnext --root ./brief operation ${verb} brief "Produce a brief"${verb === "add" ? ' --ac "A readable brief exists"' : ""}`,
      },
    ]);
  }
  const operationList = operations
    .command("list")
    .description("List stable operation/task associations");
  operationList.action(() => execute(operationList, (workspace) => workspace.listOperations()));
  const operationView = operations
    .command("view")
    .argument("<id>")
    .description("Inspect native source, readiness and edit command");
  operationView.action((id: string) =>
    execute(operationView, (workspace) => workspace.viewOperation(id)),
  );
  const finalize = operations
    .command("finalize")
    .argument("<id>")
    .description("Validate authored instructions and finalize without completing recipient work");
  finalize.action((id: string) =>
    execute(finalize, (workspace, options) => workspace.finalizeOperation(id, options.dryRun)),
  );
  const setSetup = operations
    .command("set-setup")
    .description("Change only the operation setup association; preserve native task content")
    .argument("<id>", "stable operation identity")
    .option("--setup <name>", "select an existing named worker setup")
    .option("--inherit", "inherit the explicit default", false)
    .option("--without-setup", "disable setup inheritance", false);
  setSetup.action((id: string) =>
    execute(setSetup, (workspace, common) => {
      const options = setSetup.optsWithGlobals<
        CommonOptions & { setup?: string; inherit: boolean; withoutSetup: boolean }
      >();
      if (
        Number(options.setup !== undefined) +
          Number(options.inherit) +
          Number(options.withoutSetup) !==
        1
      )
        throw new Error("select exactly one of --setup, --inherit or --without-setup");
      return workspace.setOperationSetup(
        id,
        options.withoutSetup ? null : options.setup,
        common.dryRun,
      );
    }),
  );
  const operationDelete = operations
    .command("delete")
    .argument("<ids...>")
    .option("--yes", "confirm retirement of the explicit batch", false)
    .description("Archive unreferenced operation source without losing authored text");
  operationDelete.action((ids: string[]) =>
    execute(operationDelete, (workspace, options) => {
      if (!options.dryRun && !operationDelete.opts<{ yes: boolean }>().yes)
        throw new Error("operation delete requires --yes or --dry-run");
      return workspace.deleteOperations(ids, options.dryRun);
    }),
  );
  const version = vnext
    .command("version")
    .argument("[value]")
    .option("--preid <identifier>", "identifier for an explicit prerelease increment")
    .description("Read, set or increment package version without tagging or publishing");
  version.action((value?: string) =>
    execute(version, (workspace, options) =>
      workspace.version(value, version.opts<{ preid?: string }>().preid, options.dryRun),
    ),
  );
  const groups = vnext
    .command("group")
    .description("Operation selections, independent of prerequisites");
  const groupSet = groups
    .command("set")
    .argument("<name>", "operation group name")
    .description("Create or replace a named operation selection")
    .option("--operation <id>", "direct operation member", collect, [])
    .option("--group <name>", "nested group member", collect, []);
  groupSet.action((name: string) =>
    execute(groupSet, (workspace) => {
      const options = groupSet.optsWithGlobals<GroupOptions>();
      return workspace.setGroup(name, options.operation, options.group, options.dryRun);
    }),
  );
  const groupList = groups
    .command("list")
    .description("List named operation selections and nested group membership");
  groupList.action(() => execute(groupList, (workspace) => workspace.view().groups));
  const groupView = groups
    .command("view")
    .argument("<name>")
    .description("Inspect direct and expanded group selection");
  groupView.action((name: string) => execute(groupView, (workspace) => workspace.viewGroup(name)));
  for (const action of ["add", "remove"] as const) {
    const command = groups
      .command(action)
      .description(
        action === "add"
          ? "Add direct references without changing prerequisites"
          : "Remove direct references and preserve source definitions",
      )
      .argument("<name>", "existing operation group")
      .option("--operation <id>", "direct member", collect, [])
      .option("--group <name>", "nested member", collect, []);
    command.action((name: string) =>
      execute(command, (workspace, common) => {
        const options = command.optsWithGlobals<GroupOptions>();
        return workspace.changeGroupMembers(
          name,
          options.operation,
          options.group,
          action,
          common.dryRun,
        );
      }),
    );
    withExamples(command, [
      { command: `wpm vnext --root ./brief group ${action} delivery --operation brief` },
    ]);
  }
  const groupDelete = groups
    .command("delete")
    .argument("<names...>")
    .option("--yes", "confirm deletion of the explicit batch", false)
    .description("Delete unreferenced group definitions and preserve operations");
  groupDelete.action((names: string[]) =>
    execute(groupDelete, (workspace, options) => {
      if (!options.dryRun && !groupDelete.opts<{ yes: boolean }>().yes)
        throw new Error("group delete requires --yes or --dry-run");
      return workspace.deleteGroups(names, options.dryRun);
    }),
  );
  const setups = vnext
    .command("worker-setup")
    .description("Source definitions for the recipient's existing agent");
  const setupCreate = setups
    .command("create")
    .argument("[name]", "optional setup name; omitted creates the package default")
    .description("Create a plain WORKER.md draft; unnamed create sets the default");
  setupCreate.action((name?: string) =>
    execute(setupCreate, (workspace, options) => workspace.createSetup(name, options.dryRun)),
  );
  const setupAdd = setups
    .command("add")
    .argument("<source>", "existing confined local setup directory")
    .description("Reference existing local source without copying or fetching")
    .requiredOption("--as <name>", "stable setup name")
    .option("--backend <backend>", "explicit plain or apm; otherwise detect known local source");
  setupAdd.action((source: string) =>
    execute(setupAdd, (workspace) => {
      const options = setupAdd.optsWithGlobals<AddSetupOptions>();
      if (options.backend !== undefined && options.backend !== "plain" && options.backend !== "apm")
        throw new Error("backend must be plain or apm");
      return workspace.addSetup(source, options.as, options.backend, options.dryRun);
    }),
  );
  const setupList = setups.command("list").description("List definitions, not agents");
  setupList.action(() => execute(setupList, (workspace) => workspace.view().workerSetup));
  const setupView = setups
    .command("view")
    .argument("[name]", "setup name; omitted selects only the declared default")
    .description("Read selected source or the declared package default");
  setupView.action((name?: string) => execute(setupView, (workspace) => workspace.viewSetup(name)));
  const setupRemove = setups
    .command("remove")
    .argument("<names...>", "unused setup declarations to remove together")
    .description(
      "Remove unreferenced declarations after complete batch preflight; preserve source",
    );
  setupRemove.action((names: string[]) =>
    execute(setupRemove, (workspace, options) => workspace.removeSetups(names, options.dryRun)),
  );
  const apm = setups
    .command("apm")
    .description(
      "Explicit pinned APM 0.35.0 composition; no implicit installation or agent launch",
    );
  for (const phase of ["lock", "install", "compile"] as const) {
    const command = apm
      .command(phase)
      .argument("<name>", "declared APM setup name")
      .description(
        phase === "lock"
          ? "Resolve the native lock without target deployment"
          : phase === "install"
            ? "Install primitives into an owned target project from its native lock"
            : "Compile native instructions into an already installed target project",
      )
      .requiredOption("--executable <file>", "absolute path to the approved APM 0.35.0 executable")
      .requiredOption("--sha256 <digest>", "approved SHA-256 of that executable");
    if (phase !== "lock")
      command.requiredOption("--target <agent>", "codex or claude-code; no target auto-detection");
    command.action((name: string) =>
      execute(command, (workspace) => {
        const options = command.optsWithGlobals<ApmOptions>();
        let target: ApmTarget | undefined;
        if (options.target !== undefined) {
          if (options.target !== "codex" && options.target !== "claude-code")
            throw new Error("APM target must be codex or claude-code");
          target = options.target === "claude-code" ? "claude" : options.target;
        }
        return workspace.apmPhase(
          name,
          phase,
          target,
          { executable: options.executable, sha256: options.sha256 },
          options.dryRun,
        );
      }),
    );
    withExamples(command, [
      {
        command: `wpm vnext --root ./brief worker-setup apm ${phase} research --executable /approved/apm --sha256 <approved-executable-digest>${phase === "lock" ? "" : " --target codex"}`,
        note: "Obtain and verify the pinned CLI distribution separately; this command never downloads an executable.",
      },
    ]);
  }

  withExamples(vnext, [
    {
      command: "wpm vnext --root ./brief init brief",
      note: "Start a plain package without installing or launching an agent.",
    },
  ]);
  withExamples(init, [{ command: "wpm vnext --root ./brief init brief" }]);
  withExamples(operations, [
    {
      command:
        'wpm vnext --root ./brief operation add brief "Produce a brief" --ac "A readable brief exists"',
    },
  ]);
  for (const [command, example] of [
    [operationView, "wpm vnext --root ./brief operation view brief"],
    [finalize, "wpm vnext --root ./brief operation finalize brief"],
    [setSetup, "wpm vnext --root ./brief operation set-setup brief --without-setup"],
    [operationDelete, "wpm vnext --root ./brief operation delete brief --dry-run"],
    [version, "wpm vnext --root ./brief version prerelease --preid beta"],
    [groupView, "wpm vnext --root ./brief group view delivery"],
    [groupDelete, "wpm vnext --root ./brief group delete delivery --yes"],
  ] as const)
    withExamples(command, [{ command: example }]);
  withExamples(groupSet, [
    {
      command: "wpm vnext --root ./brief group set install --operation brief",
      note: "Select an operation without changing its prerequisites.",
    },
  ]);
  withExamples(setupCreate, [
    {
      command: "wpm vnext --root ./brief worker-setup create research",
      note: "A named source draft leaves the package default unchanged.",
    },
  ]);
  withExamples(setupAdd, [
    { command: "wpm vnext --root ./brief worker-setup add ./shared/research --as research" },
  ]);
  withExamples(setupView, [{ command: "wpm vnext --root ./brief worker-setup view research" }]);
  withExamples(setupRemove, [
    {
      command: "wpm vnext --root ./brief worker-setup remove research spare",
      note: "Preflight the entire unused batch and preserve its authored files.",
    },
  ]);
}

function collect(value: string, previous: string[]): string[] {
  return [...new Set([...previous, value])];
}
