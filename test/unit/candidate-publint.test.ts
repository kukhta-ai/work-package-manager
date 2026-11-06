import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveNpmInvocation } from "../../distribution-preparation/prepare-package.js";
import { digest, prepareCandidateProducer, publintArchive } from "../../scripts/candidate.mjs";

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
describe("publint archive qualification", () => {
  it("lints actual tarball bytes without executing package prepack scripts or replacing the archive", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-publint-fixture-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "wpm-publint-fixture",
          version: "1.0.0",
          type: "module",
          bin: { wpm: "cli.js" },
          files: ["cli.js"],
          scripts: {
            prepack: "node -e \"require('node:fs').writeFileSync('prepack-ran', 'yes')\"",
          },
        }),
      );
      writeFileSync(join(root, "cli.js"), '#!/usr/bin/env node\nconsole.log("fixture");\n');
      chmodSync(join(root, "cli.js"), 0o755);
      const npm = resolveNpmInvocation();
      const packed = spawnSync(
        npm.executable,
        [...npm.argumentPrefix, "pack", "--ignore-scripts", "--silent", "--pack-destination", root],
        { cwd: root, encoding: "utf8", timeout: 30_000 },
      );
      expect(packed.status, packed.stderr).toBe(0);
      const archive = join(root, "wpm-publint-fixture-1.0.0.tgz");
      const before = digest(readFileSync(archive));
      expect(() => publintArchive(sourceRoot, archive)).not.toThrow();
      expect(digest(readFileSync(archive))).toBe(before);
      expect(existsSync(join(root, "prepack-ran"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("isolated exact-revision candidate producer", () => {
  function fixture(owned: string, requireLocalInput: boolean) {
    const root = join(owned, "source");
    mkdirSync(join(root, "fixture-sdk"), { recursive: true });
    writeFileSync(
      join(root, ".gitignore"),
      "node_modules/\ndist/\n.quality/\n.bmad/local/\n.omc/\n.remember/\n.serena/\n_bmad-output/\nconfig.user.toml\nbacklog/.locks/\nlocal-build-input\n",
    );
    writeFileSync(join(root, ".gitattributes"), "tracked-build-input export-ignore\n");
    writeFileSync(join(root, "tracked-build-input"), "committed-input");
    writeFileSync(join(root, "README.md"), "Producer fixture\n");
    writeFileSync(join(root, "LICENSE"), "Fixture MIT license\n");
    writeFileSync(
      join(root, "fixture-sdk/package.json"),
      JSON.stringify({ name: "fixture-sdk", version: "1.0.0", type: "module", main: "index.js" }),
    );
    writeFileSync(join(root, "fixture-sdk/index.js"), 'export const sdk = "locked-sdk";\n');
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "candidate-producer-fixture",
        version: "1.0.0",
        type: "module",
        license: "MIT",
        files: ["dist"],
        scripts: { clean: "node clean.mjs", prepack: "node build.mjs" },
        devDependencies: { "fixture-sdk": "file:fixture-sdk" },
      }),
    );
    writeFileSync(
      join(root, "clean.mjs"),
      'import {rmSync} from "node:fs"; rmSync("dist", {recursive:true,force:true});\n',
    );
    writeFileSync(
      join(root, "build.mjs"),
      [
        'import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";',
        'import {sdk} from "fixture-sdk";',
        requireLocalInput
          ? 'readFileSync("local-build-input");'
          : 'if(existsSync("local-build-input")) throw new Error("ignored input entered producer");',
        'mkdirSync("dist",{recursive:true});',
        'writeFileSync("dist/result.txt",readFileSync("tracked-build-input","utf8")+":"+sdk);',
      ].join("\n"),
    );
    const npm = resolveNpmInvocation();
    const locked = spawnSync(
      npm.executable,
      [
        ...npm.argumentPrefix,
        "install",
        "--package-lock-only",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
      ],
      { cwd: root, encoding: "utf8", timeout: 30_000 },
    );
    expect(locked.status, locked.stderr).toBe(0);
    const git = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    git("init", "--quiet");
    git("add", "--all");
    git(
      "-c",
      "user.name=WPM producer fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "producer fixture",
    );
    const revision = git("rev-parse", "HEAD");
    const lockDigest = digest(readFileSync(join(root, "package-lock.json")));
    const sentinels = [
      ".quality/report.json",
      ".bmad/local/state",
      ".omc/state",
      ".remember/state",
      ".serena/state",
      "_bmad-output/plan",
      "config.user.toml",
      "backlog/.locks/lock",
      "local-build-input",
      "dist/root-sentinel",
      "node_modules/root-sentinel",
    ];
    for (const path of sentinels) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), "preserve-local-bytes");
    }
    return { root, revision, lockDigest, sentinels };
  }

  function inspect(
    producer: ReturnType<typeof prepareCandidateProducer>,
    revision: string,
    output: string,
  ) {
    return spawnSync(
      process.execPath,
      [
        join(sourceRoot, "distribution-preparation/prepare-package.js"),
        "--revision",
        revision,
        "--output",
        output,
      ],
      {
        cwd: producer.root,
        env: producer.env,
        encoding: "utf8",
        timeout: 30_000,
      },
    );
  }

  it("packages exact committed inputs after quality state exists while preserving contributor files and root dist", () => {
    const owned = mkdtempSync(join(tmpdir(), "wpm-producer-state-"));
    try {
      const source = fixture(owned, false);
      const scratch = join(owned, "candidate");
      mkdirSync(scratch);
      const producer = prepareCandidateProducer(
        source.root,
        source.revision,
        source.lockDigest,
        scratch,
      );
      expect(readFileSync(join(producer.root, "tracked-build-input"), "utf8")).toBe(
        "committed-input",
      );
      expect(lstatSync(join(producer.root, "node_modules")).isSymbolicLink()).toBe(false);
      expect(realpathSync(join(producer.root, "node_modules/fixture-sdk"))).toBe(
        realpathSync(join(producer.root, "fixture-sdk")),
      );
      for (const path of source.sentinels)
        expect(existsSync(join(producer.root, path))).toBe(false);
      const packed = inspect(producer, source.revision, join(owned, "archive"));
      expect(packed.status, packed.stderr).toBe(0);
      expect(JSON.parse(packed.stdout) as unknown).toMatchObject({
        status: "accepted",
        sourceRevision: source.revision,
        sourceBinding: { clean: true, checkoutRevision: source.revision },
      });
      expect(readFileSync(join(producer.root, "dist/result.txt"), "utf8")).toBe(
        "committed-input:locked-sdk",
      );
      producer.assertUnchanged();
      for (const path of source.sentinels)
        expect(readFileSync(join(source.root, path), "utf8")).toBe("preserve-local-bytes");
      expect(digest(readFileSync(join(source.root, "package-lock.json")))).toBe(source.lockDigest);
    } finally {
      rmSync(owned, { recursive: true, force: true });
    }
  }, 30_000);

  it("fails a build that requires an ignored local input instead of importing it from the contributor checkout", () => {
    const owned = mkdtempSync(join(tmpdir(), "wpm-producer-hidden-input-"));
    try {
      const source = fixture(owned, true);
      const scratch = join(owned, "candidate");
      mkdirSync(scratch);
      const producer = prepareCandidateProducer(
        source.root,
        source.revision,
        source.lockDigest,
        scratch,
      );
      const packed = inspect(producer, source.revision, join(owned, "archive"));
      expect(packed.status).toBe(1);
      expect(packed.stderr).toContain("local-build-input");
      for (const path of source.sentinels)
        expect(readFileSync(join(source.root, path), "utf8")).toBe("preserve-local-bytes");
    } finally {
      rmSync(owned, { recursive: true, force: true });
    }
  }, 30_000);
});
