import type { BuiltinErrorCode, TrpcError } from '../internal/error.ts';
import type { Deserialized, IsAny } from '../internal/types.ts';
import type { AnyProcedure, Procedure } from '../server/procedure.ts';
import type { Unlazy } from '../server/router.ts';
import type {
  AnyLink,
  DeclContext,
  TrpcClientContext,
  TrpcLink,
} from './link.ts';

/**
 * A typed (`defined`) error from a procedure's union.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type DefinedError<E> =
  E extends TrpcError<infer C, infer D>
    ? TrpcError<C, D> & { readonly defined: true }
    : never;

/**
 * Anything outside the typed union: thrown errors, masked internal errors,
 * network failures (`NETWORK_ERROR`) and aborts (`CLIENT_CLOSED_REQUEST`).
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type UnexpectedError = TrpcError<
  BuiltinErrorCode | (string & {}),
  unknown
> & { readonly defined: false };

/**
 * What a call can fail with. Narrow with `error.defined` first, then `code`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ClientError<E> = DefinedError<E> | UnexpectedError;

/**
 * A call's `Promise`, carrying its error type for `safe()`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcPromise<T, E> extends Promise<T> {
  readonly '~error'?: E;
}

/**
 * A subscription: iterate it with `for await`. Breaking out of the loop, or
 * aborting `signal`, closes the connection.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcSubscription<T, E> extends AsyncIterable<T> {
  readonly '~error'?: E;
}

/**
 * Options for `query()` and `mutate()` (16 CS-A): `signal`, plus the fields
 * links read (17 F-B), typed from the links with `router:`.
 *
 * @example
 * ```ts
 * await client.post.byId.query({ id }, { signal, headers, dedupe: false });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type CallOptions<TContext extends object = {}> = {
  signal?: AbortSignal | undefined;
} & TrpcClientContext &
  TContext;

/**
 * Options for `subscribe()`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type SubscribeOptions<TContext extends object = {}> =
  CallOptions<TContext> & {
    /** Resume after this `tracked()` event id. */
    lastEventId?: string | undefined;
  };

/** @internal */
export type CallArgs<TInput, TOpts> = undefined extends TInput
  ? [input?: TInput, opts?: TOpts]
  : [input: TInput, opts?: TOpts];

/**
 * The client methods for one procedure.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type DecorateProcedure<P, TContext extends object = {}> =
  P extends Procedure<infer D>
    ? D['type'] extends 'query'
      ? {
          query(
            ...args: CallArgs<D['input'], CallOptions<TContext>>
          ): TrpcPromise<Deserialized<D['output']>, ClientError<D['errors']>>;
        }
      : D['type'] extends 'mutation'
        ? {
            mutate(
              ...args: CallArgs<D['input'], CallOptions<TContext>>
            ): TrpcPromise<Deserialized<D['output']>, ClientError<D['errors']>>;
          }
        : {
            subscribe(
              ...args: CallArgs<D['input'], SubscribeOptions<TContext>>
            ): TrpcSubscription<
              Deserialized<D['output']>,
              ClientError<D['errors']>
            >;
          }
    : never;

/**
 * The typed client for a router.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TrpcClient<TRouter, TContext extends object = {}> = {
  [K in keyof TRouter]: TRouter[K] extends AnyProcedure
    ? DecorateProcedure<TRouter[K], TContext>
    : TrpcClient<Unlazy<TRouter[K]>, TContext>;
};

declare const routerTypeBrand: unique symbol;

/**
 * A value that carries a router type and nothing else (17 D-C). Made by
 * {@link routerType}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface RouterType<TRouter> {
  readonly [routerTypeBrand]: TRouter;
}

/**
 * Carries a router type into `createTrpcClient({ router })` (17 D-C), so
 * the client also infers what its links declare. Nothing about the router
 * exists at runtime.
 *
 * @example
 * ```ts
 * const client = createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [dedupeLink(), httpLink({ url })],
 * });
 * await client.post.byId.query({ id: '1' }, { dedupe: false });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function routerType<TRouter>(): RouterType<TRouter> {
  return {} as RouterType<TRouter>;
}

/**
 * The router a `router:` value describes: a {@link RouterType}, a contract
 * or a router.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type RouterOf<TSource> =
  TSource extends RouterType<infer TRouter> ? TRouter : TSource;

type UnionToIntersection<U> = (
  U extends unknown ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never;

type DeclOf<TLink> =
  TLink extends TrpcLink<infer D, any>
    ? IsAny<D> extends true
      ? never
      : D
    : never;

/**
 * The call option fields every link in `TLinks` declares, merged.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type LinksContext<TLinks extends ReadonlyArray<AnyLink>> = [
  DeclOf<TLinks[number]>,
] extends [never]
  ? {}
  : {
      [
        K in keyof UnionToIntersection<DeclContext<DeclOf<TLinks[number]>>>
      ]: UnionToIntersection<DeclContext<DeclOf<TLinks[number]>>>[K];
    };

type SwitchesOf<TLink> =
  DeclOf<TLink> extends infer D
    ? D extends { switches: infer S extends string }
      ? S
      : never
    : never;

type DuplicateSwitch<
  TLinks,
  TSeen extends string = never,
> = TLinks extends readonly [infer H, ...infer R]
  ? [SwitchesOf<H> & TSeen] extends [never]
    ? DuplicateSwitch<R, TSeen | SwitchesOf<H>>
    : SwitchesOf<H> & TSeen
  : never;

/**
 * A type error on `links` when two `switchLink`s on the chain share a name.
 * @internal
 */
export type DuplicateSwitchCheck<TLinks> = [DuplicateSwitch<TLinks>] extends [
  never,
]
  ? unknown
  : {
      links: `Two switchLinks on one chain are named "${DuplicateSwitch<TLinks>}"`;
    };

/**
 * Every procedure path of a router, `'post.byId'`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type RouterPaths<TRouter, TPrefix extends string = ''> =
  IsAny<TRouter> extends true
    ? string
    : {
        [K in keyof TRouter & string]: TRouter[K] extends AnyProcedure
          ? `${TPrefix}${K}`
          : RouterPaths<Unlazy<TRouter[K]>, `${TPrefix}${K}.`>;
      }[keyof TRouter & string];
