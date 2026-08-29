import { execaSync } from "execa";
import { describe, expect, it } from "vitest";
import { BacklogCli } from "../../../src/adapters/backlog-cli.js";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import type { BacklogMd } from "../../../src/core/ports/backlog.js";
import { withTempDir } from "../../helpers/tmpdir.js";

function backlogAvailable(): boolean {
  try {
    execaSync("backlog", ["--version"], { stdout: "pipe", stderr: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const describeIfBacklog = backlogAvailable() ? describe : describe.skip;

/** Isolate Backlog.md's per-machine global state inside the tmpdir so concurrent runs can't collide. */
function isolatedEnv(dir: string): Record<string, string> {
  return {
    HOME: dir,
    XDG_CONFIG_HOME: dir,
    XDG_DATA_HOME: dir,
    XDG_STATE_HOME: dir,
    XDG_CACHE_HOME: dir,
  };
}

/**
 * Run the same create→edit→list sequence against any {@link BacklogMd} and return the resulting summaries,
 * so the real adapter and the fake can be compared for observable parity.
 */
function exercise(bl: BacklogMd, root: string) {
  bl.init(root, { taskPrefix: "authoring" });
  const a = bl.createTask(root, {
    title: "Alpha",
    acceptanceCriteria: ["x"],
    labels: ["kind:state"],
  });
  const b = bl.createTask(root, { title: "Beta", dependencies: [a.id] });
  bl.editTask(root, b.id, { status: "In Progress" });
  return {
    root: bl.inspectRoot(root),
    inventory: bl.inspectTaskInventory(root),
    created: [a, b],
    list: bl.listTasks(root).sort((x, y) => x.id.localeCompare(y.id)),
    records: [bl.readTask(root, a.id), bl.readTask(root, b.id)],
  };
}

describeIfBacklog("BacklogCli vs FakeBacklog parity", () => {
  it("the fake and the real adapter return the same TaskSummary shape for an equivalent sequence", async () => {
    await withTempDir((dir) => {
      const real = exercise(new BacklogCli("backlog", isolatedEnv(dir)), dir);
      const fake = exercise(new FakeBacklog(), "/virtual/.authoring-backlog");

      expect(real.root).toEqual(fake.root);
      // Same ids assigned (prefix + monotonic counter).
      expect(real.created.map((t) => t.id)).toEqual(fake.created.map((t) => t.id));
      // Same list shape: ids, titles, and statuses match.
      expect(real.list).toEqual(fake.list);
      expect(real.records).toEqual(fake.records);
    });
  });
});
