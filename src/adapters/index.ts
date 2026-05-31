/**
 * The driven adapters (doc 13 §1) — concrete implementations of the core's ports, living OUTSIDE the pure
 * core so they may use `node:fs` and other effectful modules. The composition root wires the real adapters;
 * tests wire the fakes.
 *
 * task-12 lands the FileSystem pair: {@link NodeFileSystem} (real) and {@link MemoryFileSystem} (in-memory
 * fake). The BacklogMd, Clock, and Environment adapters follow (tasks 14–15).
 */

export { MemoryFileSystem } from "./memory-fs.js";
export { NodeFileSystem } from "./node-fs.js";
