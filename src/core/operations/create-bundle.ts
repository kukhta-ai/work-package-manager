import type { MandatoryAuthoringTask } from "../model/index.js";
import { advisorContentTaskTitle } from "./advisor.js";

/**
 * The per-bundle authoring tasks `bundle new <id>` materialises (doc 11 §3 "Materialised by `wpm bundle new
 * <id>`"). Titles carry `<id>`; the acceptance criteria are the free-text criteria from doc 11 §3 verbatim (the
 * agent self-attests against them — they are not machine-evaluated). With the auto-advisor on this is the full
 * 12-task set; `--no-advisor` (`opts.advisor === false`) omits the "Write advisor content" task → 11.
 * Materialisation is title-idempotent (the harness's ⑤), so a re-invocation never duplicates.
 *
 * @param id - The bundle id to substitute into each title.
 * @param opts - `advisor`: whether to include the "Write advisor content" task.
 * @returns The authoring-task specs, in natural reading order (plan → fill → payload → skill → advisor →
 *   verify/review/simulate).
 */
export function perBundleAuthoringTaskCatalog(
  id: string,
  opts: { readonly advisor: boolean },
): MandatoryAuthoringTask[] {
  const tasks: MandatoryAuthoringTask[] = [
    {
      reference: "wpm:bundle:plan",
      title: `Plan bundle ${id}`,
      acceptanceCriteria: [
        `bundles/${id}/bundle.yml has summary, version, confirmation-level set; the requires map declares any inter-bundle dependencies`,
      ],
    },
    {
      reference: "wpm:bundle:fill-install-backlog",
      title: `Fill install-backlog for ${id}`,
      acceptanceCriteria: [
        `at least one kind:state task with a step:<slug> label exists; DoD is configured in install-backlog/config.yml; the detect/setup/verify trio is present`,
      ],
    },
    {
      reference: "wpm:bundle:author-payload",
      title: `Author payload for ${id}`,
      acceptanceCriteria: [
        `payload/files/ and payload/templates/ are populated for whatever the install-backlog tasks reference via --ref`,
      ],
    },
    {
      reference: "wpm:bundle:scaffold-payload-skill",
      title: `Scaffold payload skill for ${id}`,
      acceptanceCriteria: [
        `if the bundle delivers a runtime agent skill, at least one is registered via bundle ${id} skills add <name>; if the bundle delivers no runtime skill, the agent closes this with a note to that effect`,
      ],
    },
  ];

  if (opts.advisor) {
    tasks.push({
      reference: "wpm:bundle:write-advisor-content",
      // The title is sourced from `advisorContentTaskTitle` (advisor.ts) so `bundle new`/`enable` and
      // `bundle <id> advisor add`/`remove` all materialise/archive the IDENTICAL title (doc 11 idempotency-by-title).
      title: advisorContentTaskTitle(id),
      acceptanceCriteria: [
        `installer-skills/${id}-advisor/SKILL.md has a real trigger description (firing on the user's need) and a recommendation body, replacing the template-rendered placeholder`,
      ],
    });
  }

  tasks.push(
    {
      reference: "wpm:bundle:verify-step-slugs",
      title: `Verify step slug uniqueness for ${id}`,
      acceptanceCriteria: [
        `every step:<slug> label across bundles/${id}/install-backlog/tasks/ and archive/ is unique; no archived task's slug collides with an active one`,
      ],
    },
    {
      reference: "wpm:bundle:verify-dod",
      title: `Verify DoD compliance for ${id}`,
      acceptanceCriteria: [
        `every task in the bundle carries the DoD items declared in bundles/${id}/install-backlog/config.yml.dod`,
      ],
    },
    {
      reference: "wpm:bundle:verify-payload-references",
      title: `Verify payload references for ${id}`,
      acceptanceCriteria: [
        `every --ref <path> value in the bundle's tasks corresponds to a file registered under bundle ${id} files or bundle ${id} templates`,
      ],
    },
    {
      reference: "wpm:bundle:verify-skill-registration",
      title: `Verify skill registration for ${id}`,
      acceptanceCriteria: [
        `every payload skill registered via bundle ${id} skills add and every install-time skill registered via bundle ${id} installer-skills add has its SKILL.md present at the expected path with valid frontmatter; the advisor (unless opted out) has been filled past its placeholder`,
      ],
    },
    {
      reference: "wpm:bundle:verify-version-constraints",
      title: `Verify version constraints for ${id}`,
      acceptanceCriteria: [
        `every entry in bundles/${id}/bundle.yml.requires resolves against the depended-upon bundle's declared version`,
      ],
    },
    {
      reference: "wpm:bundle:review-install-backlog-independence",
      title: `Review install-backlog independence for ${id}`,
      acceptanceCriteria: [
        `no hard-coded IDs from other bundles appear in this bundle's tasks; no undeclared host-environment assumptions`,
      ],
    },
    {
      reference: "wpm:bundle:simulate-fresh-install",
      title: `Simulate fresh-install executor for ${id}`,
      acceptanceCriteria: [
        `agent walks bundles/${id}/install-backlog/tasks/ as a context-less executor would, in dependency order, documenting any task whose AC would be ambiguous, whose --ref would resolve to nothing, or whose preconditions aren't established by earlier tasks`,
      ],
    },
  );

  return tasks;
}
