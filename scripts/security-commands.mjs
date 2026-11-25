/** Mandatory scanner arguments shared by production scans and their real negative qualification.
 * @param {{rules:string, output:string, targets:readonly string[]}} input
 */
export function semgrepSourceArguments(input) {
  return [
    "scan",
    "--config",
    input.rules,
    "--error",
    "--strict",
    "--metrics",
    "off",
    "--disable-version-check",
    "--disable-nosem",
    "--no-git-ignore",
    "--json",
    "--output",
    input.output,
    ...input.targets,
  ];
}

/** @param {{config:string, ignore:string, output:string}} input */
export function gitleaksSourceArguments(input) {
  return [
    "dir",
    ".",
    "--config",
    input.config,
    "--gitleaks-ignore-path",
    input.ignore,
    "--ignore-gitleaks-allow",
    "--redact",
    "--no-banner",
    "--report-format",
    "json",
    "--report-path",
    input.output,
  ];
}

/** The fixture uses its curated local DB; production refreshes and records the downloaded DB.
 * @param {{config:string, database:string, output:string, downloadDatabase:boolean}} input
 */
export function osvSourceArguments(input) {
  return [
    "scan",
    "source",
    ...(input.downloadDatabase
      ? ["--offline-vulnerabilities", "--download-offline-databases"]
      : ["--offline"]),
    "--local-db-path",
    input.database,
    "--no-resolve",
    "--lockfile",
    "package-lock.json",
    "--config",
    input.config,
    "--all-packages",
    "--format",
    "json",
    "--output-file",
    input.output,
  ];
}
