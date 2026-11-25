import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BacklogCli } from "../../../src/adapters/backlog-cli.js";
import * as shell from "../../../src/util/shell.js";

afterEach(() => vi.restoreAllMocks());
describe("native JSON dependency boundary", () => {
  it.each(["\n", "\r\n"])("reads exact direct dependencies with %j line endings", (newline) => {
    const root = resolve("/project");
    const text = [
      "Task OPERATION-2 - Review",
      "Status: To Do",
      "Ordinal: 2000",
      "",
      "Dependency Graph:",
      "---",
      "Depends on (1 direct, 2 total):",
      "└─ OPERATION-1 - Brief [To Do]",
      "",
      "Description:",
      "---",
      "Review the brief",
      "",
      "Acceptance Criteria:",
      "---",
      "- [ ] #1 Every claim checked",
    ].join(newline);
    const run = vi
      .spyOn(shell, "runSync")
      .mockReturnValueOnce({ stdout: text, stderr: "", exitCode: 0 })
      .mockReturnValueOnce({
        stdout: JSON.stringify({
          schemaVersion: 1,
          kind: "task-view",
          task: { id: "OPERATION-2", dependencies: ["OPERATION-1"] },
        }),
        stderr: "",
        exitCode: 0,
      });
    expect(new BacklogCli().readTask(root, "operation-2").dependencies).toEqual(["operation-1"]);
    expect(run).toHaveBeenLastCalledWith("backlog", ["task", "view", "operation-2", "--json"], {
      cwd: root,
      env: { BACKLOG_CWD: root },
    });
  });
  it("rejects mismatched native JSON identities", () => {
    vi.spyOn(shell, "runSync")
      .mockReturnValueOnce({
        stdout: "Task OPERATION-2 - Review\nOrdinal: 2000\nDependency Graph:\n---\n",
        stderr: "",
        exitCode: 0,
      })
      .mockReturnValueOnce({
        stdout: JSON.stringify({
          schemaVersion: 1,
          kind: "task-view",
          task: { id: "OPERATION-1", dependencies: [] },
        }),
        stderr: "",
        exitCode: 0,
      });
    expect(() => new BacklogCli().readTask("/project", "operation-2")).toThrow(
      "invalid native task dependency JSON",
    );
  });
  it("resolves decorated titles in one bulk call and preserves authored suffix text", () => {
    const run = vi
      .spyOn(shell, "runSync")
      .mockReturnValueOnce({
        stdout:
          "To Do:\n  OPERATION-1 - Brief (ac: 0/1)\n  OPERATION-2 - Authored (ac: 0/1) (ac: 0/2)\n",
        stderr: "",
        exitCode: 0,
      })
      .mockReturnValueOnce({
        stdout: JSON.stringify({
          schemaVersion: 1,
          kind: "task-list",
          tasks: [
            { id: "OPERATION-1", title: "Brief" },
            { id: "OPERATION-2", title: "Authored (ac: 0/1)" },
          ],
        }),
        stderr: "",
        exitCode: 0,
      });
    expect(new BacklogCli().listTasks("/project")).toEqual([
      { id: "operation-1", title: "Brief", status: "To Do" },
      { id: "operation-2", title: "Authored (ac: 0/1)", status: "To Do" },
    ]);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
