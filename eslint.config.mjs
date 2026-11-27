import js from "@eslint/js";
import tseslint from "typescript-eslint";

const core = ["src/core/**/*.ts", "src/vnext/core/**/*.ts"];

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "**/node_modules/**",
      ".quality",
      ".quality/**",
      "groma/**",
      ".claude/**",
      ".bmad/**",
      "_bmad/**",
      "_bmad-output/**",
      "Skills-Results/**",
      ".remember/**",
      ".omc/**",
      ".serena/**",
      "test-results/**",
      "coverage/**",
    ],
  },
  {
    files: [
      "src/**/*.{ts,tsx,js,mjs,cjs,mts,cts}",
      "test/**/*.ts",
      "scripts/**/*.mjs",
      "distribution-preparation/**/*.js",
      "quality/**/*.mjs",
      "*.ts",
      "*.mjs",
      "*.cjs",
    ],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", minimumDescriptionLength: 12 },
      ],
    },
  },
  {
    files: core,
    rules: {
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
          ],
          checkGlobalObject: true,
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Inject randomness through a port." },
      ],
    },
  },
);
