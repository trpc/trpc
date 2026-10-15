import type { Context } from 'effect';
import type { AnyTRPCError } from '../internal/error.ts';
import type { ProcedureType } from '../internal/types.ts';
import type { AnySchema } from './schema.ts';

/**
 * A declared error (07 A): its status, default message and `data` schema.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface ErrorSpec {
  readonly status?: number;
  readonly message?: string;
  readonly data?: AnySchema;
}

/**
 * Declared errors by code.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ErrorMap = Readonly<Record<string, ErrorSpec>>;

/**
 * REST metadata (04 (g)). The RPC endpoint ignores it; the OpenAPI handler,
 * generator and link use it (18).
 * @since 12.0.0-alpha.0
 * @stability experimental
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
}

/**
 * Everything the type system knows about a procedure.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
  errors: AnyTRPCError;
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
 * @stability experimental
 */
export interface ProcedureInternals {
  readonly type: ProcedureType;
  readonly meta: object;
  readonly steps: ReadonlyArray<Step>;
  readonly output: AnySchema | undefined;
  readonly errors: ErrorMap;
  readonly route: Route | undefined;
  /** Absent on contract procedures (09). */
  readonly resolver: ((opts: any) => unknown) | undefined;
}

/**
 * A procedure: a leaf of a router.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface Procedure<TDef extends ProcedureDef> {
  readonly '~trpc': ProcedureInternals & { readonly '~types'?: TDef };
}

/**
 * Any procedure.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type AnyProcedure = Procedure<any>;

/** @internal */
export type ProcedureDefOf<P> = P extends Procedure<infer D> ? D : never;

/**
 * What the client sends to a procedure.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type inferProcedureInput<P> = ProcedureDefOf<P>['input'];
/**
 * What the client receives from a procedure.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type inferProcedureOutput<P> = ProcedureDefOf<P>['output'];
/**
 * A procedure's typed error union.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type inferProcedureErrors<P> = ProcedureDefOf<P>['errors'];

/**
 * Whether `value` is a procedure.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function isProcedure(value: unknown): value is AnyProcedure {
  return (
    typeof value === 'object' &&
    value !== null &&
    '~trpc' in value &&
    typeof (value as AnyProcedure)['~trpc'].type === 'string'
  );
}
