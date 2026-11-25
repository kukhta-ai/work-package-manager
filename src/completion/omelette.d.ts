/**
 * Minimal ambient types for `omelette` (0.4.17) — the package ships no `.d.ts` and there is no
 * `@types/omelette`. We declare ONLY the surface task-29 uses: the factory and the two PURE script-text
 * generators. The rest of omelette's API (`init`, `reply`, `setupShellInitFile`, …) calls `process.exit()` and
 * reads `process.argv`, so it is deliberately NOT exposed here — the completion plumbing uses the generators
 * for the script bytes and writes/installs through the FileSystem port instead (doc 12 §"Layered architecture":
 * shell completion script emission lives in the infra layer). See `src/util/completion-install.ts`.
 */
declare module "omelette" {
  /** The subset of an omelette instance we use: the two pure shell-script generators. */
  interface OmeletteInstance {
    /**
     * Generate the bash + zsh completion script (the `compdef`/`complete -F`/`compctl` branches). Pure: it
     * returns the script as a string and does NOT call `process.exit`.
     */
    generateCompletionCode(): string;
    /**
     * Generate the fish completion script (`complete -f -c <program>`). Pure: returns the script as a string
     * and does NOT call `process.exit`.
     */
    generateCompletionCodeFish(): string;
  }

  /**
   * The omelette factory. Pass a CLI template (e.g. `"wpm <command>"`). NOTE: at construction omelette inspects
   * `process.argv` for `--completion*` and may `process.exit` — so callers construct it with a plain template
   * (no `--completion*` in argv) and use only the generators above.
   *
   * @param template - The CLI template string (program name + fragments).
   * @returns The omelette instance.
   */
  function omelette(template: string): OmeletteInstance;

  export default omelette;
}
