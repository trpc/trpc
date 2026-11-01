import type { Context } from 'effect';
import type { AnyTrpcError } from '../../internal/error.ts';
import type { IsAny, ProcedureType } from '../../internal/types.ts';
import type { AnySchema, OutputSchema } from '../validation/index.ts';

/**
 * A declared error: its status, default message, `data` schema and `_tag`
 * (a `TrpcError.Tagged` class's).
 * @since 0.1.0
 * @stability stable
 */
export interface ErrorSpec {
  /** @default a built-in code's class name, or the code */
  readonly tag?: string | undefined;
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
 * What a built procedure's type carries: what clients read (`input`,
 * `output`, `errors`) and what the handler that serves it must provide
 * (`ctx`, `services`). A field that would say nothing is left out, so
 * hovers and declarations show only what the procedure needs. The
 * procedure's type (`'query'`, …) is {@link Procedure}'s.
 * @since 0.1.0
 * @stability stable
 */
export interface ProcedureDef {
  /** What the client sends. */
  input: unknown;
  /** What the client receives (for subscriptions, each event). */
  output: unknown;
  /** The typed error union. */
  errors: AnyTrpcError;
  /** The root ctx the handler must provide; left out when that's `{}`. */
  ctx?: object;
  /** Effect services the handler's `layer` must provide; left out when none. */
  services?: unknown;
  /**
   * Set when an output schema validates the result (a contract's may):
   * what `experimental_validationLink` checks, and with `output: 'json'`
   * decodes.
   */
  outputValidated?: true;
  /**
   * With `outputValidated`, the codes `.errors()` declares: their schemas
   * are what `experimental_validationLink` decodes errors' `data` with, so
   * only these codes' `data` is typed decoded behind it.
   */
  declared?: string;
}

/** @internal */
export type Step =
  | {
      readonly kind: 'use';
      readonly fn: (opts: any) => unknown;
      /** `next()` returns an `Effect`. */
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
export interface ProcedureInternals<
  TType extends ProcedureType = ProcedureType,
> {
  readonly type: TType;
  readonly meta: object;
  readonly steps: ReadonlyArray<Step>;
  readonly output: OutputSchema | undefined;
  /** `false`: `output` only types and documents the result. */
  readonly validateOutput?: false | undefined;
  readonly errors: ErrorMap;
  /** `false`: no development warning when a `TrpcError` is thrown. */
  readonly warnThrown?: false | undefined;
  /** Absent on contract procedures. */
  readonly resolver: ((opts: any) => unknown) | undefined;
}

/**
 * A procedure: a leaf of a router. Built ones are a
 * {@link QueryProcedure}, {@link MutationProcedure} or
 * {@link SubscriptionProcedure}.
 * @since 0.1.0
 * @stability stable
 */
export interface Procedure<
  TDef extends ProcedureDef = ProcedureDef,
  TType extends ProcedureType = ProcedureType,
> {
  readonly '~trpc': ProcedureInternals<TType> & { readonly '~types'?: TDef };
}

// The three are aliases, not interfaces extending `Procedure`: hovers and
// declarations print an alias of an interface by its name all the same, and
// `Procedure<D, 'query'>` against `AnyProcedure` is compared by its type
// arguments where a sub-interface is compared member by member (+14% on a
// handler reading 1000 procedures from `.d.ts`).

/**
 * A query procedure.
 * @since 0.1.0
 * @stability stable
 */
export type QueryProcedure<TDef extends ProcedureDef> = Procedure<
  TDef,
  'query'
>;

/**
 * A mutation procedure.
 * @since 0.1.0
 * @stability stable
 */
export type MutationProcedure<TDef extends ProcedureDef> = Procedure<
  TDef,
  'mutation'
>;

/**
 * A subscription procedure.
 * @since 0.1.0
 * @stability stable
 */
export type SubscriptionProcedure<TDef extends ProcedureDef> = Procedure<
  TDef,
  'subscription'
>;

/**
 * The procedure of type `TType` with def `TDef`.
 * @internal
 */
export type ProcedureOfType<
  TType extends ProcedureType,
  TDef extends ProcedureDef,
> = {
  query: QueryProcedure<TDef>;
  mutation: MutationProcedure<TDef>;
  subscription: SubscriptionProcedure<TDef>;
}[TType];

/**
 * Any procedure.
 * @since 0.1.0
 * @stability stable
 */
export type AnyProcedure = Procedure<any>;

/**
 * Which of a built def's optional fields say something: `1` for `ctx` unless
 * it's `{}` (`C` its keys), for `services` unless `S` is `never`, and for
 * `outputValidated` (with `declared`) unless `V` is `never`. The key of
 * {@link DefShapes}.
 * @internal
 */
// Its arguments are types many procedures share (`never`, a ctx's keys), so
// TypeScript works each combination out once, where the same checks in a
// def's own type ran for every procedure.
export type ShapeKey<C, S, V> =
  `${[C] extends [never] ? 0 : 1}${[S] extends [never] ? 0 : 1}${[V] extends [never] ? 0 : 1}`;

/**
 * Every field a built def may carry, for {@link BuiltDef}. `servicesKey` is
 * `never` when `services` surely is, and cheaper to work out.
 * @internal
 */
export interface DefFields {
  input: unknown;
  output: unknown;
  errors: unknown;
  ctx: unknown;
  services: unknown;
  outputValidated: unknown;
  declared: unknown;
  servicesKey: unknown;
}

/**
 * A built def for each {@link ShapeKey}: the fields that say something.
 * @internal
 */
// Interface members are worked out when read, so only the one the key picks
// is; a conditional per field would resolve every branch's check for every
// procedure (twice the instantiations, with a key-filtering mapped type).
export interface DefShapes<F extends DefFields> {
  '000': { input: F['input']; output: F['output']; errors: F['errors'] };
  '001': {
    input: F['input'];
    output: F['output'];
    errors: F['errors'];
    outputValidated: F['outputValidated'];
    declared: F['declared'];
  };
  '010': {
    input: F['input'];
    output: F['output'];
    errors: F['errors'];
    services: F['services'];
  };
  '011': {
    input: F['input'];
    output: F['output'];
    errors: F['errors'];
    services: F['services'];
    outputValidated: F['outputValidated'];
    declared: F['declared'];
  };
  '100': {
    input: F['input'];
    output: F['output'];
    errors: F['errors'];
    ctx: F['ctx'];
  };
  '101': {
    input: F['input'];
    output: F['output'];
    errors: F['errors'];
    ctx: F['ctx'];
    outputValidated: F['outputValidated'];
    declared: F['declared'];
  };
  '110': {
    input: F['input'];
    output: F['output'];
    errors: F['errors'];
    ctx: F['ctx'];
    services: F['services'];
  };
  '111': {
    input: F['input'];
    output: F['output'];
    errors: F['errors'];
    ctx: F['ctx'];
    services: F['services'];
    outputValidated: F['outputValidated'];
    declared: F['declared'];
  };
}

/**
 * A built procedure's def from every field, leaving out those that say
 * nothing: `ctx` when it's `{}`, `services` when `never`, and
 * `outputValidated` and `declared` unless the output is validated. Hovers
 * and declarations print the fields, not this alias.
 * @internal
 */
export type BuiltDef<F extends DefFields> = DefShapes<F>[ShapeKey<
  keyof F['ctx'],
  F['servicesKey'],
  F['outputValidated']
>];

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
 * A procedure's type: `'query'`, `'mutation'` or `'subscription'`.
 * @internal
 */
export type ProcedureTypeOf<P> = P extends AnyProcedure
  ? P['~trpc']['type']
  : never;

/**
 * The root ctx a procedure's handler must provide (`{}` when none).
 * @internal
 */
export type DefCtx<D> = D extends { readonly ctx: infer C } ? C : {};

/**
 * The Effect services a procedure's handler must provide (`never` when none).
 * @internal
 */
export type DefServices<D> = D extends { readonly services: infer S }
  ? S
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
