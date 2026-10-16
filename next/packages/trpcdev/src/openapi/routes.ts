import type { ProcedureType } from '../internal/types.ts';
import type { Route } from '../server/procedure.ts';

/**
 * An HTTP method `.route()` accepts.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type HttpMethod = NonNullable<Route['method']>;

/**
 * A procedure's REST mapping, with defaults applied (Q18.2).
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @internal
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
