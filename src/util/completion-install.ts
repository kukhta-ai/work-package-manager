import { join } from "node:path";
import omelette from "omelette";
import { UsageError } from "../core/errors.js";
import type { Environment, FileSystem } from "../core/ports/index.js";

/**
 * Shell-completion script emission + install (doc 12 §"Layered architecture": "shell completion script
 * emission" lives in the infra layer; doc 12 §"Tab completion: omelette": "Generates bash/zsh/fish completion
 * scripts"). This is INFRASTRUCTURE — it may import `omelette` — but it does the side-effects through the
 * injected {@link FileSystem} port and reads HOME through the {@link Environment} port, so it is testable with a
 * `MemoryFileSystem`/fake env and never calls `process.exit`.
 *
 * We use ONLY omelette's PURE script generators (`generateCompletionCode` for bash+zsh, `generateCompletionCodeFish`
 * for fish) for the script bytes — NOT omelette's own `setupShellInitFile()`, which calls `process.exit()` and
 * writes via raw `node:fs` (incompatible with the task-27 testable `run()`/ports architecture; see the task-29
 * divergence note). The shell wiring inside the generated script is omelette's, exactly as doc 12 intends.
 */

/** The shells `completion install` supports (doc 12). */
export type Shell = "bash" | "zsh" | "fish";

/** The program name the completion script is generated for (the `wpm` binary; its `installer` alias is a peer). */
const PROGRAM = "wpm";

/** The delimiters of the idempotent loader block written into the shell init file. */
const BLOCK_BEGIN = `# begin ${PROGRAM} completion`;
const BLOCK_END = `# end ${PROGRAM} completion`;

/** The result of an install: which script file was written and which init file got the loader block. */
export interface InstallResult {
  /** The shell the completion was installed for. */
  readonly shell: Shell;
  /** The path of the completion script written (the file the init file sources). */
  readonly scriptPath: string;
  /** The shell init file the loader block was ensured in. */
  readonly initFile: string;
  /** Whether the loader block was newly added (`false` when it was already present — install is idempotent). */
  readonly added: boolean;
}

/** Generate the completion-script text for a shell, using omelette's pure (no-exit) generators. */
export function generateScript(shell: Shell): string {
  // Construct omelette with a plain template (NO `--completion*` in argv) so its constructor does not exit.
  const instance = omelette(`${PROGRAM} <command>`);
  return shell === "fish"
    ? instance.generateCompletionCodeFish()
    : instance.generateCompletionCode();
}

/** The HOME directory, read through the Environment port; a missing HOME is a usage error (can't install). */
function homeDir(env: Environment): string {
  const home = env.getEnv("HOME");
  if (home === undefined || home === "") {
    throw new UsageError("cannot install completion: HOME is not set");
  }
  return home;
}

/** The script path + init file for a shell, rooted at HOME (mirrors omelette's own layout conventions). */
function shellPaths(shell: Shell, home: string): { scriptPath: string; initFile: string } {
  switch (shell) {
    case "bash":
      return {
        scriptPath: join(home, `.${PROGRAM}`, "completion.sh"),
        initFile: join(home, ".bashrc"),
      };
    case "zsh":
      return {
        scriptPath: join(home, `.${PROGRAM}`, "completion.zsh"),
        initFile: join(home, ".zshrc"),
      };
    case "fish":
      return {
        scriptPath: join(home, `.${PROGRAM}`, "completion.fish"),
        initFile: join(home, ".config", "fish", "config.fish"),
      };
  }
}

/** The line the init file uses to load the completion script (`source` works in bash/zsh/fish alike). */
function loaderLine(scriptPath: string): string {
  return `source ${scriptPath}`;
}

/** The full delimited loader block ensured (idempotently) in the init file. */
function loaderBlock(scriptPath: string): string {
  return `${BLOCK_BEGIN}\n${loaderLine(scriptPath)}\n${BLOCK_END}\n`;
}

/**
 * Install shell completion for `shell`: write the completion script and ensure the shell init file sources it.
 * Idempotent — if the loader block is already present the init file is left unchanged (`added: false`). Pure
 * over the ports (no `process.exit`, no direct `node:fs`): the script + init file are written via {@link
 * FileSystem.write} after a read-modify-write of any existing init file.
 *
 * @param deps - The filesystem + environment ports.
 * @param shell - The target shell (`bash` | `zsh` | `fish`).
 * @returns Which files were written and whether the loader block was newly added.
 * @throws {UsageError} If HOME is unset.
 */
export function installCompletion(
  deps: { readonly fs: FileSystem; readonly env: Environment },
  shell: Shell,
): InstallResult {
  const home = homeDir(deps.env);
  const { scriptPath, initFile } = shellPaths(shell, home);

  // 1. Write the completion script (omelette's pure generator output) through the port.
  deps.fs.write(scriptPath, generateScript(shell));

  // 2. Ensure the init file sources it, idempotently (the port has no append, so read-modify-write).
  const existing = deps.fs.exists(initFile) ? deps.fs.read(initFile) : "";
  const alreadyPresent = existing.includes(BLOCK_BEGIN);
  if (!alreadyPresent) {
    const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    deps.fs.write(initFile, `${existing}${separator}${loaderBlock(scriptPath)}`);
  }

  return { shell, scriptPath, initFile, added: !alreadyPresent };
}
