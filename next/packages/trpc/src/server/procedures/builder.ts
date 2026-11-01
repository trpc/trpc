import {
  Match,
  type Context,
  type Effect,
  type Scope,
  type Stream,
} from 'effect';
import type {
  AnyTrpcError,
  ReservedKeyCheck,
  TagOfCode,
  TrpcError,
} from '../../internal/error.ts';
import type {
  IsAny,
  MaybePromise,
  Merge,
  Missing,
  Overwrite,
  ProcedureType,
  Simplify,
  TypeError,
  UndeclaredMeta,
  Unset,
  Value,
} from '../../internal/types.ts';
import {
  isEffectMiddleware,
  type EffectMiddleware,
  type MiddlewareErrors,
  type MiddlewareFunction,
  type NextInput,
  type ResponseHandle,
} from './middleware.ts';
import {
  mergeMeta,
  type ErrorMap,
  type ErrorSpec,
  type BuiltDef,
  type DefFields,
  type ShapeKey,
  type MetaMerge,
  type MutationProcedure,
  type QueryProcedure,
  type SubscriptionProcedure,
  type Step,
} from './procedure.ts';
import type {
  AnySchema,
  InOf,
  OutOf,
  SchemaServices,
  SchemaValidationError,
  EventOutput,
  OutputIn,
  OutputOut,
  OutputSchema,
  OutputServices,
  ResultOf,
  StreamedOutput,
  StreamOutput,
} from '../validation/index.ts';
import type { TrackedEnvelope } from '../subscriptions/index.ts';

/**
 * The builder's state: one mapped bag.
 * @since 0.1.0
 * @stability stable
 */
export interface BuilderDef {
  /** The root ctx. For a plugin, what it requires. */
  ctx: object;
  /**
   * The keys standalone middleware needs that the root ctx lacked (in
   * `ctx` too): a built procedure's `ctx`, since its router carries the
   * rest.
   */
  needs: object;
  /** What middleware has added so far. */
  ctxAdded: object;
  meta: object;
  inputIn: unknown;
  inputOut: unknown;
  outputIn: unknown;
  outputOut: unknown;
  /**
   * `true` once `.output()` validates the result; `never` before, and
   * with `validate: false`, so unions of procedures still reduce.
   */
  outputValidated: true;
  errors: AnyTrpcError;
  /** Errors declared with `.errors()`, by code. */
  declared: object;
  /** Values middleware may short-circuit with, via `ok()`. */
  shorts: unknown;
  /** Effect services provided by `.provide()` and Effect middleware. */
  provided: unknown;
  /** Effect services required by steps (input schemas, `.provide()` effects). */
  requires: unknown;
}

/**
 * Part of inferred procedure types; exported so they stay nameable.
 * @since 0.1.0
 * @stability stable
 */
export type With<TDef extends BuilderDef, P extends Partial<BuilderDef>> = {
  [K in keyof BuilderDef]: K extends keyof P ? P[K] : TDef[K];
};

/**
 * The ctx at this point of the chain.
 * @since 0.1.0
 * @stability stable
 */
export type CurrentCtx<TDef extends BuilderDef> = Overwrite<
  TDef['ctx'],
  TDef['ctxAdded']
>;

/**
 * What a context-aware input callback receives.
 * @since 0.1.0
 * @stability stable
 */
export interface InputOpts<TCtx, TMeta> {
  readonly ctx: TCtx;
  readonly meta: TMeta;
  readonly path: string;
  readonly type: ProcedureType;
}

/**
 * The input of a declared error's constructor.
 * @since 0.1.0
 * @stability stable
 */
export type ErrorConstructorOpts<TData> = {
  message?: string;
  cause?: unknown;
} & (undefined extends TData ? { data?: TData } : { data: TData });

/**
 * Typed constructors for the errors declared with `.errors()`. The
 * errors they make are `defined` even when thrown from deep helper code.
 * @since 0.1.0
 * @stability stable
 */
export type ErrorConstructors<TDeclared> = {
  readonly [K in keyof TDeclared]: TDeclared[K] extends TrpcError<any, infer D>
    ? undefined extends D
      ? (opts?: ErrorConstructorOpts<D>) => TDeclared[K]
      : (opts: ErrorConstructorOpts<D>) => TDeclared[K]
    : never;
};

/**
 * What a resolver receives.
 * @since 0.1.0
 * @stability stable
 */
export interface ResolverOpts<TDef extends BuilderDef> {
  readonly ctx: CurrentCtx<TDef>;
  readonly input: Value<TDef['inputOut']>;
  readonly meta: TDef['meta'];
  readonly path: string;
  readonly type: ProcedureType;
  /** Aborted when the client goes away. */
  readonly signal: AbortSignal;
  /** Response headers and status (04 (d)). */
  readonly response: ResponseHandle;
  /** Constructors for the errors declared with `.errors()`. */
  readonly errors: ErrorConstructors<TDef['declared']>;
}

/**
 * What a subscription resolver receives.
 * @since 0.1.0
 * @stability stable
 */
export interface SubscriptionResolverOpts<
  TDef extends BuilderDef,
> extends ResolverOpts<TDef> {
  /** The id of the last `tracked()` event the client saw, when resuming. */
  readonly lastEventId: string | undefined;
}

/**
 * What `.provide()`'s factory receives.
 * @since 0.1.0
 * @stability stable
 */
export interface ProvideOpts<TDef extends BuilderDef> {
  readonly ctx: CurrentCtx<TDef>;
  readonly input: Value<TDef['inputOut']>;
  readonly meta: TDef['meta'];
  readonly path: string;
}

// --- splitting a resolver's return type ----------------------------------------

type OutputOf<R> = R extends AnyTrpcError
  ? never
  : R extends Stream.Stream<infer A, any, any>
    ? AsyncIterable<A>
    : R extends Effect.Effect<infer A, any, any>
      ? Exclude<A, AnyTrpcError>
      : R;
// A returned `Stream`'s failures are the call's too: clients get them from
// iterating the output.
type ErrorsOf<R> = R extends AnyTrpcError
  ? R
  : R extends Effect.Effect<infer A, infer E, any>
    ? Extract<E | A, AnyTrpcError>
    : R extends Stream.Stream<any, infer E, any>
      ? Extract<E, AnyTrpcError>
      : never;
// `any` is what a resolver that fails its `Returns` bound is inferred to
// need: without the guard every router it is in would need a layer.
type ServicesOf<R> = R extends AnyTrpcError
  ? never
  : R extends Effect.Effect<any, any, infer S>
    ? IsAny<S> extends true
      ? never
      : S
    : R extends Stream.Stream<any, any, infer S>
      ? IsAny<S> extends true
        ? never
        : S
      : never;

/**
 * Part of inferred procedure types; exported so they stay nameable.
 * @since 0.1.0
 * @stability stable
 */
export interface Split {
  output: unknown;
  errors: AnyTrpcError;
  services: unknown;
}
/**
 * Part of inferred procedure types; exported so they stay nameable.
 * @since 0.1.0
 * @stability stable
 */
export type SplitReturn<R> =
  IsAny<Awaited<R>> extends true
    ? { output: any; errors: never; services: never; unmapped: never }
    : {
        output: OutputOf<Awaited<R>>;
        errors: ErrorsOf<Awaited<R>>;
        services: ServicesOf<Awaited<R>>;
        /** Failures that aren't a `TrpcError`, which {@link StrictErrors} rejects. */
        unmapped: UnmappedOf<Awaited<R>>;
      };

type EventOf<R> = R extends AnyTrpcError
  ? never
  : R extends Stream.Stream<infer A, any, any>
    ? A
    : R extends AsyncIterable<infer T>
      ? T
      : never;
type StreamErrorsOf<R> = R extends AnyTrpcError
  ? R
  : R extends Stream.Stream<any, infer E, any>
    ? Extract<E, AnyTrpcError>
    : never;
/**
 * Part of inferred procedure types; exported so they stay nameable.
 * @since 0.1.0
 * @stability stable
 */
export type SplitStream<R> =
  IsAny<Awaited<R>> extends true
    ? { output: any; errors: never; services: never }
    : {
        output: EventOf<Awaited<R>>;
        errors: StreamErrorsOf<Awaited<R>>;
        services: ServicesOf<Awaited<R>>;
      };

// A query's or mutation's def for each `ShapeKey`, as `BuiltDef` makes it
// but with the fields written out: reading each through `DefFields` costs
// 2% more on most procedures. The key checks `servicesKey`'s way: requires
// and the resolver's services, before `Scope` and provided ones are taken
// out.
interface ReturnShapes<TDef extends BuilderDef, $Ret> {
  '000': {
    input: Value<TDef['inputIn']>;
    output: TDef['outputOut'] extends Unset
      ? SplitReturn<$Ret>['output']
      : StreamedOutput<TDef['outputOut']>;
    errors: TDef['errors'] | SplitReturn<$Ret>['errors'];
  };
  '001': {
    input: Value<TDef['inputIn']>;
    output: TDef['outputOut'] extends Unset
      ? SplitReturn<$Ret>['output']
      : StreamedOutput<TDef['outputOut']>;
    errors: TDef['errors'] | SplitReturn<$Ret>['errors'];
    outputValidated: TDef['outputValidated'];
    declared: keyof TDef['declared'] & string;
  };
  '010': {
    input: Value<TDef['inputIn']>;
    output: TDef['outputOut'] extends Unset
      ? SplitReturn<$Ret>['output']
      : StreamedOutput<TDef['outputOut']>;
    errors: TDef['errors'] | SplitReturn<$Ret>['errors'];
    services:
      | Exclude<TDef['requires'], Scope.Scope>
      | Exclude<SplitReturn<$Ret>['services'], TDef['provided'] | Scope.Scope>;
  };
  '011': {
    input: Value<TDef['inputIn']>;
    output: TDef['outputOut'] extends Unset
      ? SplitReturn<$Ret>['output']
      : StreamedOutput<TDef['outputOut']>;
    errors: TDef['errors'] | SplitReturn<$Ret>['errors'];
    services:
      | Exclude<TDef['requires'], Scope.Scope>
      | Exclude<SplitReturn<$Ret>['services'], TDef['provided'] | Scope.Scope>;
    outputValidated: TDef['outputValidated'];
    declared: keyof TDef['declared'] & string;
  };
  '100': {
    input: Value<TDef['inputIn']>;
    output: TDef['outputOut'] extends Unset
      ? SplitReturn<$Ret>['output']
      : StreamedOutput<TDef['outputOut']>;
    errors: TDef['errors'] | SplitReturn<$Ret>['errors'];
    ctx: TDef['needs'];
  };
  '101': {
    input: Value<TDef['inputIn']>;
    output: TDef['outputOut'] extends Unset
      ? SplitReturn<$Ret>['output']
      : StreamedOutput<TDef['outputOut']>;
    errors: TDef['errors'] | SplitReturn<$Ret>['errors'];
    ctx: TDef['needs'];
    outputValidated: TDef['outputValidated'];
    declared: keyof TDef['declared'] & string;
  };
  '110': {
    input: Value<TDef['inputIn']>;
    output: TDef['outputOut'] extends Unset
      ? SplitReturn<$Ret>['output']
      : StreamedOutput<TDef['outputOut']>;
    errors: TDef['errors'] | SplitReturn<$Ret>['errors'];
    ctx: TDef['needs'];
    services:
      | Exclude<TDef['requires'], Scope.Scope>
      | Exclude<SplitReturn<$Ret>['services'], TDef['provided'] | Scope.Scope>;
  };
  '111': {
    input: Value<TDef['inputIn']>;
    output: TDef['outputOut'] extends Unset
      ? SplitReturn<$Ret>['output']
      : StreamedOutput<TDef['outputOut']>;
    errors: TDef['errors'] | SplitReturn<$Ret>['errors'];
    ctx: TDef['needs'];
    services:
      | Exclude<TDef['requires'], Scope.Scope>
      | Exclude<SplitReturn<$Ret>['services'], TDef['provided'] | Scope.Scope>;
    outputValidated: TDef['outputValidated'];
    declared: keyof TDef['declared'] & string;
  };
}

type ReturnDef<TDef extends BuilderDef, $Ret> = ReturnShapes<
  TDef,
  $Ret
>[ShapeKey<
  keyof TDef['needs'],
  TDef['requires'] | ServicesKey<$Ret>,
  TDef['outputValidated']
>];

// `never` whenever `ServicesOf<Awaited<R>>` is, without `Awaited` on what
// isn't a promise: the key is worked out for every procedure in a program,
// read or not, and `SplitReturn` costs 6% more on a client checking a
// router from source. A `TrpcError`'s brand requires `never`.
type ServicesKey<R> =
  R extends Promise<infer U>
    ? ServicesKey<U>
    : R extends { readonly [Effect.TypeId]: Effect.Variance<any, any, infer S> }
      ? S
      : R extends Stream.Variance<any, any, infer S>
        ? S
        : R extends { then: unknown }
          ? ServicesKey<Awaited<R>>
          : never;

interface StreamFields<TDef extends BuilderDef, $Ret> extends DefFields {
  input: Value<TDef['inputIn']>;
  output: TDef['outputOut'] extends Unset
    ? SplitStream<$Ret>['output']
    : SplitStream<$Ret>['output'] extends TrackedEnvelope<any>
      ? TrackedEnvelope<EventOutput<TDef['outputOut']>>
      : EventOutput<TDef['outputOut']>;
  errors: TDef['errors'] | SplitStream<$Ret>['errors'];
  ctx: TDef['needs'];
  services:
    | TDef['requires']
    | Exclude<SplitStream<$Ret>['services'], TDef['provided']>;
  outputValidated: TDef['outputValidated'];
  declared: keyof TDef['declared'] & string;
  servicesKey: TDef['requires'] | SplitStream<$Ret>['services'];
}

// --- resolver checks ------------------------------------------------------------------

// A typed output checks the resolver's return with a bound on `$Ret`, and
// the return position is `$Ret | bound` so that `async` bodies and `yield`s
// take the bound's members as their contextual type. `$Ret & …` there
// loses literals in both, and a check on `$Ret` beside the bound fixes
// `$Ret` to the bound before the resolver is inferred, so every check of a
// typed output lives in the bound. Its hints are interfaces nothing real
// matches, keyed by their text so a message ends on "Property '<hint>' is
// missing". TypeScript reports a wrong union member against the members
// whose literal `code` and `name` it matches: an undeclared error's `code`
// matches only `UnlistedError`'s, and a failure that isn't a `TrpcError`
// has a `name` other than `'TrpcError'`, which leaves `UnmappedFailure`.

type Listed<TErrors> = AnyTrpcError extends TErrors
  ? TErrors
  : TErrors | UnlistedError;

/**
 * Names the hint for a returned error the procedure doesn't list. It has
 * every key of a `TrpcError` but `data`, which `error()` would infer from.
 */
interface UnlistedError extends Omit<AnyTrpcError, 'data'> {
  readonly '.errors() lists every error the resolver may return: declare this one, or return a declared one': true;
}

type Mapped<TErrors> = Listed<TErrors> | UnmappedFailure;

/** Names the hint for an Effect or Stream failure that isn't a `TrpcError`. */
interface UnmappedFailure extends Error {
  readonly 'Map Effect failures to a TrpcError (e.g. Effect.catchTag) before returning them': true;
}

/**
 * What a resolver may return for an output schema type `TOutput`: the
 * value or an error as they are, in a `Promise`, or as an `Effect` that
 * fails only with those errors.
 * @internal
 */
export type Returns<TOutput, TErrors> =
  | ValueOf<TOutput, TErrors>
  | Listed<TErrors>
  | Promise<ValueOf<TOutput, TErrors> | Listed<TErrors>>
  | Effect.Effect<
      ValueOf<TOutput, TErrors> | Listed<TErrors>,
      Mapped<TErrors>,
      any
    >
  | (TOutput extends StreamOutput<any, any>
      ? never
      : StreamWithoutStreamSchema);

/** What a subscription may return for an event `TEvent`. @internal */
export type Yields<TEvent, TErrors> =
  | AsyncIterable<TEvent, any, any>
  | Stream.Stream<TEvent, Mapped<TErrors>, any>
  | Listed<TErrors>;

/** The value a query or mutation resolves to for an output schema. */
type ValueOf<TOut, TErrors> =
  TOut extends StreamOutput<infer I, infer R>
    ? AsyncIterable<I, R, any> | Stream.Stream<I, Mapped<TErrors>, any>
    : TOut;

/** Names the hint for a stream returned for a plain output schema. */
interface StreamWithoutStreamSchema extends AsyncIterable<
  TypeError<'A streamed output validates each item with .output(stream(Item))'>
> {}

/** The errors a resolver may return: the declared ones, once there are any. */
type Returnable<TDef extends BuilderDef> = [keyof TDef['declared']] extends [
  never,
]
  ? AnyTrpcError
  : TDef['declared'][keyof TDef['declared']];

type ReturnsFor<TDef extends BuilderDef> = TDef['outputIn'] extends Unset
  ? unknown
  : AsyncIterable<any, any, any> extends TDef['outputIn']
    ? unknown
    : ShortsCheck<TDef, ResultOf<TDef['outputIn']>> extends TypeError<any, any>
      ? ShortsCheck<TDef, ResultOf<TDef['outputIn']>>
      : Returns<TDef['outputIn'], Returnable<TDef>>;

type YieldsFor<TDef extends BuilderDef> = TDef['outputIn'] extends Unset
  ? unknown
  : AsyncIterable<any, any, any> extends TDef['outputIn']
    ? unknown
    : Yields<
        | EventOutput<TDef['outputIn']>
        | TrackedEnvelope<EventOutput<TDef['outputIn']>>,
        Returnable<TDef>
      >;

type EventConstraint<TDef extends BuilderDef> = TDef['outputIn'] extends Unset
  ? unknown
  : Yields<
      | EventOutput<TDef['outputIn']>
      | TrackedEnvelope<EventOutput<TDef['outputIn']>>,
      any
    >;

/**
 * A query or mutation that streams needs `.output(stream(Item))`: a plain
 * schema would be checked against the whole iterable.
 * @since 0.1.0
 * @stability stable
 */
export type StreamOutputCheck<
  TDef extends BuilderDef,
  $Ret,
> = TDef['outputIn'] extends Unset
  ? unknown
  : TDef['outputIn'] extends StreamOutput<any, any>
    ? unknown
    : IsAny<Awaited<$Ret>> extends true
      ? unknown
      : Awaited<$Ret> extends AsyncIterable<any> | Stream.Stream<any, any, any>
        ? TDef['outputIn'] extends AsyncIterable<any>
          ? unknown
          : TypeError<
              'A streamed output validates each item with .output(stream(Item))',
              TDef['outputIn']
            >
        : unknown;

type UnmappedOf<R> =
  R extends Effect.Effect<any, infer E, any>
    ? Exclude<E, AnyTrpcError>
    : R extends Stream.Stream<any, infer E, any>
      ? Exclude<E, AnyTrpcError>
      : never;

/**
 * 02 d.ii: an Effect or Stream that can fail with something other than a
 * `TrpcError` is a type error until the failure is mapped.
 * @since 0.1.0
 * @stability stable
 */
export type StrictErrors<R> =
  IsAny<Awaited<R>> extends true
    ? unknown
    : UnmappedCheck<UnmappedOf<Awaited<R>>>;

type UnmappedCheck<TUnmapped> = [TUnmapped] extends [never]
  ? unknown
  : TypeError<
      'Map Effect failures to a TrpcError (e.g. Effect.catchTag) before returning them',
      TUnmapped
    >;

// Without a typed output, the checks go on the return: each conditional on
// it is instantiated on every inference pass, so they read the
// `SplitReturn` the procedure type needs anyway, and skip what the builder
// makes moot.
type ResolverReturn<
  TDef extends BuilderDef,
  $Ret,
> = TDef['outputIn'] extends Unset
  ? $Ret &
      UnmappedCheck<SplitReturn<$Ret>['unmapped']> &
      ShortsFor<TDef, $Ret> &
      DeclaredCheck<TDef, $Ret>
  : AsyncIterable<any, any, any> extends TDef['outputIn']
    ? $Ret &
        StreamOutputCheck<TDef, $Ret> &
        UnmappedCheck<SplitReturn<$Ret>['unmapped']> &
        ShortsFor<TDef, $Ret> &
        DeclaredCheck<TDef, $Ret>
    : $Ret | ReturnsFor<TDef>;

type SubscriptionReturn<
  TDef extends BuilderDef,
  $Ret,
> = TDef['outputIn'] extends Unset
  ? $Ret & StrictErrors<$Ret> & DeclaredStreamCheck<TDef, $Ret>
  : AsyncIterable<any, any, any> extends TDef['outputIn']
    ? $Ret &
        EventConstraint<TDef> &
        StrictErrors<$Ret> &
        DeclaredStreamCheck<TDef, $Ret>
    : $Ret | YieldsFor<TDef>;

/**
 * Checks values from `ok()` short-circuits against the procedure's output.
 * @since 0.1.0
 * @stability stable
 */
export type ShortsCheck<TDef extends BuilderDef, TOutput> = [
  TDef['shorts'],
] extends [never]
  ? unknown
  : [TDef['shorts']] extends [TOutput]
    ? unknown
    : TypeError<
        'ok(): a middleware short-circuits with a value the output does not accept',
        TDef['shorts']
      >;

type ResolvedOutput<
  TDef extends BuilderDef,
  $Ret,
> = TDef['outputIn'] extends Unset
  ? SplitReturn<$Ret>['output']
  : ResultOf<TDef['outputIn']>;

/** {@link ShortsCheck}, without resolving the output when nothing short-circuits. */
type ShortsFor<TDef extends BuilderDef, $Ret> = [TDef['shorts']] extends [never]
  ? unknown
  : ShortsCheck<TDef, ResolvedOutput<TDef, $Ret>>;

// --- ctx a middleware needs -------------------------------------------------------

type NeedsConflict<TCtx, TNeeds> = {
  [K in keyof TNeeds & keyof TCtx]: [TCtx[K]] extends [TNeeds[K]] ? never : K;
}[keyof TNeeds & keyof TCtx];

/**
 * A type error when a standalone middleware needs a ctx key the procedure
 * has with another type. Keys the procedure lacks are fine: see
 * {@link WithNeeds}.
 * @since 0.1.0
 * @stability stable
 */
export type NeedsCheck<TCtx, TNeeds> = [NeedsConflict<TCtx, TNeeds>] extends [
  never,
]
  ? unknown
  : TypeError<
      'use: the middleware needs ctx of another type than this procedure has',
      NeedsConflict<TCtx, TNeeds>
    >;

/**
 * The root ctx after a middleware that needs keys the procedure lacks: they
 * become requirements on the root ctx, so `createContext` (or an
 * in-process caller's `ctx`) must supply them, like an Effect requirement.
 * @since 0.1.0
 * @stability stable
 */
export type WithNeeds<TDef extends BuilderDef, TNeeds> = [
  Exclude<keyof TNeeds, keyof CurrentCtx<TDef>>,
] extends [never]
  ? TDef['ctx']
  : Simplify<
      TDef['ctx'] & Pick<TNeeds, Exclude<keyof TNeeds, keyof CurrentCtx<TDef>>>
    >;

/**
 * {@link WithNeeds}' new keys alone, on top of earlier middleware's: what a
 * built procedure's `ctx` says.
 * @since 0.1.0
 * @stability stable
 */
export type NeedsAdded<TDef extends BuilderDef, TNeeds> = [
  Exclude<keyof TNeeds, keyof CurrentCtx<TDef>>,
] extends [never]
  ? TDef['needs']
  : Simplify<
      TDef['needs'] &
        Pick<TNeeds, Exclude<keyof TNeeds, keyof CurrentCtx<TDef>>>
    >;

// --- concat ----------------------------------------------------------------------

/**
 * `unknown` when `plugin` may be concatenated onto a builder with `TDef`.
 * @since 0.1.0
 * @stability stable
 */
export type ConcatCheck<TDef extends BuilderDef, TPlugin extends BuilderDef> = [
  Missing<CurrentCtx<TDef>, TPlugin['ctx']>,
] extends [never]
  ? [Missing<TDef['meta'], TPlugin['meta']>] extends [never]
    ? ConcatOutputCheck<TDef, TPlugin>
    : TypeError<
        'concat: the plugin needs meta this procedure does not declare',
        Missing<TDef['meta'], TPlugin['meta']>
      >
  : TypeError<
      'concat: the plugin needs ctx this procedure does not have',
      Missing<CurrentCtx<TDef>, TPlugin['ctx']>
    >;

// --- output ----------------------------------------------------------------------

/**
 * `unknown` unless both a builder and the plugin it concatenates have an
 * output: the plugin's becomes the procedure's, and there is only one.
 * @since 0.1.0
 * @stability stable
 */
export type ConcatOutputCheck<
  TDef extends BuilderDef,
  TPlugin extends BuilderDef,
> = TPlugin['outputIn'] extends Unset
  ? unknown
  : TDef['outputIn'] extends Unset
    ? unknown
    : TypeError<
        'concat: this procedure and the plugin both have an output',
        TPlugin['outputIn']
      >;

/**
 * `unknown` when a builder with `TDef` may take an `.output()`: one that
 * already has an output, its own or a plugin's, can't take another. Inputs
 * merge; outputs don't.
 * @since 0.1.0
 * @stability stable
 */
export type OutputCheck<TDef extends BuilderDef> =
  TDef['outputIn'] extends Unset
    ? unknown
    : TypeError<
        'output: this procedure already has an output',
        TDef['outputIn']
      >;

// --- declared errors -------------------------------------------------------------

/**
 * The `.errors()` argument.
 * @since 0.1.0
 * @stability stable
 */
export type ErrorMapInput = Record<string, ErrorSpec>;

/**
 * The `TrpcError` types an error map declares, by code.
 * @since 0.1.0
 * @stability stable
 */
export type DeclaredErrors<M> = {
  [K in keyof M & string]: TrpcError<
    K,
    M[K] extends { data: infer S extends AnySchema } ? OutOf<S> : undefined,
    M[K] extends { readonly tag: infer T extends string } ? T : TagOfCode<K>
  >;
};

/**
 * Declared errors are exhaustive: once a procedure has `.errors()`, its
 * resolver may return only those, and a streamed output fail only with
 * those. Middleware's errors aren't checked.
 * @since 0.1.0
 * @stability stable
 */
// Takes the resolver's return rather than its errors: a procedure without
// `.errors()` then never splits it here.
export type DeclaredCheck<TDef extends BuilderDef, $Ret> = [
  keyof TDef['declared'],
] extends [never]
  ? unknown
  : ErrorsIn<
      SplitReturn<$Ret>['errors'],
      TDef['declared'][keyof TDef['declared']]
    >;

/**
 * {@link DeclaredCheck} for a subscription.
 * @since 0.1.0
 * @stability stable
 */
export type DeclaredStreamCheck<TDef extends BuilderDef, $Ret> = [
  keyof TDef['declared'],
] extends [never]
  ? unknown
  : ErrorsIn<
      SplitStream<$Ret>['errors'],
      TDef['declared'][keyof TDef['declared']]
    >;

type ErrorsIn<TErrors, TDeclared> = [TErrors] extends [TDeclared]
  ? unknown
  : TypeError<
      '.errors() lists every error the resolver may return: declare this one, or return a declared one',
      Exclude<TErrors, TDeclared>
    >;

// --- the builder -------------------------------------------------------------------

/**
 * The runtime state under `'~trpc'`.
 * @since 0.1.0
 * @stability stable
 */
export interface BuilderInternals {
  readonly steps: ReadonlyArray<Step>;
  readonly meta: object;
  readonly output: OutputSchema | undefined;
  readonly validateOutput?: false | undefined;
  readonly errors: ErrorMap;
  /** `false`: from `initTrpc({ warnThrownErrors: false })`. */
  readonly warnThrown?: false | undefined;
  /** How `.meta()` merges keys set again; from `initTrpc` and extensions. */
  readonly mergeMeta?: MetaMerge<any> | undefined;
}

/**
 * Builds procedures. Every method returns a new builder, so builders can be
 * shared as base procedures.
 *
 * @example
 * ```ts
 * const t = initTrpc<{ ctx: { user: User | null } }>();
 *
 * const authed = t.procedure.use(({ ctx, next }) =>
 *   ctx.user ? next({ ctx: { user: ctx.user } }) : error({ code: 'UNAUTHORIZED' }),
 * );
 *
 * export const router = t.router({
 *   me: authed.query(({ ctx }) => ctx.user),
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface ProcedureBuilder<TDef extends BuilderDef> {
  readonly '~trpc': BuilderInternals & { readonly '~types'?: TDef };

  /**
   * Adds an input schema: Standard Schema (zod, valibot, ArkType, …) or Effect
   * Schema. Object inputs chain: each schema validates the raw input, and the
   * results are merged.
   *
   * @example
   * ```ts
   * t.procedure.input(z.object({ id: z.string() }));
   * t.procedure.input(Schema.Struct({ id: Schema.String }));
   * ```
   */
  input<$S extends AnySchema>(schema: $S): ProcedureBuilder<InputDef<TDef, $S>>;
  /**
   * Adds an input schema built from the ctx. The callback runs per
   * call, so build schemas outside it where possible.
   *
   * @example
   * ```ts
   * t.procedure.input(({ ctx }) =>
   *   z.object({ limit: z.number().max(ctx.user.plan === 'pro' ? 1000 : 10) }),
   * );
   * ```
   */
  input<$S extends AnySchema>(
    fn: (opts: InputOpts<CurrentCtx<TDef>, TDef['meta']>) => $S,
  ): ProcedureBuilder<InputDef<TDef, $S>>;

  /**
   * Types and documents the result with a schema, without running it: the
   * resolver and the client both get the schema's input type, since no
   * transform runs.
   *
   * @example
   * ```ts
   * t.procedure
   *   .output(PostSchema, { validate: false })
   *   .query(() => db.post.find(id));
   * ```
   */
  output<$S extends OutputSchema>(
    schema: $S & OutputCheck<TDef>,
    opts: { validate: false },
  ): ProcedureBuilder<
    With<TDef, { outputIn: OutputIn<$S>; outputOut: OutputIn<$S> }>
  >;
  /**
   * Validates the resolver's return value. The resolver returns the schema's
   * input type, and the client receives its output type. For subscriptions it
   * validates each event (the `data` of `tracked()` events). For streamed
   * queries and mutations, `stream(Item, Return?)` validates each item.
   *
   * A procedure has one output: a second `.output()`, or one after a
   * `.concat()` plugin that set an output, is a type error. Inputs merge;
   * outputs don't.
   *
   * @example
   * ```ts
   * t.procedure.output(z.object({ id: z.string() })).query(() => ({ id: '1' }));
   * t.procedure.output(stream(Post)).query(async function* () { yield* posts; });
   * ```
   */
  output<$S extends OutputSchema>(
    schema: $S & OutputCheck<TDef>,
    opts?: { validate?: true },
  ): ProcedureBuilder<
    With<
      TDef,
      {
        outputIn: OutputIn<$S>;
        outputOut: OutputOut<$S>;
        outputValidated: true;
        requires:
          | TDef['requires']
          | Exclude<OutputServices<$S>, TDef['provided']>;
      }
    >
  >;

  /**
   * Declares errors: each gets a typed constructor on the resolver's
   * `errors`, its `data` is validated, and it is documented in OpenAPI.
   * Errors made by the constructors are `defined` even when thrown.
   *
   * @example
   * ```ts
   * t.procedure
   *   .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
   *   .query(({ input, errors }) => {
   *     throw errors.NOT_FOUND({ data: { id: '1' } });
   *   });
   * ```
   */
  errors<const $Map extends ErrorMapInput>(
    map: $Map & ReservedKeyCheck,
  ): ProcedureBuilder<
    With<
      TDef,
      {
        declared: Overwrite<TDef['declared'], DeclaredErrors<$Map>>;
        errors: TDef['errors'] | DeclaredErrors<$Map>[keyof $Map & string];
      }
    >
  >;

  /**
   * Adds middleware. It calls `next()` (optionally with `{ ctx }`), returns
   * `ok(value)` to short-circuit, or returns a `TrpcError`, which becomes
   * part of the procedure's error union.
   *
   * @example
   * ```ts
   * t.procedure.use(async ({ ctx, next }) => {
   *   if (!ctx.user) return error({ code: 'UNAUTHORIZED' });
   *   return next({ ctx: { user: ctx.user } });
   * });
   * ```
   */
  use<
    $Ctx extends object = {},
    $Err extends MiddlewareErrors = never,
    $Ok = never,
    $Input = Unset,
    $Needs extends object = {},
  >(
    fn: MiddlewareFunction<
      CurrentCtx<TDef> & $Needs,
      Value<TDef['inputOut']>,
      TDef['meta'],
      $Ctx,
      $Err,
      $Ok,
      $Input
    > &
      NeedsCheck<CurrentCtx<TDef>, $Needs>,
  ): ProcedureBuilder<
    With<
      TDef,
      {
        ctx: WithNeeds<TDef, $Needs>;
        needs: NeedsAdded<TDef, $Needs>;
        ctxAdded: Overwrite<TDef['ctxAdded'], $Ctx>;
        inputOut: NextInput<TDef['inputOut'], $Input>;
        errors: TDef['errors'] | Extract<$Err, AnyTrpcError>;
        shorts: TDef['shorts'] | $Ok;
      }
    >
  >;
  /**
   * Adds an Effect middleware, made with `t.middleware.effect` or
   * `middleware.effect`. Its failures join the error union and the services
   * it provides are no longer required from the handler's `layer`.
   */
  use<
    $Ctx extends object,
    $Err extends AnyTrpcError,
    $R,
    $Provides,
    $Ok = never,
    $Input = Unset,
    $Needs extends object = {},
  >(
    mw: EffectMiddleware<
      CurrentCtx<TDef> & $Needs,
      Value<TDef['inputOut']>,
      TDef['meta'],
      $Ctx,
      $Err,
      $R,
      $Provides,
      $Ok,
      $Input
    > &
      NeedsCheck<CurrentCtx<TDef>, $Needs>,
  ): ProcedureBuilder<
    With<
      TDef,
      {
        ctx: WithNeeds<TDef, $Needs>;
        needs: NeedsAdded<TDef, $Needs>;
        ctxAdded: Overwrite<TDef['ctxAdded'], $Ctx>;
        inputOut: NextInput<TDef['inputOut'], $Input>;
        errors: TDef['errors'] | $Err;
        shorts: TDef['shorts'] | $Ok;
        provided: TDef['provided'] | $Provides;
        requires: TDef['requires'] | Exclude<$R, TDef['provided']>;
      }
    >
  >;

  /**
   * Provides an Effect service to everything after it: later input schemas,
   * `.provide()` calls and the resolver. The handler's `layer` no longer has
   * to provide it. An Effect factory may only fail with a `TrpcError`.
   *
   * @example
   * ```ts
   * class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}
   *
   * const authed = t.procedure.provide(CurrentUser, ({ ctx }) => ctx.user);
   * authed.query(() => Effect.gen(function* () {
   *   return yield* CurrentUser;
   * }));
   * ```
   */
  provide<$Id, $Shape, $E extends AnyTrpcError = never, $R = never>(
    service: Context.Key<$Id, $Shape>,
    make: (
      opts: ProvideOpts<TDef>,
    ) => MaybePromise<$Shape> | Effect.Effect<$Shape, $E, $R>,
  ): ProcedureBuilder<
    With<
      TDef,
      {
        provided: TDef['provided'] | $Id;
        requires: TDef['requires'] | Exclude<$R, TDef['provided']>;
        errors: TDef['errors'] | $E;
      }
    >
  >;

  /**
   * Sets procedure meta, shallow-merged over earlier meta (keys with a
   * `mergeMeta` function merge through it). Middleware and resolvers
   * receive it.
   *
   * @example
   * ```ts
   * t.procedure.meta({ auth: 'admin' });
   * ```
   */
  meta<const $Meta extends TDef['meta']>(
    meta: $Meta & UndeclaredMeta<TDef['meta'], $Meta>,
  ): ProcedureBuilder<TDef>;

  /**
   * Appends another builder's steps and declared errors, and takes its
   * output. The other builder can come from a different `t`, for example a
   * plugin package: its root ctx and meta are requirements, checked against
   * this builder's current ctx and meta. Both having an output is a type
   * error, as is an `.output()` after a plugin's.
   *
   * @example
   * ```ts
   * // in a package
   * const t = initTrpc<{ ctx: { db: Db } }>();
   * export const audited = t.procedure.use(({ ctx, next }) =>
   *   next({ ctx: { audit: makeAudit(ctx.db) } }),
   * );
   *
   * // in the app
   * app.procedure.concat(audited).mutation(({ ctx }) => ctx.audit.log('…'));
   * ```
   */
  concat<$Plugin extends BuilderDef>(
    plugin: ProcedureBuilder<$Plugin> & ConcatCheck<TDef, $Plugin>,
  ): ProcedureBuilder<
    With<
      TDef,
      {
        ctxAdded: Overwrite<TDef['ctxAdded'], $Plugin['ctxAdded']>;
        inputIn: Merge<TDef['inputIn'], $Plugin['inputIn']>;
        inputOut: Merge<TDef['inputOut'], $Plugin['inputOut']>;
        outputIn: $Plugin['outputIn'] extends Unset
          ? TDef['outputIn']
          : $Plugin['outputIn'];
        outputOut: $Plugin['outputOut'] extends Unset
          ? TDef['outputOut']
          : $Plugin['outputOut'];
        outputValidated: TDef['outputValidated'] | $Plugin['outputValidated'];
        errors: TDef['errors'] | $Plugin['errors'];
        declared: Overwrite<TDef['declared'], $Plugin['declared']>;
        shorts: TDef['shorts'] | $Plugin['shorts'];
        provided: TDef['provided'] | $Plugin['provided'];
        requires:
          | TDef['requires']
          | Exclude<$Plugin['requires'], TDef['provided']>;
      }
    >
  >;

  // The terminals' defs resolve to an object of fields (a member of
  // `ReturnShapes` or `DefShapes`): declaration emit would print an alias
  // with its arguments (the builder state and input schemas), which every
  // package reading the declarations then works out again.

  /**
   * A read. The resolver can return a value, a `Promise`, an `Effect`, or a
   * `TrpcError`. Outputs may contain `Promise`s and `AsyncIterable`s, which
   * stream to the client.
   *
   * @example
   * ```ts
   * t.procedure.input(z.object({ id: z.string() })).query(({ input }) => db.find(input.id));
   * ```
   */
  query<$Ret extends ReturnsFor<TDef>>(
    resolver: (opts: ResolverOpts<TDef>) => ResolverReturn<TDef, $Ret>,
  ): QueryProcedure<ReturnDef<TDef, $Ret>>;

  /**
   * A write. Same resolver forms as `query`.
   *
   * @example
   * ```ts
   * t.procedure.input(z.object({ title: z.string() })).mutation(({ input }) => db.create(input));
   * ```
   */
  mutation<$Ret extends ReturnsFor<TDef>>(
    resolver: (opts: ResolverOpts<TDef>) => ResolverReturn<TDef, $Ret>,
  ): MutationProcedure<ReturnDef<TDef, $Ret>>;

  /**
   * A stream of events, over SSE (or a WebSocket). The resolver returns an
   * `AsyncIterable` (an `async function*`) or an Effect `Stream`. Wrap events
   * in `tracked()` so clients can resume.
   *
   * @example
   * ```ts
   * t.procedure.subscription(async function* ({ signal }) {
   *   for await (const post of posts.on('add', { signal })) yield tracked(post.id, post);
   * });
   * ```
   */
  subscription<$Ret extends YieldsFor<TDef>>(
    resolver: (
      opts: SubscriptionResolverOpts<TDef>,
    ) => SubscriptionReturn<TDef, $Ret>,
  ): SubscriptionProcedure<BuiltDef<StreamFields<TDef, $Ret>>>;
}

/**
 * Part of inferred procedure types; exported so they stay nameable.
 * @since 0.1.0
 * @stability stable
 */
// Spelled out rather than a `With`: every procedure with an input makes one,
// and a mapped type costs a conditional per key.
export type InputDef<TDef extends BuilderDef, $S extends AnySchema> = {
  ctx: TDef['ctx'];
  needs: TDef['needs'];
  ctxAdded: TDef['ctxAdded'];
  meta: TDef['meta'];
  inputIn: Merge<TDef['inputIn'], InOf<$S>>;
  inputOut: Merge<TDef['inputOut'], OutOf<$S>>;
  outputIn: TDef['outputIn'];
  outputOut: TDef['outputOut'];
  outputValidated: TDef['outputValidated'];
  errors: TDef['errors'] | SchemaValidationError<$S>;
  declared: TDef['declared'];
  shorts: TDef['shorts'];
  provided: TDef['provided'];
  requires: TDef['requires'] | Exclude<SchemaServices<$S>, TDef['provided']>;
};

/**
 * Any procedure builder.
 * @since 0.1.0
 * @stability stable
 */
export type AnyProcedureBuilder = ProcedureBuilder<any>;

const sameStep = (a: Step, b: Step): boolean =>
  Match.value(a).pipe(
    Match.discriminatorsExhaustive('kind')({
      use: (use) => b.kind === 'use' && use.fn === b.fn,
      input: (input) => b.kind === 'input' && input.arg === b.arg,
      provide: (provide) =>
        b.kind === 'provide' &&
        provide.key === b.key &&
        provide.make === b.make,
    }),
  );

/**
 * `before` then `after`, minus the leading steps of `after` that `before`
 * also starts with: a plugin built on the same middleware as the app runs
 * that middleware once.
 * @internal
 */
export function appendSteps(
  before: ReadonlyArray<Step>,
  after: ReadonlyArray<Step>,
): ReadonlyArray<Step> {
  let shared = 0;
  while (
    shared < before.length &&
    shared < after.length &&
    sameStep(before[shared]!, after[shared]!)
  ) {
    shared++;
  }
  return [...before, ...after.slice(shared)];
}

/** @internal */
export function createBuilder(
  internals: BuilderInternals,
): AnyProcedureBuilder {
  const add = (step: Step) =>
    createBuilder({ ...internals, steps: [...internals.steps, step] });
  const build =
    (type: ProcedureType) =>
    (resolver?: (opts: any) => unknown): any => ({
      '~trpc': {
        type,
        meta: internals.meta,
        steps: internals.steps,
        output: internals.output,
        validateOutput: internals.validateOutput,
        errors: internals.errors,
        warnThrown: internals.warnThrown,
        resolver,
      },
    });
  return {
    '~trpc': internals,
    input: (arg: AnySchema | ((opts: any) => AnySchema)) =>
      add({ kind: 'input', arg }),
    output: (schema: AnySchema, opts?: { validate?: boolean }) => {
      if (internals.output !== undefined) {
        throw new Error('output: this procedure already has an output');
      }
      return createBuilder({
        ...internals,
        output: schema,
        validateOutput: opts?.validate === false ? false : undefined,
      });
    },
    errors: (map: ErrorMap) =>
      createBuilder({ ...internals, errors: { ...internals.errors, ...map } }),
    use: (mw: unknown) =>
      isEffectMiddleware(mw)
        ? add({ kind: 'use', fn: mw['~effectMiddleware'], effect: true })
        : add({ kind: 'use', fn: mw as (opts: any) => unknown }),
    provide: (key: Context.Key<any, any>, make: (opts: any) => unknown) =>
      add({ kind: 'provide', key, make }),
    meta: (meta: object) =>
      createBuilder({
        ...internals,
        meta: mergeMeta(internals.mergeMeta, internals.meta, meta),
      }),
    concat: (plugin: AnyProcedureBuilder) => {
      const other = plugin['~trpc'];
      if (other.output !== undefined && internals.output !== undefined) {
        throw new Error(
          'concat: this procedure and the plugin both have an output',
        );
      }
      return createBuilder({
        ...internals,
        steps: appendSteps(internals.steps, other.steps),
        errors: { ...internals.errors, ...other.errors },
        ...(other.output === undefined
          ? {}
          : { output: other.output, validateOutput: other.validateOutput }),
      });
    },
    query: build('query'),
    mutation: build('mutation'),
    subscription: build('subscription'),
  } as AnyProcedureBuilder;
}
