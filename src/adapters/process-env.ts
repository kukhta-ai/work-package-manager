import type { Environment } from "../core/ports/environment.js";

/**
 * The real {@link Environment} adapter, backed by Node's `process`. It lives under `src/adapters/`, outside
 * the pure core, so reading `process.cwd()` / `process.platform` / `process.env` here is correct. The
 * composition root wires this; tests use the fake-env fake.
 */
export class ProcessEnvironment implements Environment {
  /** @inheritdoc */
  cwd(): string {
    return process.cwd();
  }

  /** @inheritdoc */
  platform(): NodeJS.Platform {
    return process.platform;
  }

  /** @inheritdoc */
  getEnv(name: string): string | undefined {
    return process.env[name];
  }
}
