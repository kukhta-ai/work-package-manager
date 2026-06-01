import { execaSync } from "execa";
import { describe, expect, it } from "vitest";
import { BacklogCli } from "../../../src/adapters/backlog-cli.js";
import { materialiseAuthoringTasks } from "../../../src/core/services/materialisation.js";
import { withTempDir } from "../../helpers/tmpdir.js";

/**
 * Acceptance/integration test for the materialisation service: the materialise -> re-run idempotency round
 * through the REAL `backlog` CLI, proving the title-idempotency holds against the actual Backlog.md tool the
 * operation will use (not only the fake). Each `backlog` invocation's per-machine global state (HOME / XDG)
 * is isolated inside the test's tmpdir so concurrent runs cannot collide (the task-14 fix); the integration
 * project also runs serially.
 */

function backlogAvailable(): boolean {
  try {
    execaSync("backlog", ["--version"], { stdout: "pipe", stderr: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const describeIfBacklog = backlogAvailable() ? describe : describe.skip;

/** Isolate Backlog.md's per-machine global state inside the tmpdir. */
function isolatedEnv(dir: string): Record<string, string> {
  return {
    HOME: dir,
    XDG_CONFIG_HOME: dir,
    XDG_DATA_HOME: dir,
    XDG_STATE_HOME: dir,
    XDG_CACHE_HOME: dir,
  };
}

describeIfBacklog("materialisation — real Backlog.md round-trip (AC#1, AC#2)", () => {
  it("materialises new specs, and a second identical run creates no duplicates", async () => {
    await withTempDir((dir) => {
      const backlog = new BacklogCli("backlog", isolatedEnv(dir));
      backlog.init(dir, { taskPrefix: "authoring" });

      const specs = [
        { title: "Plan bundle web-handoff", acceptanceCriteria: ["Covers detect/setup/verify."] },
        { title: "Fill bundle web-handoff", acceptanceCriteria: ["Payload files referenced."] },
        {
          title: "Write advisor content for web-handoff",
          acceptanceCriteria: ["Recommends by name."],
        },
      ];

      // First run: all three created, and the real backlog lists three tasks.
      const first = materialiseAuthoringTasks(backlog, dir, specs);
      expect(first.created).toHaveLength(3);
      expect(first.skipped).toEqual([]);
      expect(backlog.listTasks(dir)).toHaveLength(3);

      // Second identical run: nothing created, all skipped, and NO duplicates in the real backlog.
      const second = materialiseAuthoringTasks(backlog, dir, specs);
      expect(second.created).toEqual([]);
      expect(second.skipped).toHaveLength(3);
      expect(backlog.listTasks(dir)).toHaveLength(3);
    });
  });

  it("a partial overlap creates only the genuinely-new specs in the real backlog", async () => {
    await withTempDir((dir) => {
      const backlog = new BacklogCli("backlog", isolatedEnv(dir));
      backlog.init(dir, { taskPrefix: "authoring" });
      backlog.createTask(dir, { title: "Plan bundle core" });

      const result = materialiseAuthoringTasks(backlog, dir, [
        { title: "Plan bundle core", acceptanceCriteria: [] }, // already exists
        { title: "Fill bundle core", acceptanceCriteria: [] }, // new
      ]);
      expect(result.created.map((t) => t.title)).toEqual(["Fill bundle core"]);
      expect(result.skipped).toEqual(["Plan bundle core"]);
      expect(backlog.listTasks(dir)).toHaveLength(2);
    });
  });
});
