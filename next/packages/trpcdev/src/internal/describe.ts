import type { ProcedureJson } from '../contract/index.ts';
import {
  isProcedure,
  type AnyProcedure,
  type ProcedureInternals,
} from '../server/procedure.ts';
import { isSchema } from '../server/schema.ts';
import { toJsonSchema, type JsonSchema } from './json-schema.ts';

/** The input JSON Schema of a procedure's steps: chained inputs are `allOf`. @internal */
export function inputJsonSchema(
  def: Pick<ProcedureInternals, 'steps'>,
): JsonSchema | undefined {
  const schemas: JsonSchema[] = [];
  for (const step of def.steps) {
    if (step.kind !== 'input') continue;
    const json = isSchema(step.arg)
      ? toJsonSchema(step.arg, 'input')
      : undefined;
    if (!json) return undefined;
    schemas.push(json);
  }
  if (schemas.length === 0) return undefined;
  return schemas.length === 1 ? schemas[0] : { allOf: schemas };
}

/** Every procedure of a router, by dotted path. @internal */
export function flattenRouter(
  router: object,
  prefix = '',
): Array<[path: string, procedure: AnyProcedure]> {
  const out: Array<[string, AnyProcedure]> = [];
  for (const [key, value] of Object.entries(router)) {
    const path = prefix + key;
    if (isProcedure(value)) out.push([path, value]);
    else if (typeof value === 'object' && value !== null) {
      out.push(...flattenRouter(value, `${path}.`));
    }
  }
  return out;
}

/** @internal */
export function procedureJson(def: ProcedureInternals): ProcedureJson {
  const input = inputJsonSchema(def);
  const output = def.output ? toJsonSchema(def.output, 'output') : undefined;
  const errors = Object.entries(def.errors);
  return {
    type: def.type,
    ...(def.route ? { route: def.route } : {}),
    ...(input ? { input } : {}),
    ...(output ? { output } : {}),
    ...(errors.length
      ? {
          errors: Object.fromEntries(
            errors.map(([code, spec]) => {
              const data = spec.data
                ? toJsonSchema(spec.data, 'output')
                : undefined;
              return [
                code,
                {
                  ...(spec.status === undefined ? {} : { status: spec.status }),
                  ...(spec.message === undefined
                    ? {}
                    : { message: spec.message }),
                  ...(data ? { data } : {}),
                },
              ];
            }),
          ),
        }
      : {}),
  };
}
