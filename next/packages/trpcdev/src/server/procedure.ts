import type { Context } from 'effect';
import type { AnyTrpcError } from '../internal/error.ts';
import type { ProcedureType } from '../internal/types.ts';
import type { AnySchema } from './schema.ts';
import type { OutputSchema } from './stream-schema.ts';

/**
 * A declared error (07 A): its status, default message and `data` schema.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface ErrorSpec {
  readonly status?: number | undefined;
  readonly message?: string | undefined;
  readonly data?: AnySchema | undefined;
}

/**
 * Declared errors by code.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export type ErrorMap = Readonly<Record<string, ErrorSpec>>;

/**
 * REST metadata (04 (g)). The RPC endpoint ignores it; the OpenAPI handler,
 * generator and link use it (18).
 * @since 12.0.0-alpha.0
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
   * `.route()` calls, so a base procedure can add `security` and a leaf
   * still extends it. Documentation only; not sent by `toContract()`.
   */
  readonly spec?: OperationSpec | ((operation: OperationSpec) => OperationSpec);
}

/**
 * An OpenAPI operation object, as `.route({ spec })` sees it.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface OperationSpec {
  readonly [key: string]: unknown;
}

/**
 * `next` over `route`, composing `spec` functions.
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
 * Everything the type system knows about a procedure.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface ProcedureDef {
  type: ProcedureType;
  /** The root ctx the handler must provide. */
  ctx: object;
  meta: object;
  /** What the client sends. */
  input: unknown;
  /** What the client receives (for subscriptions, each event). */
  output: unknown;
  /** The typed error union. */
  errors: AnyTrpcError;
  /** Effect services the handler's `layer` must provide. */
  services: unknown;
}

/** @internal */
export type Step =
  | {
      readonly kind: 'use';
      readonly fn: (opts: any) => unknown;
      /** `next()` returns an `Effect` (06 M-A). */
      readonly effect?: boolean;
    }
  | {
      readonly kind: 'input';
      readonly arg: AnySchema | ((opts: any) => AnySchema);
    }
  | {
      readonly kind: 'provide';
      readonly key: Context.Key<any, any>;
      readonly make: (opts: any) => unknown;
    };

/**
 * The runtime definition under `'~trpc'`.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface ProcedureInternals {
  readonly type: ProcedureType;
  readonly meta: object;
  readonly steps: ReadonlyArray<Step>;
  readonly output: OutputSchema | undefined;
  /** `false`: `output` only types and documents the result. */
  readonly validateOutput?: false | undefined;
  readonly errors: ErrorMap;
  readonly route: Route | undefined;
  /** Absent on contract procedures (09). */
  readonly resolver: ((opts: any) => unknown) | undefined;
}

/**
 * A procedure: a leaf of a router.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface Procedure<TDef extends ProcedureDef> {
  readonly '~trpc': ProcedureInternals & { readonly '~types'?: TDef };
}

/**
 * Any procedure.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export type AnyProcedure = Procedure<any>;

/** @internal */
export type ProcedureDefOf<P> = P extends Procedure<infer D> ? D : never;

/**
 * What the client sends to a procedure.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export type inferProcedureInput<P> = ProcedureDefOf<P>['input'];
/**
 * What the client receives from a procedure.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export type inferProcedureOutput<P> = ProcedureDefOf<P>['output'];
/**
 * A procedure's typed error union.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export type inferProcedureErrors<P> = ProcedureDefOf<P>['errors'];

/**
 * Whether `value` is a procedure.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export function isProcedure(value: unknown): value is AnyProcedure {
  return (
    typeof value === 'object' &&
    value !== null &&
    '~trpc' in value &&
    typeof (value as AnyProcedure)['~trpc'].type === 'string'
  );
}
