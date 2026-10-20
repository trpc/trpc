/**
 * Effect-native client: calls return an `Effect`, subscriptions a `Stream`.
 * Its links run on Effect: `link()` makes them, and `httpStreamLink` is the
 * HTTP one. Promise links (`httpLink`, `promiseLink()`) work too, as one step
 * the Effect runtime can't see into.
 * The server side of Effect (Effect resolvers, `.provide()`, Effect Schema
 * inputs, the handler's `layer`) lives in `@trpc12/trpc/server`.
 *
 * @example
 * ```ts
 * import { createEffectClient } from '@trpc12/trpc/effect';
 *
 * const client = createEffectClient({
 *   router: routerType<AppRouter>(),
 *   links: [httpStreamLink({ url })],
 * });
 * const program = Effect.gen(function* () {
 *   const post = yield* client.post.byId.query({ id: '1' });
 * });
 * ```
 * @module
 */
import { Data, Stream, type Effect } from 'effect';
import { makeErrorsYieldable } from '../internal/error.ts';
import {
  createRecursiveProxy,
  makeOperation,
  splitCallOptions,
} from '../client/client.ts';
import type {
  TrpcClientOptions,
  TypedClientOptions,
} from '../client/client.ts';
import {
  chainSwitchNames,
  firstValue,
  link,
  runOperation,
  type AtLeastOneLink,
} from '../client/link.ts';
import type {
  CallArgs,
  StreamedError,
  Streamed,
  SubscriptionError,
  UnstreamedLinkCodes,
  ChainErrors,
  ClientError,
  DefinedError,
  CallOptions,
  Carries,
  ChainTypes,
  DuplicateSwitchCheck,
  LinksContext,
  LinksTypes,
  NoLinkCarries,
  ProcedureCallArgs,
  ResultForm,
  RouterOf,
  SubscribeOptions,
  UnmetNeedCheck,
} from '../client/types.ts';
import type { ClientValue } from '../internal/types.ts';
import type {
  AnyProcedure,
  ProcedureDef,
  ProcedureDefOf,
  Unlazy,
} from '../server/procedures/index.ts';

export { link };
export { httpStreamLink } from '../client/links/index.ts';

/**
 * The Effect client methods for one procedure.
 * @since 0.1.0
 * @stability stable
 */
export type DecorateEffectProcedure<
  P,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> = P extends AnyProcedure
  ? DecorateEffectDef<ProcedureDefOf<P>, TContext, TLinks>
  : never;

type DecorateEffectDef<
  D extends ProcedureDef,
  TContext extends object,
  TLinks extends ChainTypes,
> =
  Carries<D['type'], TLinks> extends false
    ? NoLinkCarries<D['type']>
    : DecorateEffectCarried<D, TContext, TLinks>;

/** A query's or mutation's Effect for a streamed output, as on the Promise client. */
type StreamedEffect<V, E> = Effect.Effect<Streamed<V, E>, E>;

type DecorateEffectCarried<
  D extends ProcedureDef,
  TContext extends object,
  TLinks extends ChainTypes,
> = D['type'] extends 'query'
  ? {
      query(
        ...args: ProcedureCallArgs<
          D['input'],
          D['output'],
          CallOptions<TContext>,
          TLinks
        >
      ): D['output'] extends AsyncIterable<any>
        ? StreamedEffect<
            ClientValue<D['output'], ResultForm<undefined, TLinks>>,
            StreamedError<D, ResultForm<undefined, TLinks>, TLinks>
          >
        : Effect.Effect<
            ClientValue<D['output'], ResultForm<undefined, TLinks>>,
            | ClientError<
                D['errors'],
                ResultForm<undefined, TLinks>,
                UnstreamedLinkCodes<TLinks>
              >
            | DefinedError<ChainErrors<TLinks>>
          >;
    }
  : D['type'] extends 'mutation'
    ? {
        mutate(
          ...args: ProcedureCallArgs<
            D['input'],
            D['output'],
            CallOptions<TContext>,
            TLinks
          >
        ): D['output'] extends AsyncIterable<any>
          ? StreamedEffect<
              ClientValue<D['output'], ResultForm<undefined, TLinks>>,
              StreamedError<D, ResultForm<undefined, TLinks>, TLinks>
            >
          : Effect.Effect<
              ClientValue<D['output'], ResultForm<undefined, TLinks>>,
              | ClientError<
                  D['errors'],
                  ResultForm<undefined, TLinks>,
                  UnstreamedLinkCodes<TLinks>
                >
              | DefinedError<ChainErrors<TLinks>>
            >;
      }
    : {
        subscribe(
          ...args: CallArgs<D['input'], SubscribeOptions<TContext>>
        ): Stream.Stream<
          ClientValue<D['output'], ResultForm<undefined, TLinks>>,
          SubscriptionError<D, ResultForm<undefined, TLinks>, TLinks>
        >;
      };

/**
 * The Effect client for a router.
 * @since 0.1.0
 * @stability stable
 */
export type EffectClient<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> = {
  [K in keyof TRouter]: TRouter[K] extends AnyProcedure
    ? DecorateEffectProcedure<TRouter[K], TContext, TLinks>
    : EffectClient<Unlazy<TRouter[K]>, TContext, TLinks>;
};

const METHODS = {
  query: 'query',
  mutate: 'mutation',
  subscribe: 'subscription',
} as const;

/**
 * Creates a client whose calls are Effects. Interrupting the fiber aborts the
 * request. A call fails with the same errors as the Promise client's, and
 * an error's `_tag` is its code, so `Effect.catchTag` takes a code out of
 * the union. It also catches the built-in error with that code, whose
 * `defined` is `false`.
 *
 * @example
 * ```ts
 * const client = createEffectClient({
 *   router: routerType<AppRouter>(),
 *   links: [httpStreamLink({ url })],
 * });
 * const post = yield* client.post.byId.query({ id: '1' }).pipe(
 *   Effect.catchTag('NOT_FOUND', () => Effect.succeed(null)),
 * );
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createEffectClient<
  TSource,
  const TLinks extends AtLeastOneLink<RouterOf<TSource>>,
>(
  opts: TypedClientOptions<TSource, TLinks> &
    DuplicateSwitchCheck<TLinks> &
    UnmetNeedCheck<TLinks>,
): EffectClient<RouterOf<TSource>, LinksContext<TLinks>, LinksTypes<TLinks>>;
export function createEffectClient(opts: TrpcClientOptions): unknown {
  makeErrorsYieldable(Data.Error);
  chainSwitchNames(opts.links);
  return createRecursiveProxy((path, args) => {
    const method = path.at(-1) as keyof typeof METHODS | undefined;
    const type = method ? METHODS[method] : undefined;
    if (!type) {
      throw new TypeError(
        `Call .query(), .mutate() or .subscribe() on a procedure, not ${path.join('.')}()`,
      );
    }
    const [input, callOpts] = args as [
      unknown,
      SubscribeOptions<object> | undefined,
    ];
    const procedurePath = path.slice(0, -1).join('.');
    const callOptions = splitCallOptions(callOpts);
    // Each run is its own operation, with its own id: socket links match
    // responses by id, and an Effect may run more than once (`Effect.retry`).
    const stream = Stream.suspend(() =>
      runOperation(
        opts.links,
        makeOperation(type, procedurePath, input, callOptions),
      ),
    );
    return type === 'subscription' ? stream : firstValue(stream);
  });
}
