/**
 * How much consent a bundle step needs, decided by the author and respected at run time (doc 00
 * "Vocabulary"; doc 10 `bundle <id> meta`). `"safe"` proceeds with minimal ceremony; `"dangerous"` requires
 * explicit confirmation.
 */
export type ConfirmationLevel = "safe" | "dangerous";
