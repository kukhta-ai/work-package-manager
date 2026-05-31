/**
 * The core's ports (doc 13 §3): the interfaces the pure core declares and the adapters implement. Pure —
 * these files import nothing effectful, so the import-boundary rule is trivially satisfied.
 *
 * The FileSystem port lands here first (task-12); BacklogMd, Clock, and Environment follow (tasks 14–15).
 */

export type { AliasResult, DirEntry, FileSystem } from "./filesystem.js";
