import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

/** @typedef {(command:string, args:string[], env:NodeJS.ProcessEnv)=>string} Runner */
/** Confirm ownership beneath the explicitly configured tool root; inner directories must not be symlinks.
 * @param {string} boundary @param {string} directory
 */
function ownedDirectory(boundary, directory) {
  const realBoundary = realpathSync(boundary);
  const delta = relative(resolve(boundary), resolve(directory));
  if (delta === ".." || delta.startsWith(`..${sep}`) || isAbsolute(delta))
    throw new Error("Python environment escapes its owned tool root");
  let current = realBoundary;
  for (const part of delta.split(sep).filter(Boolean)) {
    current = resolve(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink() || (stat !== undefined && !stat.isDirectory()))
      throw new Error("Python environment has a symbolic or non-directory ancestor");
    if (stat === undefined) mkdirSync(current);
  }
}
/** Replace the owned environment from verified wheel archives. Matching installed versions and unpacked caches are never authority.
 * @param {{boundary:string,destination:string,lockfile:string,pythonVersion:string,wheelhouse?:string,env:NodeJS.ProcessEnv,run:Runner}} input
 */
export function provisionFreshPython(input) {
  if (!/^\d+\.\d+\.\d+$/.test(input.pythonVersion))
    throw new Error("Python runtime needs an exact version");
  ownedDirectory(input.boundary, dirname(input.destination));
  const stat = lstatSync(input.destination, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink() || (stat !== undefined && !stat.isDirectory()))
    throw new Error("Owned Python environment must be an ordinary directory");
  const backupRoot = mkdtempSync(resolve(dirname(input.destination), ".python-retired-"));
  const backup = resolve(backupRoot, "environment");
  if (stat) renameSync(input.destination, backup);
  try {
    input.run(
      "uv",
      [
        "venv",
        "--no-project",
        "--managed-python",
        "--python",
        input.pythonVersion,
        input.destination,
      ],
      input.env,
    );
    input.run(
      "uv",
      [
        "pip",
        "sync",
        "--no-cache",
        "--require-hashes",
        "--strict",
        "--no-build",
        "--python",
        resolve(input.destination, "bin/python"),
        ...(input.wheelhouse ? ["--no-index", "--find-links", input.wheelhouse] : []),
        input.lockfile,
      ],
      input.env,
    );
  } catch (error) {
    rmSync(input.destination, { recursive: true, force: true });
    if (stat) renameSync(backup, input.destination);
    throw new Error(
      "Fresh Python provisioning failed; prior environment is retained without new authority",
      { cause: error },
    );
  } finally {
    rmSync(backupRoot, { recursive: true, force: true });
  }
}

const wheelBuilder = `
import base64,csv,hashlib,io,sys,zipfile
files={'railfixture/__init__.py':b'VALUE="clean"\\n','wpm_quality_fixture-1.0.0.dist-info/METADATA':b'Metadata-Version: 2.1\\nName: wpm-quality-fixture\\nVersion: 1.0.0\\n','wpm_quality_fixture-1.0.0.dist-info/WHEEL':b'Wheel-Version: 1.0\\nGenerator: wpm-quality-test\\nRoot-Is-Purelib: true\\nTag: py3-none-any\\n'}
rows=[]
for path,data in files.items():rows.append((path,'sha256='+base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip('='),str(len(data))))
record='wpm_quality_fixture-1.0.0.dist-info/RECORD';rows.append((record,'',''))
text=io.StringIO();csv.writer(text).writerows(rows);files[record]=text.getvalue().encode()
with zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED) as wheel:
 for path,data in files.items():wheel.writestr(path,data)
`;
/** Exercise real uv with a tiny hashlocked wheel, same-version tampering, and a corrupted source archive.
 * @param {{boundary:string,python:string,pythonVersion:string,env:NodeJS.ProcessEnv,run:Runner}} input
 */
export function qualifyFreshPython(input) {
  ownedDirectory(input.boundary, resolve(input.boundary, "tmp"));
  const root = mkdtempSync(resolve(input.boundary, "tmp/python-qualification-"));
  try {
    const wheels = resolve(root, "wheels");
    mkdirSync(wheels);
    const wheel = resolve(wheels, "wpm_quality_fixture-1.0.0-py3-none-any.whl");
    input.run(input.python, ["-I", "-S", "-B", "-c", wheelBuilder, wheel], input.env);
    const lockfile = resolve(root, "fixture.lock");
    writeFileSync(
      lockfile,
      `wpm-quality-fixture==1.0.0 --hash=sha256:${createHash("sha256").update(readFileSync(wheel)).digest("hex")}\n`,
    );
    const destination = resolve(root, "python");
    const provision = () =>
      provisionFreshPython({
        boundary: input.boundary,
        destination,
        lockfile,
        pythonVersion: input.pythonVersion,
        wheelhouse: wheels,
        env: input.env,
        run: input.run,
      });
    const observed = () =>
      input
        .run(
          resolve(destination, "bin/python"),
          ["-I", "-B", "-c", "import railfixture; print(railfixture.VALUE)"],
          input.env,
        )
        .trim();
    provision();
    if (observed() !== "clean") throw new Error("Fresh Python source fixture did not install");
    const siteVersion = input.pythonVersion.split(".").slice(0, 2).join(".");
    writeFileSync(
      resolve(destination, `lib/python${siteVersion}/site-packages/railfixture/__init__.py`),
      'VALUE="tampered"\n',
    );
    if (observed() !== "tampered")
      throw new Error("Python tamper fixture did not change installed bytes");
    provision();
    if (observed() !== "clean")
      throw new Error("Same-version installed library tampering was preserved");
    writeFileSync(wheel, "corrupt source wheel");
    let rejected = false;
    try {
      provision();
    } catch (error) {
      rejected =
        error instanceof Error &&
        error.cause instanceof Error &&
        /hash|wheel|zip/i.test(error.cause.message);
    }
    if (!rejected) throw new Error("Python provisioning accepted an archive outside the hash lock");
    return { sameVersionTamperRepaired: true, corruptWheelRejected: true };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
