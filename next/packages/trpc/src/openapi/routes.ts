import type { ProcedureType } from '../internal/types.ts';

/**
 * REST metadata (04 (g)), the `route` meta key of the {@link openapi}
 * extension. The RPC endpoint ignores it; the OpenAPI handler, generator and
 * link use it (18).
 * @since 0.1.0
 * @stability stable
 */
export interface Route {
  /** @default 'GET' for queries and subscriptions, 'POST' for mutations */
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** With `{param}` placeholders, e.g. `/posts/{id}`. @default the procedure path, `/post/byId` */
  readonly path?: `/${string}`;
  /** @default 200 */
  readonly successStatus?: number;
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly deprecated?: boolean;
  readonly operationId?: string;
  /**
   * `compact` merges path params with the query (GET) or body into one input.
   * `detailed` passes `{ params, query, headers, body }`.
   * @default 'compact'
   */
  readonly inputStructure?: 'compact' | 'detailed';
  /**
   * `detailed` resolvers return `{ status?, headers?, body }`.
   * @default 'compact'
   */
  readonly outputStructure?: 'compact' | 'detailed';
  /**
   * The generated OpenAPI operation, overridden: an object replaces it, a
   * function gets it and returns the new one. Functions compose across
   * `.meta({ route })` calls, so a base procedure can add `security` and a leaf
   * still extends it. Documentation only; not sent by `toContract()`.
   */
  readonly spec?: OperationSpec | ((operation: OperationSpec) => OperationSpec);
  /** Type only: `route` on a router, {@link RouteGroup}. */
  readonly '~router'?: RouteGroup;
}

/**
 * The `route` meta of a router or lazy subtree: `t.router({ meta: { route:
 * { prefix, tags } } }, …)` (08 Q8.3).
 * @since 0.1.0
 * @stability stable
 */
export interface RouteGroup {
  /**
   * Prepended to every route below: `/admin`. On a `t.lazy()` subtree it
   * lets the OpenAPI handler load the subtree on the first request under it;
   * without it (or a `contract` on the handler), the handler loads it at
   * startup.
   */
  readonly prefix?: `/${string}` | undefined;
  /** Added before each procedure's own tags. */
  readonly tags?: ReadonlyArray<string> | undefined;
}

/** A router's `route` meta. @internal */
export const routeGroupOf = (
  meta: object | undefined,
): RouteGroup | undefined =>
  (meta as { route?: RouteGroup } | undefined)?.route;

/**
 * An OpenAPI operation object, as `route.spec` sees it.
 * @since 0.1.0
 * @stability stable
 */
export interface OperationSpec {
  readonly [key: string]: unknown;
}

/**
 * `next` over `route` by key, composing `spec` functions: the `route` meta
 * key's merge.
 * @internal
 */
export function mergeRoute(
  route: Route | undefined,
  next: Route | undefined,
): Route | undefined {
  if (!next) return route;
  if (!route) return next;
  const before = route.spec;
  const after = next.spec;
  return {
    ...route,
    ...next,
    ...(typeof after === 'function' && before
      ? {
          spec: (operation: OperationSpec) =>
            after(typeof before === 'function' ? before(operation) : before),
        }
      : {}),
  };
}

/**
 * The meta the `openapi()` extension adds.
 * @since 0.1.0
 * @stability stable
 */
export interface OpenApiMeta {
  /** The procedure's REST mapping; `.meta({ route })` calls merge by key. */
  route?: Route;
}

/**
 * A procedure's REST mapping, from its `route` meta key.
 * @internal
 */
export const routeOf = (def: { readonly meta: object }): Route | undefined =>
  (def.meta as OpenApiMeta).route;

/**
 * An HTTP method a `route` accepts.
 * @since 0.1.0
 * @stability stable
 */
export type HttpMethod = NonNullable<Route['method']>;

/**
 * A procedure's REST mapping, with defaults applied (Q18.2).
 * @since 0.1.0
 * @stability stable
 */
export interface ResolvedRoute {
  readonly method: HttpMethod;
  /** The full path template, prefix included: `/api/posts/{id}`. */
  readonly path: `/${string}`;
  /** The `{param}` names in `path`. */
  readonly params: ReadonlyArray<string>;
  readonly successStatus: number;
  readonly inputStructure: 'compact' | 'detailed';
  readonly outputStructure: 'compact' | 'detailed';
}

/** `''` or `/api`, without a trailing slash. @internal */
export const normalizePrefix = (prefix: string | undefined): string => {
  const trimmed = (prefix ?? '/api').replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
};

/**
 * Applies the defaults: a query is `GET {prefix}/post/byId`, a mutation
 * `POST`, a subscription `GET` with `text/event-stream`.
 *
 * @example
 * ```ts
 * resolveRoute('post.byId', 'query', undefined, '/api');
 * // { method: 'GET', path: '/api/post/byId', params: [], successStatus: 200, … }
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function resolveRoute(
  path: string,
  type: ProcedureType,
  route: Route | undefined,
  prefix: string,
): ResolvedRoute {
  const template = `${prefix}${route?.path ?? `/${path.split('.').join('/')}`}`;
  return {
    method: route?.method ?? (type === 'mutation' ? 'POST' : 'GET'),
    path: template as `/${string}`,
    params: [...template.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]!),
    successStatus: route?.successStatus ?? 200,
    inputStructure: route?.inputStructure ?? 'compact',
    outputStructure: route?.outputStructure ?? 'compact',
  };
}

/** Whether the method sends its input in the query string (GET) rather than a body. @internal */
export const usesQuery = (method: HttpMethod): boolean => method === 'GET';

/** Matches a path against a template, returning the decoded params. @internal */
export function compileRoute(
  template: string,
): (pathname: string) => Record<string, string> | undefined {
  const names: string[] = [];
  const source = template
    .split(/(\{[^{}]+\})/)
    .map((part) => {
      const param = /^\{([^{}]+)\}$/.exec(part);
      if (param) {
        names.push(param[1]!);
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  const regex = new RegExp(`^${source}/?$`);
  return (pathname) => {
    const match = regex.exec(pathname);
    if (!match) return undefined;
    const params: Record<string, string> = {};
    names.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1]!);
    });
    return params;
  };
}

/** Fills `{param}` placeholders. @internal */
export function fillPath(
  template: string,
  params: Record<string, unknown>,
): string {
  return template.replace(/\{([^{}]+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined || value === null) {
      throw new Error(`Missing path param "${name}" for ${template}`);
    }
    return encodeURIComponent(
      value instanceof Date
        ? value.toISOString()
        : String(value as string | number | boolean | bigint),
    );
  });
}
