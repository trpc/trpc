import type { Context } from 'effect';
import type { AnyTrpcError } from '../internal/error.ts';
import type { IsAny, ProcedureType } from '../internal/types.ts';
import type { AnySchema, OutputSchema } from './validation/index.ts';

/**
 * A declared error (07 A): its status, default message and `data` schema.
 * @since 0.1.0
 * @stability stable
 */
export interface ErrorSpec {
  readonly status?: number | undefined;
  readonly message?: string | undefined;
  readonly data?: AnySchema | undefined;
}

/**
 * Declared errors by code.
 * @since 0.1.0
 * @stability stable
 */
export type ErrorMap = Readonly<Record<string, ErrorSpec>>;

/**
 * How meta keys merge when `.meta()` sets them again: by key, a function of
 * the earlier and the new value. Keys without one are replaced. Extensions
 * declare them for their keys with `initTrpc({ mergeMeta })`.
 * @since 0.1.0
 * @stability stable
 */
export type MetaMerge<TMeta> = {
  readonly [K in keyof TMeta]?: (
    before: Exclude<TMeta[K], undefined>,
    next: Exclude<TMeta[K], undefined>,
  ) => TMeta[K];
};

/**
 * `next` shallow-merged over `before`, through `merge` for keys both set.
 * @internal
 */
export function mergeMeta(
  merge: MetaMerge<any> | undefined,
  before: object,
  next: object,
): object {
  const out: Record<string, unknown> = { ...before };
  for (const [key, value] of Object.entries(next)) {
    const fn = merge?.[key];
    out[key] =
      fn && out[key] !== undefined && value !== undefined
        ? fn(out[key], value)
        : value;
  }
  return out;
}

/**
 * Everything the type system knows about a procedure.
 * @since 0.1.0
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
 * @since 0.1.0
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
  /** Absent on contract procedures (09). */
  readonly resolver: ((opts: any) => unknown) | undefined;
}

/**
 * A procedure: a leaf of a router.
 * @since 0.1.0
 * @stability stable
 */
export interface Procedure<TDef extends ProcedureDef> {
  readonly '~trpc': ProcedureInternals & { readonly '~types'?: TDef };
}

/**
 * Any procedure.
 * @since 0.1.0
 * @stability stable
 */
export type AnyProcedure = Procedure<any>;

/**
 * A procedure's def, read by index rather than inferred from
 * `Procedure<infer D>`: an inferred `D` is checked against `ProcedureDef`,
 * which resolves every field (input issues included), about 7× the cost on
 * a whole-router read. `any` reads as `ProcedureDef`, as inference gave.
 * @internal
 */
export type ProcedureDefOf<P> =
  IsAny<P> extends true
    ? ProcedureDef
    : P extends AnyProcedure
      ? NonNullable<P['~trpc']['~types']>
      : never;

/**
 * What the client sends to a procedure.
 * @since 0.1.0
 * @stability stable
 */
export type inferProcedureInput<P> = ProcedureDefOf<P>['input'];
/**
 * What the client receives from a procedure.
 * @since 0.1.0
 * @stability stable
 */
export type inferProcedureOutput<P> = ProcedureDefOf<P>['output'];
/**
 * A procedure's typed error union.
 * @since 0.1.0
 * @stability stable
 */
export type inferProcedureErrors<P> = ProcedureDefOf<P>['errors'];

/**
 * Whether `value` is a procedure.
 * @since 0.1.0
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
