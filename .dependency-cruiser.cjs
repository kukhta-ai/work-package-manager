module.exports = {
  forbidden: [
    {
      name: "outbound-adapters-not-shell-or-use-cases",
      severity: "error",
      from: { path: "^src/(adapters|vnext/adapters)/" },
      to: { path: "^src/(cli\\.ts|vnext/cli\\.ts|core/operations/)" },
    },
    { name: "no-unresolved", severity: "error", from: {}, to: { couldNotResolve: true } },
    { name: "no-cycles", severity: "error", from: {}, to: { circular: true } },
    {
      name: "product-not-development",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "^(test|scripts|distribution-preparation|groma|\\.agents|\\.claude)/" },
    },
    {
      name: "model-downward",
      severity: "error",
      from: { path: "^src/core/model/" },
      to: { path: "^src/", pathNot: "^src/core/model/" },
    },
    {
      name: "ports-downward",
      severity: "error",
      from: { path: "^src/core/ports/" },
      to: { path: "^src/", pathNot: "^src/core/(model|ports)/" },
    },
    {
      name: "services-not-operations",
      severity: "error",
      from: { path: "^src/core/services/" },
      to: { path: "^src/core/operations/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      conditionNames: ["import", "node", "default"],
      exportsFields: ["exports"],
    },
  },
};
