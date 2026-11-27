import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NodeFileSystem } from "../../../src/adapters/node-fs.js";
import type { Environment } from "../../../src/core/ports/index.js";
import { installCompletion, type Shell } from "../../../src/util/completion-install.js";
import { withTempDir } from "../../helpers/tmpdir.js";

/**
 * Integration test for `completion install` against the REAL filesystem (doc 12 §"Testing: vitest" — "real
 * command sequences in a tmpdir"). It proves the bytes `installCompletion` emits (through the FileSystem port,
 * using omelette's pure script generators) actually land on disk: the completion script file is written and the
 * shell init file gains the loader block. Each case runs in its own tmpdir with a tmpdir-scoped HOME, so the
 * real `NodeFileSystem` writes never touch the developer's actual home or collide across files.
 *
 * Lives under `test/integration/**`, which the vitest config runs serially (`fileParallelism: false`).
 */

/** A minimal Environment whose HOME points at the tmpdir (the rest is unused by the installer). */
function envWithHome(home: string): Environment {
  return {
    cwd: () => home,
    platform: () => process.platform,
    getEnv: (name) => (name === "HOME" ? home : undefined),
  };
}

describe("completion install — real filesystem (tmpdir)", () => {
  it.each<Shell>([
    "bash",
    "zsh",
    "fish",
  ])("writes a real completion script + loader block to a tmpdir HOME for %s", async (shell) => {
    await withTempDir((home) => {
      const fs = new NodeFileSystem();
      const result = installCompletion({ fs, env: envWithHome(home) }, shell);

      // The completion script really exists on disk and is non-trivial + shell-correct:
      expect(existsSync(result.scriptPath)).toBe(true);
      const script = readFileSync(result.scriptPath, "utf8");
      expect(script.length).toBeGreaterThan(50);
      if (shell === "fish") {
        expect(script).toContain("complete -f -c wpm");
      } else {
        expect(script).toMatch(/complete -F|compdef/);
      }

      // The init file really exists and sources the script (the delimited block is present):
      expect(existsSync(result.initFile)).toBe(true);
      const initContent = readFileSync(result.initFile, "utf8");
      expect(initContent).toContain("begin wpm completion");
      expect(initContent).toContain(result.scriptPath);
      expect(result.added).toBe(true);

      // Re-install is idempotent on the real fs: the block is not duplicated.
      installCompletion({ fs, env: envWithHome(home) }, shell);
      const after = readFileSync(result.initFile, "utf8");
      expect(after.split("begin wpm completion").length - 1).toBe(1);
    });
  });

  it("the bash completion script lands under ~/.wpm/ within the tmpdir HOME", async () => {
    await withTempDir((home) => {
      const fs = new NodeFileSystem();
      const result = installCompletion({ fs, env: envWithHome(home) }, "bash");
      expect(result.scriptPath).toBe(join(home, ".wpm", "completion.sh"));
      expect(result.initFile).toBe(join(home, ".bashrc"));
    });
  });
});
