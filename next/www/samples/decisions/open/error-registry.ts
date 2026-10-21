/**
 * The APIs `.agent-docs/open/error-registry.md` proposes, as types. Each is
 * built in `spikes/error-registry/`. A is v12 as it is and has none. B to G
 * share the error and client types: errors have a `_tag` and no `code`, and
 * every call through a client fails with the whole registry's union plus
 * tRPC's own failures.
 */
import type { Effect, Schema } from 'effect';
import type {
  MutationOptionsOut,
  QueryOptionsOut,
} from '@trpc12/tanstack-query';
import type { AnyLink } from '@trpc12/trpc/client';
import type {
  AnyProcedure,
  AnyRouter,
  BuiltinErrorCode,
  inferRouterErrors,
  ProcedureDef,
  StandardSchemaV1,
  TaggedErrorClass,
} from '@trpc12/trpc/server';
import type { ReactNode } from 'react';

/** What a registry declares for one error, once for the whole backend. */
export interface ErrorSpec {
  readonly status: number;
  readonly data?: StandardSchemaV1;
  readonly message?: string;
  /** OpenAPI's response description. */
  readonly description?: string;
  /** Whether `retryLink` may retry a call that failed with it. */
  readonly retry?: boolean;
}

/** One error: its tag is its only name. */
export interface RegistryError<
  TTag extends string,
  TData = undefined,
> extends Error {
  readonly _tag: TTag;
  readonly status: number;
  readonly data: TData;
}

type DataOf<S> = S extends { readonly data: StandardSchemaV1<any, infer O> }
  ? O
  : undefined;
type DataArgs<S> = S extends { readonly data: StandardSchemaV1<infer I, any> }
  ? [data: I, options?: ErrorOptions]
  : [options?: ErrorOptions];

export interface ErrorClass<TTag extends string, TSpec extends ErrorSpec> {
  new (...args: DataArgs<TSpec>): RegistryError<TTag, DataOf<TSpec>>;
  readonly tag: TTag;
  readonly spec: TSpec;
}

export type Registry<M extends Record<string, ErrorSpec>> = {
  readonly [K in keyof M & string]: ErrorClass<K, M[K]>;
};

type InstanceOf<C> = C extends abstract new (...args: any) => infer I
  ? I
  : never;
export type ErrorsOf<R> = InstanceOf<R[keyof R]>;

/** tRPC's own failures, a registry like the app's. */
export type TrpcFailure =
  | RegistryError<
      'InvalidInput',
      { readonly issues: ReadonlyArray<{ readonly message: string }> }
    >
  | RegistryError<'ProcedureNotFound'>
  | RegistryError<'ProcedureTypeMismatch'>
  | RegistryError<'MalformedRequest'>
  | RegistryError<'PayloadTooLarge'>
  | RegistryError<'Internal'>
  | RegistryError<'UnknownError', { readonly tag: string }>
  | RegistryError<'UnexpectedStatus', { readonly status: number }>
  | RegistryError<'NetworkError'>
  | RegistryError<'BadResponse'>
  | RegistryError<'Timeout'>
  | RegistryError<'Aborted'>
  | RegistryError<'StreamInterrupted'>;

/** What `matchError()` sends to `unexpected` unless a handler names it. */
type UnexpectedTag = Exclude<
  TrpcFailure['_tag'],
  'NetworkError' | 'BadResponse'
>;

declare const errorsKey: unique symbol;
/** A router typed with the errors its calls fail with. */
export type Scoped<E> = { readonly [errorsKey]: (errors: E) => void };
type ScopeOf<R, E> = R extends Scoped<infer S> ? S | E : E;
type ErrorsOfRouter<R> = R extends Scoped<infer E> ? E : never;

export interface RegistryPromise<T, E> extends Promise<T> {
  readonly '~error'?: E;
}
type Args<I> = undefined extends I ? [input?: I] : [input: I];
type Def<P extends AnyProcedure> = NonNullable<P['~trpc']['~types']>;
type Call<D extends ProcedureDef, E> = D['type'] extends 'mutation'
  ? { mutate(...args: Args<D['input']>): RegistryPromise<D['output'], E> }
  : { query(...args: Args<D['input']>): RegistryPromise<D['output'], E> };
type EffectCall<D extends ProcedureDef, E> = D['type'] extends 'mutation'
  ? { mutate(...args: Args<D['input']>): Effect.Effect<D['output'], E> }
  : { query(...args: Args<D['input']>): Effect.Effect<D['output'], E> };

export type RegistryClient<R, E> = {
  [K in keyof R & string]: R[K] extends AnyProcedure
    ? Call<Def<R[K]>, E>
    : RegistryClient<R[K], ScopeOf<R[K], E>>;
};
export type RegistryEffectClient<R, E> = {
  [K in keyof R & string]: R[K] extends AnyProcedure
    ? EffectCall<Def<R[K]>, E>
    : RegistryEffectClient<R[K], ScopeOf<R[K], E>>;
};

interface ClientOptions<TErrors> {
  readonly links: ReadonlyArray<AnyLink>;
  /** The registry at runtime, to rebuild its classes. */
  readonly errors: TErrors;
}

/** `[data, error]`, the error typed with the call's union. */
export declare function safe<T, E>(
  promise: RegistryPromise<T, E>,
): Promise<[data: T, error: undefined] | [data: undefined, error: E]>;

type Tagged = { readonly _tag: string };
type Keyed<E extends Tagged> = {
  [M in E as M['_tag'] extends UnexpectedTag ? never : M['_tag']]: (
    e: M,
  ) => unknown;
};
type Optional<E extends Tagged> = {
  [M in E as M['_tag'] extends UnexpectedTag ? M['_tag'] : never]?: (
    e: M,
  ) => unknown;
};
type Rest<E extends Tagged> = [Extract<E, { _tag: UnexpectedTag }>] extends [
  never,
]
  ? {}
  : { unexpected: (e: Extract<E, { _tag: UnexpectedTag }>) => unknown };
type Handlers<E extends Tagged> = Keyed<E> & Optional<E> & Rest<E>;
type Leftover<K extends PropertyKey> = {
  [P in K]: `'${P & string}' handles no error of this call`;
};
type ResultOf<H> = {
  [K in keyof H]: H[K] extends (...args: any) => infer R ? R : never;
}[keyof H];

/** Exhaustive by `_tag`; tRPC's server-side failures go to `unexpected`. */
export declare function matchError<
  E extends Tagged,
  const H extends Handlers<E>,
>(
  err: E,
  handlers: H & Leftover<Exclude<keyof H, keyof Handlers<E>>>,
): ResultOf<H>;

/** B: one object of specs; each key is a tag. */
export declare function createErrorsB<
  const M extends Record<string, ErrorSpec>,
>(specs: M): Registry<M>;
/** B: the root router, typed with every error its calls can fail with. */
export declare function withErrorsB<E, R extends AnyRouter>(
  errors: E,
  router: R,
): R & Scoped<ErrorsOf<E> | TrpcFailure>;
export declare function createClientB<R>(
  opts: ClientOptions<unknown>,
): RegistryClient<R, ErrorsOfRouter<R>>;
export declare function createEffectClientB<R>(
  opts: ClientOptions<unknown>,
): RegistryEffectClient<R, ErrorsOfRouter<R>>;

/** C: a `Schema.TaggedError` class, its status in `httpApiStatus`. */
type AnyTaggedClass = Schema.Top & {
  readonly identifier: string;
} & (abstract new (...args: any) => { readonly _tag: string });
export interface TaggedRegistry<C extends ReadonlyArray<AnyTaggedClass>> {
  readonly classes: C;
  /** Promise middleware that sends a registered error instead of masking it. */
  readonly bridge: <O extends { readonly next: () => Promise<unknown> }>(
    opts: O,
  ) => ReturnType<O['next']>;
}
export declare function taggedErrorsC<
  const C extends ReadonlyArray<AnyTaggedClass>,
>(...classes: C): TaggedRegistry<C>;
export declare function withErrorsC<
  C extends ReadonlyArray<AnyTaggedClass>,
  R extends AnyRouter,
>(
  errors: TaggedRegistry<C>,
  router: R,
): R & Scoped<InstanceType<C[number]> | TrpcFailure>;
export declare function createClientC<R>(
  opts: ClientOptions<TaggedRegistry<ReadonlyArray<AnyTaggedClass>>>,
): RegistryClient<R, ErrorsOfRouter<R>>;

/** D: a chain; a tag added twice is a type error. */
export type ErrorsBuilder<M> = M & {
  add<const T extends string, const S extends ErrorSpec>(
    tag: T extends keyof M ? `'${T}' is already in the registry` : T,
    spec: S,
  ): ErrorsBuilder<M & { readonly [K in T]: ErrorClass<T, S> }>;
  extend<N>(other: ErrorsBuilder<N>): ErrorsBuilder<M & N>;
};
export declare function errorsD(): ErrorsBuilder<{}>;
export declare const withErrorsD: typeof withErrorsB;
export declare const createClientD: typeof createClientB;

type Merge<Rs> = Rs extends readonly [infer H, ...infer T] ? H & Merge<T> : {};
type Overlap<Rs, Seen = never> = Rs extends readonly [infer H, ...infer T]
  ? (keyof H & Seen) | Overlap<T, Seen | keyof H>
  : never;
type NoDuplicates<Rs> = [Overlap<Rs>] extends [never]
  ? unknown
  : { readonly '~duplicate': `'${Overlap<Rs> & string}' is in two registries` };

/** E: a registry per module, merged for OpenAPI and the client. */
export declare const createErrorsE: typeof createErrorsB;
export declare function mergeErrorsE<const Rs extends ReadonlyArray<object>>(
  ...registries: Rs & NoDuplicates<Rs>
): Merge<Rs>;
/** E: a subtree whose calls also fail with `errors`. */
export declare function scopeE<E, R extends AnyRouter>(
  errors: E,
  router: R,
): R & Scoped<ErrorsOf<E>>;
export declare const withErrorsE: typeof withErrorsB;
export declare const createClientE: typeof createClientB;

/**
 * F: the program's errors, which each module adds to with
 * `declare module` (the package's own interface, in the real API).
 */
export interface Errors {}
type WithFailures<E> = E | TrpcFailure;
export declare const createErrorsF: typeof createErrorsB;
export declare function createClientF<R>(
  opts: ClientOptions<unknown>,
): RegistryClient<R, WithFailures<ErrorsOf<Errors>>>;

/**
 * G: one class per error and no registry around them; a v12 error class,
 * since the router's union is what its resolvers return.
 */
export declare function defineErrorG<
  const TTag extends string,
  const TSpec extends ErrorSpec,
>(
  tag: TTag,
  spec: TSpec,
): TaggedErrorClass<TTag, TSpec['data'], TSpec['status'], TTag>;
export declare function createClientG<R>(
  opts: ClientOptions<unknown>,
): RegistryClient<
  R,
  | Exclude<inferRouterErrors<R>, { readonly code: BuiltinErrorCode }>
  | TrpcFailure
>;

/**
 * E's error boundaries: `createErrorBoundary` as
 * `packages/tanstack-react-query/src/error-boundary.ts` builds it, with
 * claims by tag, checked against a registry, and the fallback's `error`
 * typed with what it claims (`spikes/error-registry/boundaries/`).
 */
type TagOf<R> = (keyof R & string) | TrpcFailure['_tag'];
type Owned<TTags extends string, TUnexpected extends boolean> =
  | TTags
  | (TUnexpected extends true ? UnexpectedTag : never);
type Remaining<E, TTags extends string, TUnexpected extends boolean> = Exclude<
  E,
  { readonly _tag: Owned<TTags, TUnexpected> }
>;

declare const owned: unique symbol;
interface RegistryBoundary<TTags extends string, TUnexpected extends boolean> {
  (props: { readonly children?: ReactNode }): ReactNode;
  readonly [owned]: {
    readonly tags: TTags;
    readonly unexpected: TUnexpected;
  };
}
interface RegistryBoundaryOptions<
  TTags extends string,
  TUnexpected extends boolean,
> {
  query<TQueryFnData, TError, TData>(
    options: QueryOptionsOut<TQueryFnData, TError, TData>,
  ): QueryOptionsOut<
    TQueryFnData,
    Remaining<TError, TTags, TUnexpected>,
    TData
  >;
  mutation<TInput, TOutput, TError, TOnMutateResult>(
    options: MutationOptionsOut<TInput, TOutput, TError, TOnMutateResult>,
  ): MutationOptionsOut<
    TInput,
    TOutput,
    Remaining<TError, TTags, TUnexpected>,
    TOnMutateResult
  >;
  owns(error: unknown): boolean;
}

export declare function createErrorBoundaryE<
  const R extends object,
  const TTags extends TagOf<R>,
  TUnexpected extends boolean = false,
  TParentTags extends string = never,
  TParentUnexpected extends boolean = false,
>(spec: {
  readonly name: string;
  /** The registry claims are checked against: the merged one, or a module's. */
  readonly errors: R;
  readonly parent?: RegistryBoundary<TParentTags, TParentUnexpected>;
  readonly claims: ReadonlyArray<TTags>;
  /** Owns tRPC's failures that nothing names: `Internal`, `Timeout`, … */
  readonly unexpected?: TUnexpected;
  readonly fallback: (props: {
    readonly error: Extract<
      ErrorsOf<R> | TrpcFailure,
      { readonly _tag: Owned<TTags, TUnexpected> }
    >;
    readonly reset: () => void;
  }) => ReactNode;
}): readonly [
  Boundary: RegistryBoundary<
    TTags | TParentTags,
    TUnexpected extends true ? true : TParentUnexpected
  >,
  useBoundary: () => RegistryBoundaryOptions<
    TTags | TParentTags,
    TUnexpected extends true ? true : TParentUnexpected
  >,
];

type ProcedureOptions<D extends ProcedureDef, E> = D['type'] extends 'mutation'
  ? {
      mutationOptions(): MutationOptionsOut<
        D['input'],
        D['output'],
        E,
        unknown
      >;
    }
  : {
      queryOptions(opts: {
        readonly input: D['input'];
      }): QueryOptionsOut<D['output'], E, D['output']>;
    };
type RegistryQueryUtils<R, E> = {
  [K in keyof R & string]: R[K] extends AnyProcedure
    ? ProcedureOptions<Def<R[K]>, E>
    : RegistryQueryUtils<R[K], ScopeOf<R[K], E>>;
};

/** E: `createTrpcContext`, its options typed with each call's scope. */
export declare function createTrpcContextE<R>(): readonly [
  Provider: (props: { readonly children?: ReactNode }) => ReactNode,
  useTrpc: () => RegistryQueryUtils<R, ErrorsOfRouter<R>>,
];
