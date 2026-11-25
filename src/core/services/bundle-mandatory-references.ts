/**
 * Stable bundle references a template contribution may depend on regardless of command options.
 *
 * The advisor task is deliberately absent: it is conditional (`--no-advisor`) and therefore cannot be a
 * durable producer dependency even when one particular materialisation happens to include it.
 */
export const UNCONDITIONAL_BUNDLE_MANDATORY_REFERENCES = [
  "wpm:bundle:plan",
  "wpm:bundle:fill-install-backlog",
  "wpm:bundle:author-payload",
  "wpm:bundle:scaffold-payload-skill",
  "wpm:bundle:verify-step-slugs",
  "wpm:bundle:verify-dod",
  "wpm:bundle:verify-payload-references",
  "wpm:bundle:verify-skill-registration",
  "wpm:bundle:verify-version-constraints",
  "wpm:bundle:review-install-backlog-independence",
  "wpm:bundle:simulate-fresh-install",
] as const;
