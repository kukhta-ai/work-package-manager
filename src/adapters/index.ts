/**
 * The driven adapters (doc 13 §1) — concrete implementations of the core's ports, living OUTSIDE the pure
 * core so they may use `node:fs` and other effectful modules. The composition root wires the real adapters;
 * tests wire the fakes.
 *
 * task-12 lands the FileSystem pair: {@link NodeFileSystem} (real) and {@link MemoryFileSystem} (in-memory
 * fake). task-14 lands the BacklogMd pair: {@link BacklogCli} (real) and {@link FakeBacklog} (fake). task-15
 * lands the Clock pair ({@link SystemClock} / {@link FixedClock}) and the Environment pair
 * ({@link ProcessEnvironment} / {@link FakeEnvironment}) — completing the four ports' adapters.
 */

export { BacklogCli } from "./backlog-cli.js";
export { FakeBacklog } from "./fake-backlog.js";
export { FakeEnvironment, type FakeEnvironmentState } from "./fake-env.js";
export { FixedClock, type FixedTime } from "./fixed-clock.js";
export { MemoryFileSystem } from "./memory-fs.js";
export { NodeFileSystem } from "./node-fs.js";
export { ProcessEnvironment } from "./process-env.js";
export { SystemClock } from "./system-clock.js";
