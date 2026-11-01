/**
 * The API `.agent-docs/open/link-service-requirements.md` proposes, as
 * types: B adds `services` to `LinkDecl`, so an Effect client's calls
 * require them and a Promise client takes a `runtime` that provides them.
 * A is `link()` as it is.
 */
import type {
  AnyTrpcError,
  AtLeastOneLink,
  EffectLinkOpts,
  LinkDecl,
  LinksContext,
  LinksTypes,
  RouterOf,
  TrpcClient,
  TrpcLink,
  TypedClientOptions,
} from '@trpc12/trpc/client';
import type { EffectClient } from '@trpc12/trpc/effect';
import type { Effect, ManagedRuntime, Stream } from 'effect';

/** B: what a link declares, `services` included. */
export interface LinkDeclB extends LinkDecl {
  /** Effect services the link reads from the caller. */
  services?: unknown;
}

type DeclServices<D> = D extends { services: infer S } ? S : never;
type DeclContext<D> = D extends { context: infer C extends object } ? C : {};

/** B: a link, with the services it declares. */
export type TrpcLinkB<D extends LinkDeclB> = TrpcLink<Omit<D, 'services'>> & {
  readonly '~services'?: DeclServices<D>;
};

/** B: `link()`, whose stream may require the services it declares. */
export declare function linkB<D extends LinkDeclB = {}>(
  fn: (
    opts: EffectLinkOpts<DeclContext<D>>,
  ) => Stream.Stream<unknown, AnyTrpcError, DeclServices<D>>,
): TrpcLinkB<D>;

/** The services the links in a chain declare. */
export type LinksServicesB<L> = L extends { readonly '~services'?: infer S }
  ? unknown extends S
    ? never
    : Exclude<S, undefined>
  : never;

/** B: every call's `Effect` and `Stream` require `R`. */
export type WithServicesB<T, R> = [R] extends [never]
  ? T
  : {
      [K in keyof T]: T[K] extends (
        ...args: infer A
      ) => Effect.Effect<infer V, infer E, infer _>
        ? (...args: A) => Effect.Effect<V, E, R>
        : T[K] extends (
              ...args: infer A
            ) => Stream.Stream<infer V, infer E, infer _>
          ? (...args: A) => Stream.Stream<V, E, R>
          : WithServicesB<T[K], R>;
    };

export declare function createEffectClientB<
  TSource,
  const TLinks extends AtLeastOneLink<RouterOf<TSource>>,
>(
  opts: TypedClientOptions<TSource, TLinks>,
): WithServicesB<
  EffectClient<RouterOf<TSource>, LinksContext<TLinks>, LinksTypes<TLinks>>,
  LinksServicesB<TLinks[number]>
>;

/** B: a Promise client's `runtime`, required exactly when a link declares services. */
export type RuntimeForLinksB<R> = {
  runtime?: ManagedRuntime.ManagedRuntime<R, unknown>;
} & ([R] extends [never] ? {} : { runtime: unknown });

export declare function createTrpcClientB<
  TSource,
  const TLinks extends AtLeastOneLink<RouterOf<TSource>>,
>(
  opts: TypedClientOptions<TSource, TLinks> &
    RuntimeForLinksB<LinksServicesB<TLinks[number]>>,
): TrpcClient<
  RouterOf<TSource>,
  LinksContext<TLinks>,
  undefined,
  LinksTypes<TLinks>
>;
