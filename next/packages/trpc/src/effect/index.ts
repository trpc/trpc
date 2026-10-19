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
import type { Effect } from 'effect';
import { Stream } from 'effect';
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
  type TrpcLink,
  type PromiseLink,
} from '../client/link.ts';
import type {
  CallArgs,
  CallOptions,
  Carries,
  ChainLinkCodes,
  ChainTypes,
  ClientError,
  DuplicateSwitchCheck,
  LinksContext,
  LinksTypes,
  ProcedureCallArgs,
  ResultForm,
  RouterOf,
  SubscribeOptions,
} from '../client/types.ts';
import type { ClientValue, DansonForm } from '../internal/types.ts';
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
    ? {}
    : DecorateEffectCarried<
        D,
        TContext,
        TLinks,
        TLinks extends { errors: infer E } ? E : never
      >;

type DecorateEffectCarried<
  D extends ProcedureDef,
  TContext extends object,
  TLinks extends ChainTypes,
  TLinkErrors,
> = D['type'] extends 'query'
  ? {
      query(
        ...args: ProcedureCallArgs<
          D['input'],
          D['output'],
          CallOptions<TContext>,
          TLinks
        >
      ): Effect.Effect<
        ClientValue<D['output'], ResultForm<undefined, TLinks>>,
        ClientError<
          D['errors'] | TLinkErrors,
          DansonForm,
          ChainLinkCodes<TLinks>
        >
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
        ): Effect.Effect<
          ClientValue<D['output'], ResultForm<undefined, TLinks>>,
          ClientError<
            D['errors'] | TLinkErrors,
            DansonForm,
            ChainLinkCodes<TLinks>
          >
        >;
      }
    : {
        subscribe(
          ...args: CallArgs<D['input'], SubscribeOptions<TContext>>
        ): Stream.Stream<
          ClientValue<D['output'], ResultForm<undefined, TLinks>>,
          ClientError<
            D['errors'] | TLinkErrors,
            DansonForm,
            ChainLinkCodes<TLinks>
          >
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
 * request.
 *
 * @example
 * ```ts
 * const client = createEffectClient({
 *   router: routerType<AppRouter>(),
 *   links: [httpLink({ url })],
 * });
 * const post = yield* client.post.byId.query({ id: '1' }).pipe(
 *   Effect.catchIf((e) => e.defined && e.code === 'NOT_FOUND', () => Effect.succeed(null)),
 * );
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createEffectClient<
  TSource,
  const TLinks extends ReadonlyArray<
    TrpcLink<any, RouterOf<TSource>> | PromiseLink<any, RouterOf<TSource>>
  >,
>(
  opts: TypedClientOptions<TSource, TLinks> & DuplicateSwitchCheck<TLinks>,
): EffectClient<RouterOf<TSource>, LinksContext<TLinks>, LinksTypes<TLinks>>;
export function createEffectClient(opts: TrpcClientOptions): unknown {
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
    const op = makeOperation(
      type,
      path.slice(0, -1).join('.'),
      input,
      splitCallOptions(callOpts),
    );
    const stream = Stream.suspend(() => runOperation(opts.links, op));
    return type === 'subscription' ? stream : firstValue(stream);
  });
}
