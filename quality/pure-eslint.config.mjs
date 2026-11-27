import tseslint from "typescript-eslint";

export const pureRules = {
  "no-restricted-globals": [
    "error",
    {
      globals: [
        "process",
        "console",
        "fetch",
        "Date",
        "setTimeout",
        "setInterval",
        "setImmediate",
        "queueMicrotask",
        "globalThis",
        "global",
        "require",
        "eval",
        "Function",
        "crypto",
        "performance",
        "Intl",
        "Atomics",
        "SharedArrayBuffer",
      ],
      checkGlobalObject: true,
    },
  ],
  "no-restricted-imports": [
    "error",
    {
      paths: [
        {
          name: "node:crypto",
          allowImportNames: ["createHash"],
          message: "Only deterministic hashing belongs in the pure core.",
        },
        {
          name: "crypto",
          allowImportNames: ["createHash"],
          message: "Only deterministic hashing belongs in the pure core.",
        },
      ],
    },
  ],
  "no-restricted-properties": [
    "error",
    { object: "Math", property: "random", message: "Inject randomness through a port." },
  ],
  "no-restricted-syntax": [
    "error",
    {
      selector: "Identifier[name='Math']:not(MemberExpression[computed=false] > Identifier.object)",
      message:
        "Math must be used directly through a deterministic member; do not pass or alias it.",
    },
    {
      selector: "MemberExpression[object.name='Math'][computed=true]",
      message: "Use explicit deterministic Math operations.",
    },
    {
      selector: "VariableDeclarator[init.name='Math']",
      message: "Do not alias ambient Math; use explicit deterministic operations.",
    },
    {
      selector: "CallExpression[callee.type='Import']",
      message: "Static dependency graph required in the pure core.",
    },
    { selector: "ImportExpression", message: "Static dependency graph required in the pure core." },
  ],
};

export default [
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs,mts,cts}"],
    languageOptions: { parser: tseslint.parser },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" },
    rules: pureRules,
  },
];
