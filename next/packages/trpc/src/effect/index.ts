/**
 * Effect-native client: calls return an `Effect`, subscriptions a `Stream`.
 * The server side of Effect (Effect resolvers, `.provide()`, Effect Schema
 * inputs, the handler's `layer`) lives in `@trpc12/trpc/server`.
 *
 * @example
 * ```ts
 * import { createEffectClient } from '@trpc12/trpc/effect';
 *
 * const client = createEffectClient({
 *   router: routerType<AppRouter>(),
 *   links: [httpLink({ url })],
 * });
 * const program = Effect.gen(function* () {
 *   const post = yield* client.post.byId.query({ id: '1' });
 * });
 * ```
 * @module
 */
import { Effect, Stream } from 'effect';
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
  abortedBy,
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
  ContractAt,
  DecodedDef,
  DecodedForm,
  DecodedFormOf,
  Decodes,
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
import type {
  ClientValue,
  OutputForm,
  ProcedureType,
} from '../internal/types.ts';
import type {
  AnyProcedure,
  ProcedureDef,
  ProcedureDefOf,
  ProcedureTypeOf,
  Unlazy,
} from '../server/procedures/index.ts';

export { link };

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
  ? DecorateEffectDef<ProcedureDefOf<P>, ProcedureTypeOf<P>, TContext, TLinks>
  : never;

type DecorateEffectDef<
  D extends ProcedureDef,
  TType extends ProcedureType,
  TContext extends object,
  TLinks extends ChainTypes,
  TForm extends OutputForm | undefined = undefined,
> =
  Carries<TType, TLinks> extends false
    ? NoLinkCarries<TType>
    : DecorateEffectCarried<D, TType, TContext, TLinks, TForm>;

/** A query's or mutation's Effect for a streamed output, as on the Promise client. */
type StreamedEffect<V, E> = Effect.Effect<Streamed<V, E>, E>;

type DecorateEffectCarried<
  D extends ProcedureDef,
  TType extends ProcedureType,
  TContext extends object,
  TLinks extends ChainTypes,
  TForm extends OutputForm | undefined,
> = TType extends 'query'
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
            ClientValue<D['output'], ResultForm<TForm, TLinks>>,
            StreamedError<D, ResultForm<TForm, TLinks>, TLinks>
          >
        : Effect.Effect<
            ClientValue<D['output'], ResultForm<TForm, TLinks>>,
            | ClientError<
                D['errors'],
                ResultForm<TForm, TLinks>,
                UnstreamedLinkCodes<TLinks>
              >
            | DefinedError<ChainErrors<TLinks>>
          >;
    }
  : TType extends 'mutation'
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
              ClientValue<D['output'], ResultForm<TForm, TLinks>>,
              StreamedError<D, ResultForm<TForm, TLinks>, TLinks>
            >
          : Effect.Effect<
              ClientValue<D['output'], ResultForm<TForm, TLinks>>,
              | ClientError<
                  D['errors'],
                  ResultForm<TForm, TLinks>,
                  UnstreamedLinkCodes<TLinks>
                >
              | DefinedError<ChainErrors<TLinks>>
            >;
      }
    : {
        subscribe(
          ...args: CallArgs<D['input'], SubscribeOptions<TContext>>
        ): Stream.Stream<
          ClientValue<D['output'], ResultForm<TForm, TLinks>>,
          SubscriptionError<D, ResultForm<TForm, TLinks>, TLinks>
        >;
      };

/**
 * The Effect client for a router. Results follow the links' form, as on
 * the Promise client, and the schemas' types where a link decodes them.
 * @since 0.1.0
 * @stability stable
 */
export type EffectClient<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> = [Decodes<TLinks>] extends [never]
  ? EffectRouter<TRouter, TContext, TLinks>
  : DecodingEffectRouter<
      TRouter,
      Decodes<TLinks>,
      TContext,
      TLinks,
      ResultForm<undefined, TLinks>,
      DecodedFormOf<ResultForm<undefined, TLinks>>
    >;

type EffectRouter<
  TRouter,
  TContext extends object,
  TLinks extends ChainTypes,
> = {
  [K in keyof TRouter & string]: TRouter[K] extends AnyProcedure
    ? DecorateEffectProcedure<TRouter[K], TContext, TLinks>
    : EffectRouter<Unlazy<TRouter[K]>, TContext, TLinks>;
};

/** `DecodingRouter` (the Promise client's) for the Effect client. */
type DecodingEffectRouter<
  TRouter,
  C,
  TContext extends object,
  TLinks extends ChainTypes,
  F extends OutputForm,
  TDecoded extends OutputForm,
> = {
  [K in keyof TRouter & string]: TRouter[K] extends AnyProcedure
    ? DecorateEffectDef<
        DecodedDef<TRouter[K], ContractAt<C, K>, F>,
        ProcedureTypeOf<TRouter[K]>,
        TContext,
        TLinks,
        DecodedForm<TRouter[K], ContractAt<C, K>, F, TDecoded>
      >
    : DecodingEffectRouter<
        Unlazy<TRouter[K]>,
        ContractAt<C, K>,
        TContext,
        TLinks,
        F,
        TDecoded
      >;
};

const METHODS = {
  query: 'query',
  mutate: 'mutation',
  subscribe: 'subscription',
} as const;

/**
 * Creates a client whose calls are Effects. Interrupting the fiber aborts the
 * request; so does a query's or mutation's `signal`, failing it with
 * `ClientClosedRequest`, or `Timeout` for `AbortSignal.timeout()`'s. A
 * call fails with the same errors as the Promise client's, a
 * union of tagged errors: `Effect.catchTag` takes one failure out of it
 * by its `_tag` (`'ProcedureNotFound'`, a declared class's name, the
 * built-in `'NotFound'`). To take every error with a code, use
 * `Effect.catchIf(hasCode('NOT_FOUND'), …)`.
 *
 * @example
 * ```ts
 * const client = createEffectClient({
 *   router: routerType<AppRouter>(),
 *   links: [httpLink({ url })],
 * });
 * const post = yield* client.post.byId.query({ id: '1' }).pipe(
 *   Effect.catchTag('PostNotFound', () => Effect.succeed(null)),
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
    if (type === 'subscription') return stream;
    // Not every link reads `op.signal` (a batch or a socket doesn't), so the
    // call stops with it here, as the Promise client's run does.
    const signal = callOptions.signal;
    return signal
      ? Effect.raceFirst(firstValue(stream), abortedBy(signal))
      : firstValue(stream);
  });
}
