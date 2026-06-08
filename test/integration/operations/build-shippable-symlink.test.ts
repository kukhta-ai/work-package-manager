import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NodeFileSystem } from "../../../src/adapters/node-fs.js";
import { shippableFiles } from "../../../src/core/operations/build.js";
import { withTempDir } from "../../helpers/tmpdir.js";

/**
 * Integration test for `shippableFiles` over a REAL relative symlink (TASK-102). The pure enumeration's
 * "do not traverse a symlinked directory" branch needs a genuine symlink to exercise — the in-memory fake has
 * no symlink-dir distinction (a recorded alias is invisible to `list`) — so this drives the real
 * {@link NodeFileSystem} against a real tmpdir, the way `build` runs in production.
 *
 * It proves the per-bundle `backlog → install-backlog` alias is recorded as a LEAF (the link path itself) and
 * never walked, so `install-backlog/**` is enumerated exactly once and is not duplicated through `backlog/`.
 */
describe("shippableFiles — the per-bundle `backlog → install-backlog` alias is a non-traversed leaf (TASK-102)", () => {
  it("records `bundles/<id>/backlog` once as a leaf and `install-backlog/**` once (no double-include)", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();

      // A minimal shippable bundle tree: manifest + one enabled bundle whose recipe lives under install-backlog,
      // plus the per-bundle `backlog → install-backlog` RELATIVE symlink wpm ships.
      fs.write(
        join(dir, "manifest.yml"),
        "project:\n  name: demo\n  version: 1.0.0\nbundles:\n  - web\n",
      );
      const bundle = join(dir, "bundles", "web");
      fs.write(join(bundle, "bundle.yml"), "id: web\nversion: 0.1.0\n");
      fs.write(join(bundle, "install-backlog", "config.yml"), "task_prefix: web\n");
      fs.write(join(bundle, "install-backlog", "tasks", "web-1.md"), "# detect\n");
      fs.ensureAlias("install-backlog", join(bundle, "backlog")); // relative symlink → real on POSIX

      const ship = shippableFiles(fs, dir, ["web"]);

      // The link is recorded ONCE, as a leaf (the link path itself — never traversed):
      expect(ship.filter((p) => p === "bundles/web/backlog")).toEqual(["bundles/web/backlog"]);
      // The real recipe files appear EXACTLY once each (enumerated via install-backlog/, not via backlog/):
      expect(ship.filter((p) => p === "bundles/web/install-backlog/config.yml")).toHaveLength(1);
      expect(ship.filter((p) => p === "bundles/web/install-backlog/tasks/web-1.md")).toHaveLength(
        1,
      );
      // CRUCIALLY: nothing is enumerated THROUGH the link (no `bundles/web/backlog/<file>` doubling), which is
      // exactly what would happen if the walk recursed into the symlink:
      expect(ship.some((p) => p.startsWith("bundles/web/backlog/"))).toBe(false);
    });
  });

  it("records a real `bundles/<id>/backlog` DIRECTORY (the Windows copy-fallback shape) as a leaf — no double-include", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      // On Windows the alias is a COPY: `backlog` is a real directory mirroring install-backlog. The walk must
      // still record it as a leaf (the isSymlinkDir path-match), NOT recurse into it, so install-backlog/** is
      // not duplicated through `backlog/`.
      fs.write(
        join(dir, "manifest.yml"),
        "project:\n  name: demo\n  version: 1.0.0\nbundles:\n  - web\n",
      );
      const bundle = join(dir, "bundles", "web");
      fs.write(join(bundle, "bundle.yml"), "id: web\nversion: 0.1.0\n");
      fs.write(join(bundle, "install-backlog", "config.yml"), "task_prefix: web\n");
      // A real copied `backlog/` directory (NOT a symlink) — the win32 fallback shape.
      fs.write(join(bundle, "backlog", "config.yml"), "task_prefix: web\n");

      const ship = shippableFiles(fs, dir, ["web"]);

      // `backlog` is recorded once as a leaf, and its copied contents are NOT enumerated (no double-include):
      expect(ship.filter((p) => p === "bundles/web/backlog")).toEqual(["bundles/web/backlog"]);
      expect(ship.some((p) => p.startsWith("bundles/web/backlog/"))).toBe(false);
      expect(ship.filter((p) => p === "bundles/web/install-backlog/config.yml")).toHaveLength(1);
    });
  });
});
