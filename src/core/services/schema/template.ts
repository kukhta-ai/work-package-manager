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

/**
 * The plain-object shape of a `template.yml` **descriptor** (doc 06; doc 10 `template`). This is only the
 * descriptor — name, scope, declared parameters — and deliberately carries no file tree: the `files` and
 * `snippets` of a {@link Template} are populated from disk by the template resolver (task-17), not from
 * `template.yml`. So {@link serializeTemplateDescriptor} omits them and {@link parseTemplateDescriptor}
 * leaves them empty.
 */
export interface TemplateDescriptorData {
  readonly name: string;
  readonly scope: string;
  readonly parameters: readonly {
    readonly name: string;
    readonly description?: string;
    readonly default?: string;
  }[];
}

const CTX = "template";

/**
 * Parse already-parsed `template.yml` descriptor data into a {@link Template} (doc 13 §4). Validates the
 * descriptor fields — name, scope (`project`|`bundle`), and the declared parameters — and returns a
 * {@link Template} whose `files` and `snippets` are **empty** (the resolver fills them from disk later, task
 * 17). Pure and total; fails at the first problem with a field-precise message.
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

  return ok({ name: name.value, scope, parameters, files: [], snippets: [] });
}

/**
 * Serialize a {@link Template}'s **descriptor** portion back into plain {@link TemplateDescriptorData} for the
 * YAML layer (doc 13 §4). Only name, scope, and parameters are emitted — the `files`/`snippets` trees are not
 * part of `template.yml`. Round-trips with {@link parseTemplateDescriptor} for the descriptor fields. Pure.
 *
 * @param template - The template whose descriptor to serialize.
 * @returns The plain-object descriptor representation.
 */
export function serializeTemplateDescriptor(template: Template): TemplateDescriptorData {
  return {
    name: template.name,
    scope: template.scope,
    parameters: template.parameters.map((p) => ({
      name: p.name,
      ...(p.description !== undefined ? { description: p.description } : {}),
      ...(p.default !== undefined ? { default: p.default } : {}),
    })),
  };
}
