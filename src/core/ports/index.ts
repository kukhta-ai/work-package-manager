/**
 * The core's ports (doc 13 §3): the interfaces the pure core declares and the adapters implement. Pure —
 * these files import nothing effectful, so the import-boundary rule is trivially satisfied.
 *
 * The FileSystem port lands first (task-12); BacklogMd next (task-14); Clock and Environment complete the
 * four ports (task-15).
 */

export type {
  BacklogAvailability,
  BacklogMd,
  BacklogRootInspection,
  BacklogTaskInventory,
  CreateTaskInput,
  EditTaskChanges,
  InitOptions,
  ListFilter,
  TaskId,
  TaskRecord,
  TaskStatus,
  TaskSummary,
} from "./backlog.js";
export type { Clock } from "./clock.js";
export type { Environment } from "./environment.js";
export type {
  AliasResult,
  ConfinedQuarantine,
  DigestedText,
  DirEntry,
  FileSystem,
  PathInspection,
} from "./filesystem.js";
