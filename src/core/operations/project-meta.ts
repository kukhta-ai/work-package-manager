import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import type { Project } from "../model/index.js";
import type { ApplyContext, ApplyOutcome, OperationSpec } from "./lifecycle.js";

/**
 * `project meta` (doc 10 row 141), a mutation that edits the project-level descriptive metadata in
 * `manifest.yml`'s `project:` mapping (`--name` / `--description` / `--license` / `--repository` / `--author`).
 * The **project-scoped twin of `bundle <id> meta`** (`bundle-meta.ts`): both update only the PROVIDED fields in
 * place through the task-13 comment-preserving {@link editYaml} `Document.setIn`, so omitted flags leave their
 * fields byte-untouched (AC38#1) and existing comments + key order are preserved (AC38#2). The difference is
 * scope: this edits `manifest.yml`'s `project:` map (project-bound, no `<id>`), where `bundle <id> meta` edits a
 * bundle's `bundle.yml`.
 *
 * It rides the task-25 `runMutation` six-beat lifecycle, so ④ RERENDER re-derives the auto-managed artefacts
 * around it automatically — a changed `--name` flows to the `<project>-installer/SKILL.md` orchestrator and the
 * scope aliases (which carry `{{project-name}}`, doc 10 line 34). The deliverable's executor front door is
 * author-owned (`_AGENTS.md`, doc 10/12) and is **excluded** from the re-render — the author keeps it current.
 * It does NOT materialise authoring tasks (editing
 * project metadata queues no work), exactly as `version.ts` set/bump and `bundle-meta.ts` omit it.
 *
 * **No model/schema change**: {@link "../model/manifest.js".ProjectMeta} already declares all five fields and the
 * manifest schema already round-trips them; this operation only WRITES them. The no-flag case (AC38#3, an exit-0
 * no-op that changes nothing) is handled in the CLI shell BEFORE this operation is invoked — so the spec is only
 * ever called with at least one provided field and never has to handle the empty input.
 *
 * **Pure over the FileSystem port** (doc 13 §1): imports only `node:path`, the yaml leaf, the model type, and the
 * lifecycle types — never `node:fs`/`commander`/`execa`. The manifest read/write goes through the injected fs
 * port the harness hands the operation on {@link ApplyContext}.
 */

/** The project manifest filename at the root. */
const MANIFEST_FILE = "manifest.yml";

/**
 * The input to {@link editProjectMetaSpec}: only the PROVIDED metadata fields. Each is optional and updated only
 * when present (omitted ones are left unchanged — AC38#1). Every field is a free string (a name / one-line
 * description / SPDX license id / repository URL / author), validated by neither the CLI nor the spec.
 */
export interface EditProjectMetaInput {
  /** When present, the new project name (sets `manifest.yml` `project.name`; also drives the ④ RERENDER). */
  readonly name?: string;
  /** When present, the new one-line description (sets `project.description`). */
  readonly description?: string;
  /** When present, the new SPDX license identifier (sets `project.license`). */
  readonly license?: string;
  /** When present, the new repository URL (sets `project.repository`). */
  readonly repository?: string;
  /** When present, the new author (sets `project.author`). */
  readonly author?: string;
}

/**
 * Build the `project meta` {@link OperationSpec} (doc 10 row 141). ③ APPLY updates only the provided `project:`
 * fields in `manifest.yml` comment-and-key-order-preservingly via {@link editYaml} `setIn`; ④ RERENDER (the
 * harness) re-renders the auto-managed artefacts, so a changed `--name` reaches the installer SKILL.md and the
 * scope aliases (the executor front door is author-owned `_AGENTS.md`, excluded from the re-render; doc 10/12).
 * No `check` (the fields are free strings — no bad value is possible; the
 * leaf already guarded the no-flag case) and no `materialise`.
 *
 * @returns The operation spec.
 */
export function editProjectMetaSpec(): OperationSpec<EditProjectMetaInput> {
  return {
    summary: () => "updated project metadata",

    /** ③ APPLY — update only the provided fields in `manifest.yml`'s `project:` map, in place (comments + order preserved). */
    apply: ({ fs, root }: ApplyContext, _project: Project, input): ApplyOutcome => {
      const manifestPath = join(root, MANIFEST_FILE);
      const next = editYaml(fs.read(manifestPath), (doc) => {
        if (input.name !== undefined) {
          doc.setIn(["project", "name"], input.name);
        }
        if (input.description !== undefined) {
          doc.setIn(["project", "description"], input.description);
        }
        if (input.license !== undefined) {
          doc.setIn(["project", "license"], input.license);
        }
        if (input.repository !== undefined) {
          doc.setIn(["project", "repository"], input.repository);
        }
        if (input.author !== undefined) {
          doc.setIn(["project", "author"], input.author);
        }
      });
      fs.write(manifestPath, next);
      return { changedPaths: [manifestPath] };
    },
  };
}
