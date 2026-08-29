import type { Environment } from "../core/ports/environment.js";

/** The initial state for a {@link FakeEnvironment}; every field is optional and defaulted. */
export interface FakeEnvironmentState {
  /** The working directory (default `"/"`). */
  readonly cwd?: string;
  /** The platform (default `"linux"`). */
  readonly platform?: NodeJS.Platform;
  /** The environment-variable map (default empty). */
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * An {@link Environment} fake with settable cwd, platform, and environment variables, for deterministic
 * tests (AC#2): a test pins all three and exercises the core against fixed values. Pure: no `process`, no
 * I/O.
 */
export class FakeEnvironment implements Environment {
  private workingDir: string;
  private currentPlatform: NodeJS.Platform;
  private readonly vars: Map<string, string>;

  /**
   * @param state - Optional initial cwd / platform / env (each defaulted: `"/"`, `"linux"`, empty).
   */
  constructor(state: FakeEnvironmentState = {}) {
    this.workingDir = state.cwd ?? "/";
    this.currentPlatform = state.platform ?? "linux";
    this.vars = new Map(Object.entries(state.env ?? {}));
  }

  /** @inheritdoc */
  cwd(): string {
    return this.workingDir;
  }

  /** @inheritdoc */
  platform(): NodeJS.Platform {
    return this.currentPlatform;
  }

  /** @inheritdoc */
  getEnv(name: string): string | undefined {
    return this.vars.get(name);
  }

  /**
   * Pin the working directory.
   *
   * @param dir - The new working directory.
   */
  setCwd(dir: string): void {
    this.workingDir = dir;
  }

  /**
   * Pin the platform.
   *
   * @param platform - The new platform.
   */
  setPlatform(platform: NodeJS.Platform): void {
    this.currentPlatform = platform;
  }

  /**
   * Set an environment variable.
   *
   * @param name - The variable name.
   * @param value - The value.
   */
  setEnv(name: string, value: string): void {
    this.vars.set(name, value);
  }

  /**
   * Unset an environment variable (so {@link getEnv} returns `undefined` for it).
   *
   * @param name - The variable name.
   */
  deleteEnv(name: string): void {
    this.vars.delete(name);
  }
}
