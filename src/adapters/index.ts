/**
 * The driven adapters (doc 13 §1) — concrete implementations of the core's ports, living OUTSIDE the pure
 * core so they may use `node:fs` and other effectful modules. The composition root wires the real adapters;
 * tests wire the fakes.
 *
 * task-12 lands the FileSystem pair: {@link NodeFileSystem} (real) and {@link MemoryFileSystem} (in-memory
 * fake). task-14 lands the BacklogMd pair: {@link BacklogCli} (real) and {@link FakeBacklog} (fake). The
 * Clock and Environment adapters follow (task-15).
 */

export { BacklogCli } from "./backlog-cli.js";
export { FakeBacklog } from "./fake-backlog.js";
export { MemoryFileSystem } from "./memory-fs.js";
export { NodeFileSystem } from "./node-fs.js";
