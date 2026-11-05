import {
  ok,
  type Parsed,
  type Template,
  type TemplateParameter,
  type TemplateScope,
} from "../../model/index.js";
import { isPlainObject, optionalString, requireArray, requireString } from "./problems.js";

/** The valid template `scope` values, kept in one place for the check and the error message. */
const TEMPLATE_SCOPES: readonly TemplateScope[] = ["project", "bundle"];

const CTX = "template";

/**
 * Parse already-parsed `template.yml` descriptor data into a {@link Template} (doc 13 §4). Validates the
 * base descriptor fields — name, scope (`project`|`bundle`), and declared parameters — and returns a
 * {@link Template} whose `files` and `snippets` are **empty**. An `authoring-tasks` value is retained exactly
 * for the dedicated aggregate inspector rather than parsed fail-fast here. Pure and total.
 *
 * @param data - Already-parsed template-descriptor data, of unknown shape.
 * @returns The parsed {@link Template} (descriptor portion), or a {@link ValidationProblem}.
 */
export function parseTemplateDescriptor(data: unknown): Parsed<Template> {
  if (!isPlainObject(data)) {
    return { ok: false, problem: { message: `${CTX}: must be a mapping`, field: CTX } };
  }

  const name = requireString(data, "name", CTX);
  if (!name.ok) return name;

  const scopeStr = requireString(data, "scope", CTX);
  if (!scopeStr.ok) return scopeStr;
  if (!TEMPLATE_SCOPES.includes(scopeStr.value as TemplateScope)) {
    return {
      ok: false,
      problem: {
        message: `${CTX}: "scope" must be one of ${TEMPLATE_SCOPES.join(", ")} (got "${scopeStr.value}")`,
        field: "scope",
      },
    };
  }
  const scope = scopeStr.value as TemplateScope;

  // `description` is an optional top-level one-liner (doc-10 metadata, shown by `template show`).
  const description = optionalString(data, "description", CTX);
  if (!description.ok) return description;

  // `parameters` is optional; default to none when absent, but reject a present non-array.
  let parameters: TemplateParameter[] = [];
  if ("parameters" in data && data.parameters !== undefined && data.parameters !== null) {
    const paramsRaw = requireArray(data, "parameters", CTX);
    if (!paramsRaw.ok) return paramsRaw;
    parameters = [];
    for (let i = 0; i < paramsRaw.value.length; i++) {
      const entry = paramsRaw.value[i];
      if (!isPlainObject(entry)) {
        return {
          ok: false,
          problem: {
            message: `${CTX}: "parameters[${i}]" must be a mapping`,
            field: `parameters[${i}]`,
          },
        };
      }
      const pName = requireString(entry, "name", CTX, `parameters[${i}]`);
      if (!pName.ok) return pName;
      const pDesc = optionalString(entry, "description", CTX, `parameters[${i}]`);
      if (!pDesc.ok) return pDesc;
      const pDefault = optionalString(entry, "default", CTX, `parameters[${i}]`);
      if (!pDefault.ok) return pDefault;
      parameters.push({
        name: pName.value,
        ...(pDesc.value !== undefined ? { description: pDesc.value } : {}),
        ...(pDefault.value !== undefined ? { default: pDefault.value } : {}),
      });
    }
  }

  return ok({
    name: name.value,
    scope,
    ...(description.value !== undefined ? { description: description.value } : {}),
    parameters,
    files: [],
    snippets: [],
    ...("authoring-tasks" in data
      ? {
          authoringTaskSource: {
            revision: data.revision,
            tasks: data["authoring-tasks"],
          },
        }
      : {}),
  });
}
