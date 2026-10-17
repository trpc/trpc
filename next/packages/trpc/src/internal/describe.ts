import type { ProcedureJson } from '../contract/index.ts';
import {
  isProcedure,
  type AnyProcedure,
  type ProcedureInternals,
} from '../server/procedure.ts';
import { routeGroupOf, routeOf, type Route } from '../openapi/routes.ts';
import { isLazy, routerMetaOf, type AnyLazyRouter } from '../server/router.ts';
import { isSchema } from '../server/schema.ts';
import { isStreamSchema } from '../server/stream-schema.ts';
import { toJsonSchema, type JsonSchema } from './json-schema.ts';

/**
 * The output JSON Schema of a procedure. An output that isn't validated is
 * sent as the resolver returns it, so it is described by the schema's input
 * side.
 * @since 0.1.0
 * @stability stable
 */
export function outputJsonSchema(
  def: ProcedureInternals,
): JsonSchema | undefined {
  if (!def.output) return undefined;
  return toJsonSchema(
    isStreamSchema(def.output) ? def.output['~trpc.stream'].item : def.output,
    def.validateOutput === false ? 'input' : 'output',
  );
}

/**
 * The input JSON Schema of a procedure's steps: chained inputs are `allOf`.
 * @since 0.1.0
 * @stability stable
 */
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

/**
 * Where a procedure sits among routers and lazy subtrees with `route` meta
 * (`t.router({ meta: { route: { prefix, tags } } }, …)`).
 * @since 0.1.0
 * @stability stable
 */
export interface RouteScope {
  /** The groups' prefixes, joined: `/admin`. */
  readonly prefix: string;
  readonly tags: ReadonlyArray<string>;
  /** The dotted path where the innermost prefix starts: `admin.`. */
  readonly base: string;
}

const ROOT_SCOPE: RouteScope = { prefix: '', tags: [], base: '' };

/**
 * A router's procedures with their {@link RouteScope}, and the lazy subtrees
 * that haven't loaded.
 * @since 0.1.0
 * @stability stable
 */
export interface FlatRoutes {
  readonly procedures: Array<{
    path: string;
    procedure: AnyProcedure;
    scope: RouteScope;
  }>;
  readonly lazies: Array<{
    path: string;
    lazy: AnyLazyRouter;
    scope: RouteScope;
  }>;
}

const within = (
  scope: RouteScope,
  path: string,
  group: {
    prefix?: string | undefined;
    tags?: ReadonlyArray<string> | undefined;
  },
): RouteScope => ({
  prefix: scope.prefix + (group.prefix ?? ''),
  tags: [...scope.tags, ...(group.tags ?? [])],
  base: group.prefix ? `${path}.` : scope.base,
});

/**
 * Every procedure of a router with its OpenAPI scope. Loaded lazy subtrees
 * are walked; the others are listed in `lazies`.
 * @since 0.1.0
 * @stability stable
 */
export function flattenRoutes(
  router: object,
  scope: RouteScope = ROOT_SCOPE,
  prefix = '',
  out: FlatRoutes = { procedures: [], lazies: [] },
): FlatRoutes {
  for (const [key, value] of Object.entries(router)) {
    const path = prefix + key;
    if (isProcedure(value)) {
      out.procedures.push({ path, procedure: value, scope });
    } else if (isLazy(value)) {
      const def = value['~lazy'];
      const inner = within(scope, path, routeGroupOf(def.meta) ?? {});
      if (def.loaded) flattenRoutes(def.loaded, inner, `${path}.`, out);
      else out.lazies.push({ path, lazy: value, scope: inner });
    } else if (typeof value === 'object' && value !== null) {
      const group = routeGroupOf(routerMetaOf(value));
      const inner = group ? within(scope, path, group) : scope;
      flattenRoutes(value, inner, `${path}.`, out);
    }
  }
  return out;
}

/**
 * A procedure's `route` meta with its scope applied: the group prefix before
 * its path (or before the path derived below the group), group tags first.
 * @since 0.1.0
 * @stability stable
 */
export function scopedRoute(
  path: string,
  route: Route | undefined,
  scope: RouteScope,
): Route | undefined {
  if (!scope.prefix && scope.tags.length === 0) return route;
  const relative = path.slice(scope.base.length).split('.').join('/');
  const tags = [...scope.tags, ...(route?.tags ?? [])];
  return {
    ...route,
    path: `${scope.prefix}${route?.path ?? `/${relative}`}` as `/${string}`,
    ...(tags.length ? { tags } : {}),
  };
}

/**
 * Every procedure of a router, by dotted path. Throws on a lazy subtree
 * that hasn't loaded: pass `await loadRouter(router)`.
 * @since 0.1.0
 * @stability stable
 */
export function flattenRouter(
  router: object,
): Array<[path: string, procedure: AnyProcedure]> {
  const flat = assertLoaded(flattenRoutes(router));
  return flat.procedures.map((leaf) => [leaf.path, leaf.procedure]);
}

/**
 * Throws if a lazy subtree hasn't loaded.
 * @since 0.1.0
 * @stability stable
 */
export function assertLoaded(flat: FlatRoutes): FlatRoutes {
  const first = flat.lazies[0];
  if (first) {
    throw new Error(
      `"${first.path}" is lazy and hasn't loaded: pass \`await loadRouter(router)\``,
    );
  }
  return flat;
}

const withoutSpec = (route: Route): Route => {
  if (!('spec' in route)) return route;
  const copy = { ...route };
  delete (copy as { spec?: unknown }).spec;
  return copy;
};

/**
 * @since 0.1.0
 * @stability stable
 */
export function procedureJson(
  def: ProcedureInternals,
  route: Route | undefined = routeOf(def),
): ProcedureJson {
  const input = inputJsonSchema(def);
  const output = outputJsonSchema(def);
  const errors = Object.entries(def.errors);
  return {
    type: def.type,
    ...(route ? { route: withoutSpec(route) } : {}),
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
